import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { heldPositions } from '#services/poller'

/** Finnhub trade times are epoch milliseconds, never the time a client connects. */
export type LivePriceEvent = {
  prices: Record<string, number>
  timestamps: Record<string, number>
  provider: 'connected' | 'reconnecting' | 'disabled'
  lastTradeAt: number | null
}

const STABLECOINS = new Set(['USDC', 'USDT', 'DAI'])
const MAX_SYMBOLS = 50

async function wanted(): Promise<Map<string, string>> {
  const { equities, crypto } = await heldPositions()
  const out = new Map<string, string>()
  for (const p of [...equities].sort((a, b) => b.value - a.value)) out.set(p.symbol, p.symbol)
  for (const p of crypto)
    if (!STABLECOINS.has(p.symbol)) out.set(`COINBASE:${p.symbol}-USD`, p.symbol)
  return new Map([...out].slice(0, MAX_SYMBOLS))
}

/** One shared feed; injected IO lets tests exercise reconnects without brokerage access. */
export function createLivePriceFeed(
  holdings: () => Promise<Map<string, string>> = wanted,
  socketFactory: (key: string) => WebSocket = (key) =>
    new WebSocket(`wss://ws.finnhub.io?token=${key}`)
) {
  const quotes = new Map<string, { p: number; t: number }>()
  const listeners = new Set<(event: LivePriceEvent) => void>()
  let provider: LivePriceEvent['provider'] = 'disabled'
  let subscribed = new Map<string, string>()
  let ws: WebSocket | null = null
  let running = false
  let dirty = false
  let retryMs = 5000
  let retry: ReturnType<typeof setTimeout> | undefined
  let flush: ReturnType<typeof setInterval> | undefined
  let sync: ReturnType<typeof setInterval> | undefined

  const prices = () => Object.fromEntries([...quotes].map(([s, v]) => [s, v.p]))
  const snapshot = (): LivePriceEvent => ({
    prices: prices(),
    timestamps: Object.fromEntries([...quotes].map(([s, v]) => [s, v.t])),
    provider,
    lastTradeAt: quotes.size ? Math.max(...[...quotes.values()].map((v) => v.t)) : null,
  })
  // Every event is a FULL snapshot: deleted/sold symbols disappear on the client too.
  const emit = () => {
    const event = snapshot()
    for (const fn of listeners) {
      try {
        fn(event)
      } catch {
        logger.warn('[live] listener failed')
      }
    }
  }
  const status = (next: LivePriceEvent['provider']) => {
    provider = next
    emit()
  }

  async function resync() {
    const socket = ws
    if (!socket || socket.readyState !== 1) return
    const next = await holdings()
    if (ws !== socket || socket.readyState !== 1) return
    for (const s of subscribed.keys()) {
      if (!next.has(s)) socket.send(JSON.stringify({ type: 'unsubscribe', symbol: s }))
    }
    for (const s of next.keys()) {
      if (!subscribed.has(s)) socket.send(JSON.stringify({ type: 'subscribe', symbol: s }))
    }
    subscribed = next
    const held = new Set(next.values())
    let removed = false
    for (const s of quotes.keys())
      if (!held.has(s)) {
        quotes.delete(s)
        removed = true
      }
    if (removed) emit()
  }

  function scheduleRetry(key: string) {
    if (!running) return
    retry = setTimeout(() => connect(key), retryMs)
    retryMs = Math.min(retryMs * 2, 5 * 60 * 1000)
  }

  function connect(key: string) {
    if (!running) return
    status('reconnecting')
    let socket: WebSocket
    try {
      socket = socketFactory(key)
    } catch {
      scheduleRetry(key)
      return
    }
    ws = socket
    socket.onopen = () => {
      if (ws !== socket) return
      retryMs = 5000
      subscribed = new Map()
      status('connected')
      resync().catch(() => logger.warn('[live] could not subscribe'))
    }
    socket.onmessage = (event) => {
      if (ws !== socket) return
      let msg: { type?: string; data?: unknown[] } | null
      try {
        msg = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (!msg || msg.type !== 'trade' || !Array.isArray(msg.data)) return
      for (const trade of msg.data) {
        if (!trade || typeof trade !== 'object') continue
        const { s, p, t } = trade as { s: string; p: number; t: number }
        const symbol = subscribed.get(s)
        if (!symbol || !Number.isFinite(p) || p <= 0 || !Number.isFinite(t) || t <= 0) continue
        if ((quotes.get(symbol)?.t ?? 0) > t) continue
        quotes.set(symbol, { p, t })
        dirty = true
      }
    }
    socket.onerror = () => {
      if (ws === socket) status('reconnecting')
    }
    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      status('reconnecting')
      scheduleRetry(key)
    }
  }

  function start(key?: string) {
    if (running) return
    if (!key) {
      status('disabled')
      return
    }
    running = true
    connect(key)
    sync = setInterval(
      () => resync().catch(() => logger.warn('[live] resync failed')),
      5 * 60 * 1000
    )
    flush = setInterval(() => {
      if (dirty) {
        dirty = false
        emit()
      }
    }, 1000)
  }

  function stop() {
    running = false
    clearTimeout(retry)
    clearInterval(sync)
    clearInterval(flush)
    const socket = ws
    ws = null
    socket?.close()
  }

  return {
    snapshot,
    prices,
    start,
    stop,
    resync,
    subscribe(fn: (event: LivePriceEvent) => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export const livePriceFeed = createLivePriceFeed()
export const livePrices = livePriceFeed.prices
export const onLivePrices = livePriceFeed.subscribe
export function startLivePrices() {
  livePriceFeed.start(env.get('FINNHUB_API_KEY'))
}
