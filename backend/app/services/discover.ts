import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { heldPositions } from '#services/poller'
import { trackedFetch } from '#services/api_usage'

/**
 * Discover: stocks you don't own that Finnhub lists as peers of stocks you do, enriched with free-tier
 * data (analyst consensus, fundamentals, quote, earnings surprises). Built in the background — ~4
 * calls per candidate — and served from memory.
 */
const MAX_CANDIDATES = 40
const CALL_GAP_MS = 1500 // ~40/min, leaves room under Finnhub's 60/min for the news poll
const REFRESH_MS = 24 * 3600 * 1000

export type DiscoverItem = {
  symbol: string
  name: string
  logo: string | null
  industry: string | null
  newIndustry: boolean
  peerOf: string[]
  price: number | null
  changePct: number | null
  marketCap: number | null
  pe: number | null
  revenueGrowth: number | null
  netMargin: number | null
  return52w: number | null
  fromHigh: number | null
  analysts: { total: number; buyPct: number; strongBuy: number; buy: number; hold: number; sell: number } | null
  lastSurprisePct: number | null
  score: number
}

let state: { status: 'idle' | 'building' | 'ready'; builtAt: string | null; items: DiscoverItem[] } = {
  status: 'idle',
  builtAt: null,
  items: [],
}

export const getDiscover = () => state

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Throttled GET; one retry after a 429. Returns null on any failure so one bad symbol can't sink the build. */
async function fh(path: string): Promise<any | null> {
  const url = `https://finnhub.io/api/v1${path}${path.includes('?') ? '&' : '?'}token=${env.get('FINNHUB_API_KEY')}`
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(CALL_GAP_MS)
    try {
      const res = await trackedFetch('finnhub', url)
      if (res.status === 429) {
        await sleep(10_000)
        continue
      }
      return res.ok ? await res.json() : null
    } catch {
      return null
    }
  }
  return null
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/**
 * 0–100 blend of what's worth a look: analyst conviction, growth, not-bleeding, how many of your
 * holdings it's tied to. ponytail: hand-weighted heuristic, not a model — the UI lets you re-sort by
 * any single column, so tune the weights only if the default order keeps feeling wrong.
 */
export function scoreItem(i: Omit<DiscoverItem, 'score'>) {
  const analyst = i.analysts ? i.analysts.buyPct : 0.5
  const growth = i.revenueGrowth === null ? 0.5 : clamp((i.revenueGrowth + 10) / 50, 0, 1) // -10%..40%
  const margin = i.netMargin === null ? 0.5 : clamp(i.netMargin / 25, 0, 1) // 0..25%
  const overlap = clamp(i.peerOf.length / 3, 0, 1)
  return Math.round(analyst * 40 + growth * 25 + margin * 15 + overlap * 20)
}

async function build() {
  const { equities } = await heldPositions()
  const held = new Set(equities.map((p) => p.symbol))

  // Peers of every held stock (ETFs come back empty or self-only), counted by how many holdings share them.
  const peerOf = new Map<string, string[]>()
  const heldIndustries = new Set<string>()
  for (const symbol of held) {
    const [peers, profile] = [await fh(`/stock/peers?symbol=${symbol}`), await fh(`/stock/profile2?symbol=${symbol}`)]
    if (profile?.finnhubIndustry) heldIndustries.add(profile.finnhubIndustry)
    for (const p of Array.isArray(peers) ? peers : []) {
      if (held.has(p) || !/^[A-Z.]{1,6}$/.test(p)) continue
      peerOf.set(p, [...(peerOf.get(p) ?? []), symbol])
    }
  }

  const candidates = [...peerOf].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_CANDIDATES)
  const items: DiscoverItem[] = []
  for (const [symbol, of] of candidates) {
    const profile = await fh(`/stock/profile2?symbol=${symbol}`)
    if (!profile?.ticker) continue // delisted / no coverage
    const [rec, metric, quote, earnings] = [
      await fh(`/stock/recommendation?symbol=${symbol}`),
      await fh(`/stock/metric?symbol=${symbol}&metric=all`),
      await fh(`/quote?symbol=${symbol}`),
      await fh(`/stock/earnings?symbol=${symbol}`),
    ]
    const r = Array.isArray(rec) ? rec[0] : null
    const total = r ? r.strongBuy + r.buy + r.hold + r.sell + r.strongSell : 0
    const m = metric?.metric ?? {}
    const price = num(quote?.c) || null
    const high = num(m['52WeekHigh'])
    const base = {
      symbol,
      name: profile.name ?? symbol,
      logo: profile.logo || null,
      industry: profile.finnhubIndustry || null,
      newIndustry: Boolean(profile.finnhubIndustry) && !heldIndustries.has(profile.finnhubIndustry),
      peerOf: of,
      price,
      changePct: num(quote?.dp),
      marketCap: num(profile.marketCapitalization), // millions USD
      pe: num(m.peTTM),
      revenueGrowth: num(m.revenueGrowthTTMYoy),
      netMargin: num(m.netProfitMarginTTM),
      return52w: num(m['52WeekPriceReturnDaily']),
      fromHigh: price && high ? ((price - high) / high) * 100 : null,
      analysts: total
        ? {
            total,
            buyPct: (r.strongBuy + r.buy) / total,
            strongBuy: r.strongBuy,
            buy: r.buy,
            hold: r.hold,
            sell: r.sell + r.strongSell,
          }
        : null,
      lastSurprisePct: Array.isArray(earnings) ? num(earnings[0]?.surprisePercent) : null,
    }
    items.push({ ...base, score: scoreItem(base) })
  }
  return items.sort((a, b) => b.score - a.score)
}

async function refresh() {
  if (state.status === 'building') return
  state = { ...state, status: 'building' }
  try {
    const items = await build()
    state = { status: 'ready', builtAt: new Date().toISOString(), items }
    logger.info(`[discover] built ${items.length} candidates`)
  } catch (err) {
    logger.error({ err }, '[discover] build failed')
    state = { ...state, status: state.items.length ? 'ready' : 'idle' }
  }
}

export function startDiscover() {
  if (!env.get('FINNHUB_API_KEY')) return
  refresh()
  setInterval(refresh, REFRESH_MS)
}
