import { mkdirSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
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
    const res = await trackedFetch(
      'finnhub',
      `https://finnhub.io/api/v1${path}&token=${env.get('FINNHUB_API_KEY')}`
    )
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

type Activity = { trades: InsiderTrade[]; summary: InsiderSummary[]; pending?: boolean }
const FRESH_MS = 6 * 3600e3 // Form 4s land at most a few times a day per company
const EMPTY_RETRY_MS = 5 * 60e3 // an empty build (provider down / rate limited) is retried soon
const PERSISTED_MAX_AGE_MS = 24 * 3600e3
const INSIDERS_FILE = 'tmp/insiders.json'
// A cold build is ~45 sequential, rate-spaced Finnhub calls (tens of seconds). Callers wait this long
// for it, then get a "pending" answer instead of hanging until their own deadline.
const COLD_WAIT_MS = 6_000

// In memory, but seeded from disk so a restart neither re-dates old filings (the bell would re-ring)
// nor leaves the Alerts page empty while the first build runs.
const seenAt = new Map<string, string>()
const tradeKey = (t: InsiderTrade) => `${t.symbol}|${t.name}|${t.side}|${t.date}|${t.shares}`

function loadPersisted(): { at: number; data: Activity } | null {
  try {
    const file = JSON.parse(readFileSync(INSIDERS_FILE, 'utf8')) as { at: number; data: Activity }
    if (!Array.isArray(file.data?.trades) || !Array.isArray(file.data?.summary)) return null
    if (Date.now() - file.at > PERSISTED_MAX_AGE_MS) return null
    for (const t of file.data.trades) if (t.seenAt) seenAt.set(tradeKey(t), t.seenAt)
    return file
  } catch {
    return null
  }
}

async function persist(entry: { at: number; data: Activity }) {
  try {
    mkdirSync('tmp', { recursive: true })
    await writeFile(`${INSIDERS_FILE}.tmp`, JSON.stringify(entry))
    await rename(`${INSIDERS_FILE}.tmp`, INSIDERS_FILE)
  } catch (err) {
    logger.warn({ err }, '[insiders] could not persist cache')
  }
}

let cache: { at: number; data: Activity } | null = loadPersisted()
let inflight: Promise<Activity> | null = null

const refresh = () => {
  inflight ??= build().finally(() => (inflight = null))
  return inflight
}

/**
 * Stale-while-revalidate: anything cached is served immediately (a stale copy also kicks a refresh
 * in the background). Only with nothing cached at all does the caller wait, and then only briefly.
 * Concurrent callers (the Alerts page + the bell) share one build instead of racing two.
 */
export function getInsiderActivity(): Promise<Activity> {
  if (cache) {
    const age = Date.now() - cache.at
    const ttl = cache.data.summary.length ? FRESH_MS : EMPTY_RETRY_MS
    if (age >= ttl) refresh().catch((err) => logger.error({ err }, '[insiders] refresh failed'))
    return Promise.resolve(cache.data)
  }
  const pending = new Promise<Activity>((resolve) =>
    setTimeout(() => resolve({ trades: [], summary: [], pending: true }), COLD_WAIT_MS).unref?.()
  )
  return Promise.race([refresh(), pending])
}

/** Warm at boot and every 6h, so page loads never wait on ~40 Finnhub calls. */
export function startInsiders() {
  if (!env.get('FINNHUB_API_KEY')) return
  const warm = () =>
    getInsiderActivity().catch((err) => logger.error({ err }, '[insiders] build failed'))
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
    const tx = await fh(
      `/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&from=${since}`
    )
    const rows = Array.isArray(tx?.data) ? tx.data : []
    if (!rows.length) continue // ETFs and funds have no insiders — skip the sentiment call too
    const mine = foldTrades(rows, since)
    trades.push(...mine)

    const sent = await fh(
      `/stock/insider-sentiment?symbol=${encodeURIComponent(symbol)}&from=${since}&to=${ymd(new Date())}`
    )
    const months = (Array.isArray(sent?.data) ? sent.data : []).filter((m: any) =>
      Number.isFinite(m.mspr)
    )
    const buys = mine.filter((t) => t.side === 'buy')
    const sells = mine.filter((t) => t.side === 'sell')
    summary.push({
      symbol,
      bought: buys.reduce((s, t) => s + t.value, 0),
      sold: sells.reduce((s, t) => s + t.value, 0),
      buyers: new Set(buys.map((t) => t.name)).size,
      sellers: new Set(sells.map((t) => t.name)).size,
      mspr: months.length
        ? months.reduce((s: number, m: any) => s + m.mspr, 0) / months.length
        : null,
    })
  }

  const now = new Date().toISOString()
  for (const t of trades) {
    const key = tradeKey(t)
    if (!seenAt.has(key)) seenAt.set(key, now)
    t.seenAt = seenAt.get(key)
  }
  const data = {
    trades: trades.sort((a, b) => b.date.localeCompare(a.date) || b.value - a.value),
    summary: summary.sort((a, b) => b.bought - b.sold - (a.bought - a.sold)),
  }
  // An empty result is cached too (short TTL, see getInsiderActivity) so a provider outage can't
  // trigger a fresh 45-call build on every request. It never replaces a good copy, though.
  if (summary.length || !cache?.data.summary.length) {
    cache = { at: Date.now(), data }
    void persist(cache)
  }
  logger.info(`[insiders] ${trades.length} trades across ${summary.length} stocks`)
  return data
}
