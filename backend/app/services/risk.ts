import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { getLatest, heldPositions } from '#services/poller'
import { getDailyBars, getSectors } from '#services/enrichment'
import { etClock } from '#services/market_hours'
import { trackedFetch } from '#services/api_usage'
import { callTool } from '#services/robinhood'
import { json } from '#services/portfolio'

const BENCHMARK = 'SPY'
const MIN_POINTS = 15 // fewer overlapping daily returns than this and beta/vol are noise
const STABLECOINS = new Set(['USDC', 'USDT', 'DAI'])
const HISTORY_DAYS = 7 * 365 // reaches back past the 2020 crash for the stress tests
// ponytail: fixed long-run assumptions for projections (T-bill ~4%, equity risk premium ~5%) —
// swap for a live T-bill yield if the gap to reality starts to matter.
const RISK_FREE = 0.04
const EQUITY_PREMIUM = 0.05
const SIMULATIONS = 5000

/** Real market episodes (SPY peak → trough), replayed with today's mix. */
export const EPISODES = [
  { name: 'COVID crash', from: '2020-02-19', to: '2020-03-23' },
  { name: '2022 bear market', from: '2022-01-03', to: '2022-10-12' },
  { name: 'Yen carry unwind', from: '2024-07-16', to: '2024-08-05' },
  { name: '2025 tariff shock', from: '2025-02-19', to: '2025-04-08' },
]

export type Holding = { symbol: string; type: 'equity' | 'crypto'; value: number; sector: string | null }
/** Daily closes keyed by 'YYYY-MM-DD', any order. */
export type Closes = Map<string, number>

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const std = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}
const cov = (a: number[], b: number[]) => {
  const ma = mean(a)
  const mb = mean(b)
  return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (a.length - 1)
}
const round = (x: number | null, d = 2) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
const minusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10)

/** Small seeded PRNG (mulberry32) so a projection is stable between page loads and testable. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

/** Annualized return, vol, Sharpe, Sortino and max drawdown of a daily return series. */
function stats(r: number[]) {
  if (r.length < MIN_POINTS) return null
  let level = 1
  let peak = 1
  let maxDrawdown = 0
  for (const x of r) {
    level *= 1 + x
    peak = Math.max(peak, level)
    maxDrawdown = Math.min(maxDrawdown, level / peak - 1)
  }
  const annualReturn = level ** (252 / r.length) - 1
  const vol = std(r) * Math.sqrt(252)
  const downside = Math.sqrt(mean(r.map((x) => Math.min(x, 0) ** 2))) * Math.sqrt(252)
  return {
    returnPct: round(annualReturn * 100, 1),
    volatilityPct: round(vol * 100, 1),
    sharpe: round((annualReturn - RISK_FREE) / vol),
    sortino: round(downside ? (annualReturn - RISK_FREE) / downside : null),
    maxDrawdownPct: round(maxDrawdown * 100, 1),
  }
}

/**
 * Monte Carlo: 5-day blocks bootstrapped from the portfolio's historical daily returns (keeps fat tails
 * and volatility clustering), demeaned, plus a CAPM drift (risk-free + β × equity premium). Trailing
 * returns are NOT the drift — a year where AMD tripled would otherwise project another one.
 */
export function project(daily: number[], beta: number, total: number, seed = 42) {
  if (daily.length < 60) return null
  const m = mean(daily)
  const drift = (RISK_FREE + beta * EQUITY_PREMIUM) / 252
  const sample = daily.map((x) => x - m + drift)
  const HORIZON = 252
  const BLOCK = 5
  const STEP = 5 // fan resolution in trading days
  const random = rng(seed)
  const atStep: number[][] = Array.from({ length: HORIZON / STEP + 1 }, () => [])
  const worstDrawdowns: number[] = []

  for (let s = 0; s < SIMULATIONS; s++) {
    let level = 1
    let peak = 1
    let dd = 0
    atStep[0].push(1)
    for (let d = 1; d <= HORIZON; ) {
      const start = Math.floor(random() * (sample.length - BLOCK))
      for (let k = 0; k < BLOCK && d <= HORIZON; k++, d++) {
        level *= 1 + sample[start + k]
        peak = Math.max(peak, level)
        dd = Math.min(dd, level / peak - 1)
        if (d % STEP === 0) atStep[d / STEP].push(level)
      }
    }
    worstDrawdowns.push(dd)
  }

  const bands = atStep.map((levels, i) => {
    const sorted = [...levels].sort((a, b) => a - b)
    const v = (q: number) => round(quantile(sorted, q) * total)
    return { day: i * STEP, p5: v(0.05), p25: v(0.25), p50: v(0.5), p75: v(0.75), p95: v(0.95) }
  })
  const horizon = (days: number, label: string) => {
    const sorted = [...atStep[Math.round(days / STEP)]].sort((a, b) => a - b)
    const share = (pred: (x: number) => boolean) => round((sorted.filter(pred).length / sorted.length) * 100, 0)
    return {
      label,
      days,
      p5: round(quantile(sorted, 0.05) * total),
      p50: round(quantile(sorted, 0.5) * total),
      p95: round(quantile(sorted, 0.95) * total),
      probLossPct: share((x) => x < 1),
      probDown10Pct: share((x) => x < 0.9),
      probDown20Pct: share((x) => x < 0.8),
    }
  }
  const dds = worstDrawdowns.sort((a, b) => a - b)
  return {
    horizons: [horizon(20, '1M'), horizon(65, '3M'), horizon(HORIZON, '1Y')],
    bands,
    // Deepest fall at some point during the year: typical path vs a 1-in-20 bad year.
    drawdownTypicalPct: round(quantile(dds, 0.5) * 100, 1),
    drawdownBadPct: round(quantile(dds, 0.05) * 100, 1),
    assumptions: {
      expectedReturnPct: round((RISK_FREE + beta * EQUITY_PREMIUM) * 100, 1),
      riskFreePct: RISK_FREE * 100,
      equityPremiumPct: EQUITY_PREMIUM * 100,
      volatilityPct: round(std(daily) * Math.sqrt(252) * 100, 1),
      sampleDays: daily.length,
      simulations: SIMULATIONS,
    },
  }
}

/** Pure risk math — everything the page shows, from holdings + their daily closes. */
export function computeRisk(holdings: Holding[], cash: number, closes: Map<string, Closes>, benchmark: Closes) {
  const total = holdings.reduce((s, h) => s + h.value, 0) + cash
  const calendar = [...benchmark.keys()].sort()
  const mkt = returnsOnCalendar(benchmark, calendar)
  // 1-year window for beta/vol/VaR/correlations; the full ~7 years feed stress tests and projections.
  const yearFrom = Math.max(1, calendar.findIndex((d) => d >= minusDays(calendar.at(-1) ?? '', 365)))
  const inYear = (i: number) => i >= yearFrom

  const positions = holdings
    .map((h) => {
      const stable = STABLECOINS.has(h.symbol)
      const r = stable ? calendar.map((_, i) => (i ? 0 : null)) : returnsOnCalendar(closes.get(h.symbol) ?? new Map(), calendar)
      const pairs = r.flatMap((x, i) => (inYear(i) && x !== null && mkt[i] !== null ? [[x, mkt[i]!]] : []))
      let beta: number | null = null
      let vol: number | null = null
      if (pairs.length >= MIN_POINTS) {
        const xs = pairs.map((p) => p[0])
        const ms = pairs.map((p) => p[1])
        beta = cov(xs, ms) / std(ms) ** 2
        vol = std(xs) * Math.sqrt(252)
      }
      // Beta for anything we couldn't measure: stablecoins 0, the rest assumed to move with the market.
      const betaUsed = beta ?? (stable ? 0 : 1)
      // Days before an asset's history starts are filled with β × market, so a 2020 replay still counts
      // PLTR (IPO'd Sep 2020) instead of treating it as cash. `proxied` tracks where that happened.
      const filled = r.map((x, i) => (x ?? (mkt[i] !== null ? betaUsed * mkt[i]! : 0)))
      return { ...h, weight: total ? h.value / total : 0, beta, betaUsed, vol, days: pairs.length, r, filled, stable }
    })
    .sort((a, b) => b.value - a.value)

  const portfolioAll = calendar.map((_, i) => positions.reduce((s, p) => s + p.weight * p.filled[i], 0))
  const portfolio = portfolioAll.slice(yearFrom)
  const market = mkt.slice(yearFrom).map((x) => x ?? 0)
  const dailyVol = portfolio.length >= MIN_POINTS ? std(portfolio) : null
  const beta = positions.reduce((s, p) => s + p.weight * p.betaUsed, 0)

  let peak = 1
  let level = 1
  let maxDrawdown = 0
  let worst = { day: calendar[yearFrom] ?? null, pct: 0 }
  portfolio.forEach((r, i) => {
    level *= 1 + r
    peak = Math.max(peak, level)
    maxDrawdown = Math.min(maxDrawdown, level / peak - 1)
    if (r < worst.pct) worst = { day: calendar[yearFrom + i], pct: r }
  })

  // Share of portfolio variance each position carries: w·cov(r_i, r_p) / var(r_p). Sums to 100%.
  const varP = dailyVol ? dailyVol ** 2 : 0
  const contribution = (p: (typeof positions)[number]) =>
    varP ? (p.weight * cov(p.filled.slice(yearFrom), portfolio)) / varP : null

  // Correlations among positions big enough to matter.
  const sized = positions.filter((p) => p.weight >= 0.02 && !p.stable)
  const pairs: { a: string; b: string; corr: number }[] = []
  for (let i = 0; i < sized.length; i++) {
    for (let j = i + 1; j < sized.length; j++) {
      const a = sized[i].filled.slice(yearFrom)
      const b = sized[j].filled.slice(yearFrom)
      const c = cov(a, b) / (std(a) * std(b))
      if (Number.isFinite(c)) pairs.push({ a: sized[i].symbol, b: sized[j].symbol, corr: c })
    }
  }
  // Σ wσ / σ_p: how much the mix's volatility is below the weighted average of its parts.
  const weightedVol = positions.reduce((s, p) => s + p.weight * std(p.filled.slice(yearFrom)), 0)
  const diversificationRatio = dailyVol ? weightedVol / dailyVol : null

  const stress = EPISODES.flatMap((e) => {
    const start = calendar.findIndex((d) => d >= e.from)
    const end = calendar.findLastIndex((d) => d <= e.to)
    if (start < 1 || end <= start) return []
    let pf = 1
    for (let i = start + 1; i <= end; i++) pf *= 1 + portfolioAll[i]
    const spy = benchmark.get(calendar[end])! / benchmark.get(calendar[start])! - 1
    const estimated = positions
      .filter((p) => !p.stable && p.r.slice(start + 1, end + 1).some((x) => x === null))
      .reduce((s, p) => s + p.weight, 0)
    return [
      {
        ...e,
        portfolioPct: round((pf - 1) * 100, 1),
        spyPct: round(spy * 100, 1),
        loss: round((pf - 1) * total),
        estimatedPct: round(estimated * 100, 0),
      },
    ]
  })

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
    window: { from: calendar[yearFrom] ?? null, to: calendar.at(-1) ?? null, days: portfolio.length },
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
      loss: round(positions.reduce((s, p) => s + p.value * p.betaUsed, 0) * (m / 100)),
    })),
    vsMarket: { portfolio: stats(portfolio), spy: stats(market), riskFreePct: RISK_FREE * 100 },
    projection: project(portfolioAll.slice(1), beta, total),
    stress,
    correlation: {
      topPairs: pairs
        .sort((x, y) => y.corr - x.corr)
        .slice(0, 6)
        .map((p) => ({ ...p, corr: round(p.corr) })),
      diversificationRatio: round(diversificationRatio),
      // What the mix's volatility would be if everything moved in lockstep, vs what it is.
      riskReductionPct: round(diversificationRatio ? (1 - 1 / diversificationRatio) * 100 : null, 0),
    },
    positions: positions.map((p) => ({
      symbol: p.symbol,
      type: p.type,
      sector: p.type === 'crypto' ? 'Crypto' : p.sector,
      value: round(p.value),
      weightPct: round(p.weight * 100, 1),
      riskPct: round(contribution(p) === null ? null : contribution(p)! * 100, 1),
      beta: round(p.beta),
      betaAssumed: p.beta === null ? p.betaUsed : null,
      volatilityPct: round(p.vol === null ? null : p.vol * 100, 1),
      days: p.days,
    })),
  }
}

export type EarningsReport = { date: string; timing: 'am' | 'pm' | null }

/**
 * How a stock moved on the trading day that priced in each past report: after-close (pm) reports hit
 * the next session, pre-market (am) ones the same day. Returns absolute % moves, newest first.
 */
export function earningsMoves(reports: EarningsReport[], closes: Closes, today: string) {
  const days = [...closes.keys()].sort()
  const moves: number[] = []
  for (const r of [...reports].filter((x) => x.date < today).sort((a, b) => b.date.localeCompare(a.date))) {
    const i = days.findIndex((d) => d >= r.date)
    if (i < 1) continue
    const [before, after] = r.timing === 'pm' && days[i] === r.date ? [i, i + 1] : [i - 1, i]
    if (after >= days.length) continue
    moves.push(Math.abs(closes.get(days[after])! / closes.get(days[before])! - 1) * 100)
  }
  return moves.slice(0, 8)
}

/** Next report within 60 days per held stock, with its typical earnings-day move and $ at stake. */
async function earningsAhead(holdings: Holding[], closes: Map<string, Closes>, total: number) {
  const today = new Date().toISOString().slice(0, 10)
  const horizon = minusDays(today, -60)
  const stocks = holdings.filter((h) => h.type === 'equity' && h.sector !== 'Funds & ETFs')
  const settled = await Promise.allSettled(
    stocks.map(async (h) => {
      const { data } = json(await callTool('get_earnings_results', { symbol: h.symbol }))
      const reports: EarningsReport[] = (data.results ?? [])
        .filter((x: any) => x.report?.date)
        .map((x: any) => ({ date: x.report.date, timing: x.report.timing ?? null }))
      const next = reports.filter((x) => x.date >= today && x.date <= horizon).sort((a, b) => a.date.localeCompare(b.date))[0]
      if (!next) return null
      const moves = earningsMoves(reports, closes.get(h.symbol) ?? new Map(), today)
      if (!moves.length) return null
      const avg = mean(moves)
      return {
        symbol: h.symbol,
        date: next.date,
        timing: next.timing,
        weightPct: round((h.value / total) * 100, 1),
        avgMovePct: round(avg, 1),
        maxMovePct: round(Math.max(...moves), 1),
        atStake: round((h.value * avg) / 100),
        reports: moves.length,
      }
    })
  )
  return settled
    .flatMap((s) => (s.status === 'fulfilled' && s.value ? [s.value] : []))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Crypto daily closes: Coinbase's public candles (free, no key, 300 per request) for real multi-year
 * history, topped up with our own snapshots for the latest days. Stablecoins are skipped.
 */
async function cryptoCloses(symbols: string[]): Promise<Map<string, Closes>> {
  const out = new Map<string, Closes>()
  const wanted = symbols.filter((s) => !STABLECOINS.has(s))
  for (const symbol of wanted) {
    const closes: Closes = new Map()
    for (let end = Date.now(); end > Date.now() - HISTORY_DAYS * 864e5; end -= 300 * 864e5) {
      const start = end - 300 * 864e5
      try {
        const res = await trackedFetch(
          'coinbase',
          `https://api.exchange.coinbase.com/products/${symbol}-USD/candles?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`,
          { headers: { 'user-agent': 'robinhood-dashboard' } }
        )
        const candles = res.ok ? await res.json() : null
        if (!Array.isArray(candles) || !candles.length) break // coin not listed that far back
        // [time, low, high, open, close, volume]
        for (const c of candles) closes.set(new Date(c[0] * 1000).toISOString().slice(0, 10), Number(c[4]))
      } catch {
        break
      }
    }
    out.set(symbol, closes)
  }

  if (!wanted.length) return out
  // Backfilled snapshots carry a flat placeholder crypto price — only real polls count.
  const rows = await db
    .from('position_snapshots as ps')
    .join('portfolio_snapshots as s', 's.id', 'ps.portfolio_snapshot_id')
    .where('ps.asset_type', 'crypto')
    .where('s.backfilled', false)
    .whereIn('ps.symbol', wanted)
    .orderBy('ps.created_at', 'asc')
    .select('ps.symbol', 'ps.price', 'ps.created_at')
  for (const r of rows) {
    const day = etClock(new Date(`${String(r.created_at).replace(' ', 'T')}Z`)).day
    const closes = out.get(r.symbol) ?? new Map()
    if (!closes.has(day)) closes.set(day, Number(r.price)) // Coinbase wins where both exist
    out.set(r.symbol, closes)
  }
  return out
}

type Risk = ReturnType<typeof computeRisk> & { earnings: Awaited<ReturnType<typeof earningsAhead>> }
// ponytail: in-memory 6h cache like getReferencePrices — daily bars and sectors barely move intraday.
let cache: { at: number; data: Risk } | null = null
let inflight: Promise<Risk> | null = null

export function getRisk(): Promise<Risk> {
  if (cache && Date.now() - cache.at < 6 * 3600e3) return Promise.resolve(cache.data)
  inflight ??= build().finally(() => (inflight = null))
  return inflight
}

/** Warm at boot and every 6h, so the page never waits on 7 years of bars + ~20 earnings lookups. */
export function startRisk() {
  const warm = () => getRisk().catch((err) => logger.error({ err }, '[risk] build failed'))
  warm()
  setInterval(warm, 6 * 3600e3 + 60_000)
}

async function build(): Promise<Risk> {
  const { equities, crypto } = await heldPositions()
  const cash = (await getLatest())?.balance.accounts.reduce((s, a) => s + a.cash, 0) ?? 0
  const equitySymbols = [...new Set(equities.map((p) => p.symbol))]

  const [bars, sectors, cryptoMap] = await Promise.all([
    getDailyBars([...new Set([...equitySymbols, BENCHMARK])], HISTORY_DAYS),
    getSectors(equitySymbols),
    cryptoCloses([...new Set(crypto.map((p) => p.symbol))]),
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

  const holdings = [...merged.values()].filter((h) => h.value > 0.5)
  const risk = computeRisk(holdings, cash, closes, closes.get(BENCHMARK) ?? new Map())
  const data = { ...risk, earnings: await earningsAhead(holdings, closes, risk.totalValue ?? 0) }
  if (data.window.days) cache = { at: Date.now(), data }
  logger.info(`[risk] built (${data.window.days}d window, ${data.stress.length} stress episodes)`)
  return data
}
