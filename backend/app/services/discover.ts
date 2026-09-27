import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { heldPositions } from '#services/poller'
import { trackedFetch } from '#services/api_usage'
import { callTool } from '#services/robinhood'
import { json } from '#services/portfolio'
import { getDailyBars, getFundamentals, numOrNull } from '#services/enrichment'
import { getRisk, returnsOnCalendar } from '#services/risk'

/**
 * Discover: stocks and funds you don't own, from three sources — your own Robinhood watchlists, Finnhub
 * peers of your holdings, and Robinhood's "100 most popular" filtered to what diversifies you — scored
 * on analyst conviction, fundamentals and, above all, how they'd fit the portfolio you already have.
 * Robinhood (free, batched) supplies prices, targets, fundamentals and daily bars; Finnhub (throttled)
 * supplies profiles, metrics, earnings surprises and insider sentiment. Built in the background daily.
 */
const MAX_PEERS = 25
const MAX_WATCHLIST = 30
const MAX_DIVERSIFIERS = 12
const CALL_GAP_MS = 1500 // ~40/min, leaves room under Finnhub's 60/min for the news poll
const REFRESH_MS = 24 * 3600 * 1000
const FIT_WEIGHT = 0.05 // "what if this became 5% of the portfolio"

export type Source = 'watchlist' | 'peer' | 'diversifier'

export type Fit = {
  /** Daily-return correlation with your portfolio over the last year. */
  corr: number
  beta: number
  volatilityPct: number
  /** Daily σ of the candidate and its daily covariance with the portfolio — for the client-side simulator. */
  sigma: number
  cov: number
  /** Change in the portfolio's annualized volatility (percentage points) if it became 5% of it. */
  deltaVolAt5: number
}

export type DiscoverItem = {
  symbol: string
  name: string
  description: string | null
  logo: string | null
  kind: 'stock' | 'fund'
  industry: string | null
  sector: string | null
  newIndustry: boolean
  sources: Source[]
  watchlists: string[]
  peerOf: string[]
  price: number | null
  changePct: number | null
  marketCap: number | null
  pe: number | null
  dividendYield: number | null
  revenueGrowth: number | null
  netMargin: number | null
  return52w: number | null
  fromHigh: number | null
  analysts: { total: number; buyPct: number; buy: number; hold: number; sell: number } | null
  target: { low: number; mean: number; high: number; upsidePct: number } | null
  earnings: { quarters: number; beats: number; avgSurprisePct: number } | null
  mspr: number | null
  fit: Fit | null
  /** Weekly closes over the last year, indexed to 100 — same days as `portfolio.spark`. */
  spark: number[]
  score: number
}

export type PortfolioContext = {
  total: number
  beta: number
  sigma: number
  volatilityPct: number
  sectors: { sector: string; pct: number }[]
  spark: number[]
}

type State = {
  status: 'idle' | 'building' | 'ready'
  builtAt: string | null
  items: DiscoverItem[]
  portfolio: PortfolioContext | null
}
let state: State = { status: 'idle', builtAt: null, items: [], portfolio: null }

export const getDiscover = () => state

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const num = numOrNull
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const round = (x: number | null, d = 2) =>
  x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d

/** Throttled Finnhub GET; one retry after a 429. Null on any failure so one bad symbol can't sink the build. */
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

const chunks = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/**
 * How a candidate would sit next to the portfolio: correlation, beta vs SPY, and the change in portfolio
 * volatility if it became `w` of it (new money: σ² = (1−w)²σp² + w²σc² + 2w(1−w)·cov).
 */
export function fitOf(
  candidate: (number | null)[],
  portfolio: number[],
  market: number[],
  w = FIT_WEIGHT
): Fit | null {
  const idx = candidate.flatMap((x, i) => (x === null ? [] : [i]))
  if (idx.length < 60) return null
  const c = idx.map((i) => candidate[i]!)
  const p = idx.map((i) => portfolio[i])
  const m = idx.map((i) => market[i])
  const cov = (a: number[], b: number[]) => {
    const ma = mean(a)
    const mb = mean(b)
    return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (a.length - 1)
  }
  const sc = Math.sqrt(cov(c, c))
  const sp = Math.sqrt(cov(p, p))
  const cp = cov(c, p)
  const after = Math.sqrt((1 - w) ** 2 * sp ** 2 + w ** 2 * sc ** 2 + 2 * w * (1 - w) * cp)
  return {
    corr: round(cp / (sc * sp))!,
    beta: round(cov(c, m) / cov(m, m))!,
    volatilityPct: round(sc * Math.sqrt(252) * 100, 1)!,
    sigma: sc,
    cov: cp,
    deltaVolAt5: round((after - sp) * Math.sqrt(252) * 100)!,
  }
}

/**
 * 0–100 blend: portfolio fit 25 (low correlation), analyst conviction 25, upside to target 10, growth 15,
 * margin 10, earnings track record 15. Missing inputs score neutral, so funds (no analysts/earnings)
 * compete on fit. ponytail: hand-weighted — the UI re-sorts by any single column if this feels off.
 */
export function scoreItem(i: Omit<DiscoverItem, 'score'>) {
  const fit = i.fit ? clamp(1 - i.fit.corr, 0, 1) : 0.5
  const analyst = i.analysts ? i.analysts.buyPct : 0.5
  const upside = i.target ? clamp(i.target.upsidePct / 30, 0, 1) : 0.5
  const growth = i.revenueGrowth === null ? 0.5 : clamp((i.revenueGrowth + 10) / 50, 0, 1) // -10%..40%
  const margin = i.netMargin === null ? 0.5 : clamp(i.netMargin / 25, 0, 1) // 0..25%
  const track = i.earnings ? i.earnings.beats / i.earnings.quarters : 0.5
  return Math.round(fit * 25 + analyst * 25 + upside * 10 + growth * 15 + margin * 10 + track * 15)
}

/** Every stock/ETF symbol on the user's own watchlists (not options), with the list names it's on. */
async function watchlistSymbols(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const lists = (json(await callTool('get_watchlists')).data.watchlists ?? []).filter(
    (l: any) => l.item_count > 0 && (l.allowed_object_types ?? []).includes('instrument')
  )
  for (const l of lists) {
    const { data } = json(await callTool('get_watchlist_items', { list_id: l.id }))
    for (const it of data.items ?? []) {
      if (it.object_type !== 'instrument' || !it.symbol) continue
      out.set(it.symbol, [...(out.get(it.symbol) ?? []), l.display_name])
    }
  }
  return out
}

async function popularSymbols(): Promise<string[]> {
  const lists = json(await callTool('get_popular_watchlists')).data.lists ?? []
  const top = lists.find((l: any) => /100 most popular/i.test(l.display_name))
  if (!top) return []
  const { data } = json(await callTool('get_watchlist_items', { list_id: top.id }))
  return (data.items ?? [])
    .filter((i: any) => i.object_type === 'instrument' && i.symbol)
    .map((i: any) => i.symbol)
}

async function build(): Promise<State> {
  const { equities } = await heldPositions()
  const held = new Set(equities.map((p) => p.symbol))
  const risk = await getRisk()
  const days = risk.series.days
  const pSeries = risk.series.portfolio
  const mSeries = risk.series.market

  // 1. Candidate pool from the three sources.
  const [watch, popular] = await Promise.all([
    watchlistSymbols().catch(() => new Map<string, string[]>()),
    popularSymbols().catch(() => [] as string[]),
  ])
  const peerOf = new Map<string, string[]>()
  const heldIndustries = new Set<string>()
  for (const symbol of held) {
    const peers = await fh(`/stock/peers?symbol=${symbol}`)
    const profile = await fh(`/stock/profile2?symbol=${symbol}`)
    if (profile?.finnhubIndustry) heldIndustries.add(profile.finnhubIndustry)
    for (const p of Array.isArray(peers) ? peers : []) {
      if (held.has(p) || !/^[A-Z.]{1,6}$/.test(p)) continue
      peerOf.set(p, [...(peerOf.get(p) ?? []), symbol])
    }
  }
  const peers = [...peerOf]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_PEERS)
    .map(([s]) => s)
  const watchlist = [...watch.keys()].filter((s) => !held.has(s)).slice(0, MAX_WATCHLIST)
  const pool = [...new Set([...watchlist, ...peers, ...popular.filter((s) => !held.has(s))])]

  // 2. Robinhood, batched and free: bars, fundamentals, quotes, analyst ratings for the whole pool.
  const [bars, fundamentals] = await Promise.all([getDailyBars(pool, 380, 'all'), getFundamentals(pool)])
  const quotes = new Map<string, any>()
  const ratings = new Map<string, any>()
  for (const batch of chunks(pool, 10)) {
    const [q, r] = await Promise.all([
      callTool('get_equity_quotes', { symbols: batch })
        .then((x) => json(x).data.results ?? [])
        .catch(() => []),
      callTool('get_equity_analyst_ratings', { symbols: batch })
        .then((x) => json(x).data.results ?? [])
        .catch(() => []),
    ])
    for (const x of q) if (x?.quote?.symbol) quotes.set(x.quote.symbol, x.quote)
    // Positional, aligned with the requested symbols.
    r.forEach((x: any, i: number) => x?.ratings && ratings.set(batch[i], x.ratings))
  }
  const fits = new Map<string, Fit>()
  for (const s of pool) {
    const closes = new Map((bars.get(s) ?? []).map((b) => [b.day, b.c]))
    const f = fitOf(returnsOnCalendar(closes, days), pSeries, mSeries)
    if (f) fits.set(s, f)
  }

  // 3. Diversifiers: popular names that aren't already a peer/watchlist pick, biggest drop in your volatility first
  //    (not lowest correlation: a calm bond fund at 0.26 lowers it more than a wild stock at 0.0).
  //    Funds always qualify; stocks need real analyst coverage so low-correlation junk doesn't float up.
  const covered = (s: string) => {
    const r = ratings.get(s)
    return r ? r.num_buy_ratings + r.num_hold_ratings + r.num_sell_ratings >= 5 : false
  }
  const diversifiers = popular
    .filter((s) => !held.has(s) && !watch.has(s) && !peerOf.has(s) && fits.has(s))
    .filter((s) => fundamentals.get(s)?.fund || covered(s))
    .sort((a, b) => fits.get(a)!.deltaVolAt5 - fits.get(b)!.deltaVolAt5)
    .slice(0, MAX_DIVERSIFIERS)

  // 4. Finnhub enrichment (stocks only — it has no ETF coverage on the free tier), then assemble.
  const weekly = (i: number) => i % 5 === 0 || i === days.length - 1
  const spark = (closes: Map<string, number>) => {
    const r = returnsOnCalendar(closes, days)
    let level = 100
    return r.flatMap((x, i) => ((level *= 1 + (x ?? 0)), weekly(i) ? [round(level, 1)!] : []))
  }
  const items: DiscoverItem[] = []
  for (const symbol of [...new Set([...watchlist, ...peers, ...diversifiers])]) {
    const f = fundamentals.get(symbol)
    const fund = Boolean(f?.fund)
    const profile = fund ? null : await fh(`/stock/profile2?symbol=${symbol}`)
    if (!fund && !profile?.ticker && !watch.has(symbol)) continue // delisted / no coverage (keep watchlist picks)
    const [metric, earnings, sentiment] = fund
      ? [null, null, null]
      : [
          await fh(`/stock/metric?symbol=${symbol}&metric=all`),
          await fh(`/stock/earnings?symbol=${symbol}`),
          await fh(
            `/stock/insider-sentiment?symbol=${symbol}&from=${new Date(Date.now() - 92 * 864e5).toISOString().slice(0, 10)}`
          ),
        ]
    const m = metric?.metric ?? {}
    const q = quotes.get(symbol)
    const price = num(q?.last_trade_price)
    const prev = num(q?.adjusted_previous_close)
    const r = ratings.get(symbol)
    const total = r ? r.num_buy_ratings + r.num_hold_ratings + r.num_sell_ratings : 0
    const targetMean = num(r?.mean_price_target)
    const surprises = (Array.isArray(earnings) ? earnings : [])
      .slice(0, 4)
      .filter((e: any) => num(e.surprisePercent) !== null)
    const months = (Array.isArray(sentiment?.data) ? sentiment.data : []).filter((x: any) =>
      Number.isFinite(x.mspr)
    )
    const high = num(m['52WeekHigh']) ?? f?.high52w ?? null
    const industry = profile?.finnhubIndustry || (fund ? 'ETF' : null)
    const barsOf = new Map((bars.get(symbol) ?? []).map((b) => [b.day, b.c]))
    const sources: Source[] = []
    if (watch.has(symbol)) sources.push('watchlist')
    if (peerOf.has(symbol)) sources.push('peer')
    if (diversifiers.includes(symbol)) sources.push('diversifier')

    const base: Omit<DiscoverItem, 'score'> = {
      symbol,
      name: profile?.name ?? symbol,
      description: f?.description ?? null,
      logo: profile?.logo || null,
      kind: fund ? 'fund' : 'stock',
      industry,
      sector: f?.sector ?? null,
      newIndustry: !fund && Boolean(industry) && !heldIndustries.has(industry!),
      sources,
      watchlists: watch.get(symbol) ?? [],
      peerOf: peerOf.get(symbol) ?? [],
      price,
      changePct: price && prev ? round(((price - prev) / prev) * 100) : null,
      marketCap: num(profile?.marketCapitalization) ?? (f?.marketCap ? f.marketCap / 1e6 : null), // millions USD
      pe: num(m.peTTM) ?? f?.pe ?? null,
      dividendYield: f?.dividendYield ?? null,
      revenueGrowth: num(m.revenueGrowthTTMYoy),
      netMargin: num(m.netProfitMarginTTM),
      return52w:
        num(m['52WeekPriceReturnDaily']) ??
        (spark(barsOf).length > 1 ? round(spark(barsOf).at(-1)! - 100, 1) : null),
      fromHigh: price && high ? round(((price - high) / high) * 100, 1) : null,
      analysts: total
        ? {
            total,
            buyPct: r.num_buy_ratings / total,
            buy: r.num_buy_ratings,
            hold: r.num_hold_ratings,
            sell: r.num_sell_ratings,
          }
        : null,
      target:
        targetMean && price
          ? {
              low: num(r.low_price_target)!,
              mean: targetMean,
              high: num(r.high_price_target)!,
              upsidePct: round(((targetMean - price) / price) * 100, 1)!,
            }
          : null,
      earnings: surprises.length
        ? {
            quarters: surprises.length,
            beats: surprises.filter((e: any) => e.surprisePercent > 0).length,
            avgSurprisePct: round(mean(surprises.map((e: any) => Number(e.surprisePercent))), 1)!,
          }
        : null,
      mspr: months.length ? round(mean(months.map((x: any) => x.mspr)), 1) : null,
      fit: fits.get(symbol) ?? null,
      spark: spark(barsOf),
    }
    items.push({ ...base, score: scoreItem(base) })
  }

  let level = 100
  const portfolioSpark = pSeries.flatMap(
    (x, i) => ((level *= 1 + x), weekly(i) ? [round(level, 1)!] : [])
  )
  const pMean = mean(pSeries)
  const sigma = Math.sqrt(pSeries.reduce((s, x) => s + (x - pMean) ** 2, 0) / (pSeries.length - 1))
  return {
    status: 'ready',
    builtAt: new Date().toISOString(),
    items: items.sort((a, b) => b.score - a.score),
    portfolio: {
      total: risk.totalValue ?? 0,
      beta: risk.beta ?? 1,
      sigma,
      volatilityPct: round(sigma * Math.sqrt(252) * 100, 1)!,
      sectors: risk.sectors.map((s) => ({ sector: s.sector, pct: s.pct ?? 0 })),
      spark: portfolioSpark,
    },
  }
}

async function refresh() {
  if (state.status === 'building') return
  state = { ...state, status: 'building' }
  try {
    state = await build()
    logger.info(`[discover] built ${state.items.length} candidates`)
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
