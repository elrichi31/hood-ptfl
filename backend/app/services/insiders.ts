import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { heldPositions } from '#services/poller'
import { trackedFetch } from '#services/api_usage'

/**
 * Insider trades (SEC Form 4, via Finnhub's free tier) in held stocks. Only open-market buys (P) and
 * sales (S) — option exercises, grants, tax withholding and gifts aren't decisions about the stock.
 */
const WINDOW_DAYS = 90
const CALL_GAP_MS = 300

export type InsiderTrade = {
  symbol: string
  name: string
  side: 'buy' | 'sell'
  date: string
  filingDate: string
  shares: number
  avgPrice: number
  value: number
  /** Share of the insider's stake this trade represents (sells: of what they held before). */
  pctOfStake: number | null
  /** When this service first saw the filing — Finnhub only gives a date, the bell needs a moment. */
  seenAt?: string
}

export type InsiderSummary = {
  symbol: string
  bought: number
  sold: number
  buyers: number
  sellers: number
  /** Finnhub's Monthly Share Purchase Ratio averaged over the window, -100 (all selling) .. 100 (all buying). */
  mspr: number | null
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fh(path: string): Promise<any | null> {
  await sleep(CALL_GAP_MS)
  try {
    const res = await trackedFetch('finnhub', `https://finnhub.io/api/v1${path}&token=${env.get('FINNHUB_API_KEY')}`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/** One Form 4 filing can list a sale as a dozen lines at different prices — fold them into one trade. */
export function foldTrades(rows: any[], since: string): InsiderTrade[] {
  const groups = new Map<string, any[]>()
  for (const r of rows) {
    if (r.isDerivative || (r.transactionCode !== 'P' && r.transactionCode !== 'S')) continue
    if (!r.transactionDate || r.transactionDate < since || !r.change) continue
    const key = `${r.id}|${r.name}|${r.transactionCode}|${r.transactionDate}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.values()].map((g) => {
    const shares = g.reduce((s, r) => s + Math.abs(r.change), 0)
    const value = g.reduce((s, r) => s + Math.abs(r.change) * (r.transactionPrice || 0), 0)
    const buy = g[0].transactionCode === 'P'
    // `share` is the position after that line. Walked in trade order, one account's lines chain exactly
    // (each = previous ± its change). Filings that mix accounts (e.g. Zuckerberg's CZI entities) don't,
    // and their min/max says nothing about the whole stake — a 0 there read as "sold 100%".
    const chain = [...g].sort((a, b) => (buy ? a.share - b.share : b.share - a.share))
    const oneAccount = chain.every(
      (r, i) => i === 0 || Math.abs(chain[i - 1].share + r.change - r.share) <= 1
    )
    const after = oneAccount ? (chain.at(-1)!.share ?? 0) : 0
    const before = buy ? after - shares : after + shares
    const pct = buy ? (after > 0 ? shares / after : null) : before > 0 ? shares / before : null
    return {
      symbol: g[0].symbol,
      name: g[0].name,
      side: buy ? 'buy' : 'sell',
      date: g[0].transactionDate,
      filingDate: g[0].filingDate,
      shares,
      avgPrice: shares ? value / shares : 0,
      value,
      pctOfStake: oneAccount && pct !== null ? pct * 100 : null,
    }
  })
}

// ponytail: in-memory 6h cache — Form 4s land at most a few times a day per company.
type Activity = { trades: InsiderTrade[]; summary: InsiderSummary[] }
// ponytail: in memory, so a restart re-dates recent filings to boot time (the bell may re-ring once).
const seenAt = new Map<string, string>()
let cache: { at: number; data: Activity } | null = null
let inflight: Promise<Activity> | null = null

/** Cached; concurrent callers (the Alerts page + the bell) share one build instead of racing two. */
export function getInsiderActivity(): Promise<Activity> {
  if (cache && Date.now() - cache.at < 6 * 3600e3) return Promise.resolve(cache.data)
  inflight ??= build().finally(() => (inflight = null))
  return inflight
}

/** Warm at boot and every 6h, so page loads never wait on ~40 Finnhub calls. */
export function startInsiders() {
  if (!env.get('FINNHUB_API_KEY')) return
  const warm = () => getInsiderActivity().catch((err) => logger.error({ err }, '[insiders] build failed'))
  warm()
  setInterval(warm, 6 * 3600e3 + 60_000)
}

async function build(): Promise<Activity> {
  if (!env.get('FINNHUB_API_KEY')) return { trades: [], summary: [] }

  const { equities } = await heldPositions()
  const symbols = [...new Set(equities.map((p) => p.symbol))]
  const since = ymd(new Date(Date.now() - WINDOW_DAYS * 864e5))
  const trades: InsiderTrade[] = []
  const summary: InsiderSummary[] = []

  for (const symbol of symbols) {
    const tx = await fh(`/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&from=${since}`)
    const rows = Array.isArray(tx?.data) ? tx.data : []
    if (!rows.length) continue // ETFs and funds have no insiders — skip the sentiment call too
    const mine = foldTrades(rows, since)
    trades.push(...mine)

    const sent = await fh(`/stock/insider-sentiment?symbol=${encodeURIComponent(symbol)}&from=${since}&to=${ymd(new Date())}`)
    const months = (Array.isArray(sent?.data) ? sent.data : []).filter((m: any) => Number.isFinite(m.mspr))
    const buys = mine.filter((t) => t.side === 'buy')
    const sells = mine.filter((t) => t.side === 'sell')
    summary.push({
      symbol,
      bought: buys.reduce((s, t) => s + t.value, 0),
      sold: sells.reduce((s, t) => s + t.value, 0),
      buyers: new Set(buys.map((t) => t.name)).size,
      sellers: new Set(sells.map((t) => t.name)).size,
      mspr: months.length ? months.reduce((s: number, m: any) => s + m.mspr, 0) / months.length : null,
    })
  }

  const now = new Date().toISOString()
  for (const t of trades) {
    const key = `${t.symbol}|${t.name}|${t.side}|${t.date}|${t.shares}`
    if (!seenAt.has(key)) seenAt.set(key, now)
    t.seenAt = seenAt.get(key)
  }
  const data = {
    trades: trades.sort((a, b) => b.date.localeCompare(a.date) || b.value - a.value),
    summary: summary.sort((a, b) => b.bought - b.sold - (a.bought - a.sold)),
  }
  if (summary.length) cache = { at: Date.now(), data }
  logger.info(`[insiders] ${trades.length} trades across ${summary.length} stocks`)
  return data
}
