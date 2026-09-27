import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { heldPositions } from '#services/poller'

/**
 * Real-time trade prices from Finnhub's WebSocket (free tier: 50 symbols, one connection per key —
 * a second process on the same key, e.g. local dev next to prod, kicks the other one off).
 * Keyed by our own symbols: equities as-is, crypto by currency code (BTC), priced off Coinbase USD.
 */
const STABLECOINS = new Set(['USDC', 'USDT', 'DAI'])
const MAX_SYMBOLS = 50
const FLUSH_MS = 1000
const RESYNC_MS = 5 * 60 * 1000

const prices = new Map<string, { p: number; t: number }>()
const pending = new Map<string, number>()
const listeners = new Set<(batch: Record<string, number>) => void>()
/** Finnhub symbol -> our symbol, for what we're currently subscribed to. */
let subscribed = new Map<string, string>()
let ws: WebSocket | null = null
let retryMs = 5000

export const livePrices = () => Object.fromEntries([...prices].map(([s, v]) => [s, v.p]))

/** Called with every batch of changed prices (at most once per FLUSH_MS). Returns an unsubscribe. */
export function onLivePrices(fn: (batch: Record<string, number>) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function wanted(): Promise<Map<string, string>> {
  const { equities, crypto } = await heldPositions()
  const out = new Map<string, string>()
  for (const p of [...equities].sort((a, b) => b.value - a.value)) out.set(p.symbol, p.symbol)
  for (const p of crypto) if (!STABLECOINS.has(p.symbol)) out.set(`COINBASE:${p.symbol}-USD`, p.symbol)
  return new Map([...out].slice(0, MAX_SYMBOLS))
}

/** Subscribe to new holdings / drop sold ones without reconnecting. */
async function resync() {
  if (ws?.readyState !== WebSocket.OPEN) return
  const next = await wanted()
  for (const s of subscribed.keys()) {
    if (!next.has(s)) ws.send(JSON.stringify({ type: 'unsubscribe', symbol: s }))
  }
  for (const s of next.keys()) {
    if (!subscribed.has(s)) ws.send(JSON.stringify({ type: 'subscribe', symbol: s }))
  }
  subscribed = next
}

function connect(key: string) {
  ws = new WebSocket(`wss://ws.finnhub.io?token=${key}`)
  ws.onopen = () => {
    retryMs = 5000
    subscribed = new Map()
    resync().catch((err) => logger.warn({ err }, '[live] could not subscribe'))
  }
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data))
    if (msg.type !== 'trade') return
    for (const trade of msg.data ?? []) {
      const symbol = subscribed.get(trade.s)
      if (!symbol || !(trade.p > 0)) continue
      // Trades can arrive out of order within a batch — keep the newest.
      if ((prices.get(symbol)?.t ?? 0) > trade.t) continue
      prices.set(symbol, { p: trade.p, t: trade.t })
      pending.set(symbol, trade.p)
    }
  }
  ws.onclose = (e) => {
    logger.warn(`[live] finnhub socket closed (${e.code} ${e.reason}), retrying in ${retryMs / 1000}s`)
    ws = null
    setTimeout(() => connect(key), retryMs)
    retryMs = Math.min(retryMs * 2, 5 * 60 * 1000)
  }
  ws.onerror = () => {} // onclose follows and handles the retry
}

export function startLivePrices() {
  const key = env.get('FINNHUB_API_KEY')
  if (!key) return
  connect(key)
  setInterval(() => resync().catch((err) => logger.warn({ err }, '[live] resync failed')), RESYNC_MS)
  setInterval(() => {
    if (!pending.size) return
    const batch = Object.fromEntries(pending)
    pending.clear()
    for (const fn of listeners) fn(batch)
  }, FLUSH_MS)
}
