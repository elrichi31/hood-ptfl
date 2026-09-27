import db from '@adonisjs/lucid/services/db'
import { getLatest, heldPositions } from '#services/poller'
import { getDailyBars, getSectors } from '#services/enrichment'
import { etClock } from '#services/market_hours'

const BENCHMARK = 'SPY'
const MIN_POINTS = 15 // fewer overlapping daily returns than this and beta/vol are noise
const STABLECOINS = new Set(['USDC', 'USDT', 'DAI'])

export type Holding = { symbol: string; type: 'equity' | 'crypto'; value: number; sector: string | null }
/** Daily closes keyed by 'YYYY-MM-DD', any order. */
export type Closes = Map<string, number>

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const std = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}
const round = (x: number | null, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d)

/**
 * Returns on each benchmark trading day, from the last close on or before that day. Aligning
 * everything to SPY's calendar lets 7-day crypto and 5-day equities share one return series.
 */
function returnsOnCalendar(closes: Closes, calendar: string[]): (number | null)[] {
  const days = [...closes.keys()].sort()
  let j = -1
  const closeOn = calendar.map((d) => {
    while (j + 1 < days.length && days[j + 1] <= d) j++
    return j >= 0 ? closes.get(days[j])! : null
  })
  return calendar.map((_, i) => {
    const a = closeOn[i - 1]
    const b = closeOn[i]
    return i > 0 && a && b ? b / a - 1 : null
  })
}

/** Pure risk math — everything the page shows, from holdings + their daily closes. */
export function computeRisk(holdings: Holding[], cash: number, closes: Map<string, Closes>, benchmark: Closes) {
  const total = holdings.reduce((s, h) => s + h.value, 0) + cash
  const calendar = [...benchmark.keys()].sort()
  const mkt = returnsOnCalendar(benchmark, calendar)

  const positions = holdings
    .map((h) => {
      const r = STABLECOINS.has(h.symbol)
        ? calendar.map((_, i) => (i ? 0 : null))
        : returnsOnCalendar(closes.get(h.symbol) ?? new Map(), calendar)
      const pairs = r.flatMap((x, i) => (x !== null && mkt[i] !== null ? [[x, mkt[i]!]] : []))
      let beta: number | null = null
      let vol: number | null = null
      if (pairs.length >= MIN_POINTS) {
        const xs = pairs.map((p) => p[0])
        const ms = pairs.map((p) => p[1])
        const mx = mean(xs)
        const mm = mean(ms)
        const cov = pairs.reduce((s, [x, m]) => s + (x - mx) * (m - mm), 0) / (pairs.length - 1)
        beta = cov / std(ms) ** 2
        vol = std(xs) * Math.sqrt(252)
      }
      return { ...h, weight: total ? h.value / total : 0, beta, vol, days: pairs.length, r }
    })
    .sort((a, b) => b.value - a.value)

  // Today's mix replayed over the past year. ponytail: an asset contributes 0 on days before its
  // history starts (crypto only has our own ~snapshot history), so early-window vol is understated.
  const portfolio = calendar
    .map((_, i) => positions.reduce((s, p) => s + p.weight * (p.r[i] ?? 0), 0))
    .slice(1)
  const dailyVol = portfolio.length >= MIN_POINTS ? std(portfolio) : null

  let peak = 1
  let level = 1
  let maxDrawdown = 0
  let worst = { day: calendar[1] ?? null, pct: 0 }
  portfolio.forEach((r, i) => {
    level *= 1 + r
    peak = Math.max(peak, level)
    maxDrawdown = Math.min(maxDrawdown, level / peak - 1)
    if (r < worst.pct) worst = { day: calendar[i + 1], pct: r }
  })

  // Beta for anything we couldn't measure: stablecoins/cash 0, the rest assumed to move with the market.
  const betaOf = (p: (typeof positions)[number]) => p.beta ?? (STABLECOINS.has(p.symbol) ? 0 : 1)
  const beta = positions.reduce((s, p) => s + p.weight * betaOf(p), 0)

  const sectorValue = new Map<string, number>()
  for (const p of positions) {
    const key = p.type === 'crypto' ? 'Crypto' : (p.sector ?? 'Other')
    sectorValue.set(key, (sectorValue.get(key) ?? 0) + p.value)
  }
  if (cash > 0) sectorValue.set('Cash', cash)

  const weights = positions.map((p) => p.weight)
  return {
    totalValue: round(total),
    cash: round(cash),
    window: { from: calendar[0] ?? null, to: calendar.at(-1) ?? null, days: portfolio.length },
    concentration: {
      holdings: positions.length,
      top1: positions[0] ? { symbol: positions[0].symbol, pct: round(positions[0].weight * 100, 1) } : null,
      top3Pct: round(weights.slice(0, 3).reduce((s, w) => s + w, 0) * 100, 1),
      // 1/Σw² — "you're as diversified as N equal-sized positions".
      effectivePositions: round(1 / weights.reduce((s, w) => s + w * w, 0) || 0, 1),
    },
    sectors: [...sectorValue]
      .map(([sector, value]) => ({ sector, value: round(value), pct: round((value / total) * 100, 1) }))
      .sort((a, b) => b.value! - a.value!),
    beta: round(beta),
    volatilityPct: round(dailyVol === null ? null : dailyVol * Math.sqrt(252) * 100, 1),
    // Parametric 1-day 95% VaR: a normal day loses less than this 19 times out of 20.
    var95: round(dailyVol === null ? null : 1.645 * dailyVol * total),
    maxDrawdownPct: round(maxDrawdown * 100, 1),
    worstDay: worst.day ? { day: worst.day, pct: round(worst.pct * 100, 2), loss: round(worst.pct * total) } : null,
    scenarios: [-5, -10, -20].map((m) => ({
      marketPct: m,
      loss: round(positions.reduce((s, p) => s + p.value * betaOf(p), 0) * (m / 100)),
    })),
    positions: positions.map((p) => ({
      symbol: p.symbol,
      type: p.type,
      sector: p.type === 'crypto' ? 'Crypto' : p.sector,
      value: round(p.value),
      weightPct: round(p.weight * 100, 1),
      beta: round(p.beta),
      betaAssumed: p.beta === null ? betaOf(p) : null,
      volatilityPct: round(p.vol === null ? null : p.vol * 100, 1),
      days: p.days,
    })),
  }
}

/** Crypto has no historicals in Robinhood's MCP — rebuild daily closes (last price per ET day) from our snapshots. */
async function cryptoCloses(symbols: string[]): Promise<Map<string, Closes>> {
  const out = new Map<string, Closes>()
  if (!symbols.length) return out
  // Backfilled snapshots carry a flat placeholder crypto price — only real polls count.
  const rows = await db
    .from('position_snapshots as ps')
    .join('portfolio_snapshots as s', 's.id', 'ps.portfolio_snapshot_id')
    .where('ps.asset_type', 'crypto')
    .where('s.backfilled', false)
    .whereIn('ps.symbol', symbols)
    .orderBy('ps.created_at', 'asc')
    .select('ps.symbol', 'ps.price', 'ps.created_at')
  for (const r of rows) {
    const day = etClock(new Date(`${String(r.created_at).replace(' ', 'T')}Z`)).day
    if (!out.has(r.symbol)) out.set(r.symbol, new Map())
    out.get(r.symbol)!.set(day, Number(r.price))
  }
  return out
}

// ponytail: in-memory 6h cache like getReferencePrices — daily bars and sectors barely move intraday.
let cache: { at: number; data: ReturnType<typeof computeRisk> } | null = null

export async function getRisk() {
  if (cache && Date.now() - cache.at < 6 * 3600e3) return cache.data
  const { equities, crypto } = await heldPositions()
  const cash = (await getLatest())?.balance.accounts.reduce((s, a) => s + a.cash, 0) ?? 0
  const equitySymbols = [...new Set(equities.map((p) => p.symbol))]

  const [bars, sectors, cryptoMap] = await Promise.all([
    getDailyBars([...new Set([...equitySymbols, BENCHMARK])]),
    getSectors(equitySymbols),
    cryptoCloses(crypto.map((p) => p.symbol)),
  ])
  const closes = new Map<string, Closes>(cryptoMap)
  for (const [symbol, b] of bars) closes.set(symbol, new Map(b.map((x) => [x.day, x.c])))

  // Same symbol in two accounts shows up twice — merge before weighting.
  const merged = new Map<string, Holding>()
  for (const [type, list] of [['equity', equities], ['crypto', crypto]] as const) {
    for (const p of list) {
      const h = merged.get(p.symbol) ?? { symbol: p.symbol, type, value: 0, sector: sectors.get(p.symbol) ?? null }
      h.value += p.value
      merged.set(p.symbol, h)
    }
  }

  const data = computeRisk(
    [...merged.values()].filter((h) => h.value > 0.5),
    cash,
    closes,
    closes.get(BENCHMARK) ?? new Map()
  )
  if (data.window.days) cache = { at: Date.now(), data }
  return data
}
