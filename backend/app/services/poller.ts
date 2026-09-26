import logger from '@adonisjs/core/services/logger'
import PortfolioSnapshot from '#models/portfolio_snapshot'
import PositionSnapshot from '#models/position_snapshot'
import { getBalance, getPositions, type Position } from '#services/portfolio'
import { getOrders, getRealizedPnl, getReferencePrices } from '#services/enrichment'
import { backfillDailyPnl, computeDailyPnl } from '#services/daily_pnl'
import { OPEN_MIN, closeMin, etClock, isTradingDay } from '#services/market_hours'

const MARKET_INTERVAL_MS = 5 * 60 * 1000
const OFF_HOURS_INTERVAL_MS = 30 * 60 * 1000

/** NYSE regular hours (9:30 to 16:00 ET, or 13:00 on early closes), holidays excluded. */
export function marketClock(now = new Date()) {
  const { day, weekday, min } = etClock(now)
  const close = closeMin(day)
  const open = isTradingDay(day, weekday) && min >= OPEN_MIN && min < close
  // Next 9:30 or close, so the poll lands right on the open/close instead of up to 30 min late.
  const nextBoundary = min < OPEN_MIN ? OPEN_MIN : min < close ? close : OPEN_MIN + 24 * 60
  return { open, msToBoundary: (nextBoundary - min) * 60_000 }
}

type Latest = {
  at: string
  balance: Awaited<ReturnType<typeof getBalance>>
  positions: Awaited<ReturnType<typeof getPositions>>
  pnl: Awaited<ReturnType<typeof getRealizedPnl>> | null
  orders: Awaited<ReturnType<typeof getOrders>>
}

/**
 * Last successful pull, served to the dashboard so page views never hit Robinhood.
 * ponytail: in-memory, empty until the boot poll finishes (getLatest waits for it).
 */
let latest: Latest | null = null
let inflight: Promise<void> | null = null

export async function getLatest() {
  if (!latest && inflight) await inflight
  return latest
}

/** Held positions from the last poll (live only if the poller hasn't run yet) — keeps page loads off Robinhood. */
export async function heldPositions() {
  return (await getLatest())?.positions ?? getPositions()
}

const EXTRAS_INTERVAL_MS = 30 * 60 * 1000
let extrasAt = 0

async function pollOnce() {
  // pnl/orders are extras: a failure there keeps the previous value instead of dropping the snapshot.
  // They barely change, so refresh them every 30 min instead of every 5-min poll.
  const refreshExtras = !latest || Date.now() - extrasAt >= EXTRAS_INTERVAL_MS
  const [balance, positions, pnl, orders] = await Promise.all([
    getBalance(),
    getPositions(),
    refreshExtras ? getRealizedPnl().catch(() => latest?.pnl ?? null) : latest!.pnl,
    refreshExtras ? getOrders().catch(() => latest?.orders ?? []) : latest!.orders,
  ])
  if (refreshExtras) extrasAt = Date.now()

  const snapshot = await PortfolioSnapshot.create({
    totalValue: balance.total,
    cash: balance.accounts.reduce((sum, a) => sum + a.cash, 0),
  })

  const rows = (type: 'equity' | 'crypto', list: Position[]) =>
    list.map((p) => ({
      portfolioSnapshotId: snapshot.id,
      assetType: type,
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: p.avgCost,
      price: p.price,
      value: p.value,
    }))

  await PositionSnapshot.createMany([
    ...rows('equity', positions.equities),
    ...rows('crypto', positions.crypto),
  ])

  latest = { at: snapshot.createdAt.toISO()!, balance, positions, pnl, orders }
  await computeDailyPnl(3).catch((err) => logger.error({ err }, '[daily-pnl] update failed'))
  logger.info(`[robinhood:poll] snapshot #${snapshot.id} saved — total $${balance.total.toFixed(2)}`)
}

/** Fetches the portfolio immediately, then every 5 min while the market's open, 30 min otherwise. */
export function startPolling() {
  backfillDailyPnl()
  const tick = async () => {
    inflight = pollOnce().catch((err) => logger.error({ err }, '[robinhood:poll] failed'))
    await inflight
    // Warm the 6h period-price cache so the dashboard never waits on it.
    getReferencePrices().catch((err) => logger.error({ err }, '[refs] warm-up failed'))
    const { open, msToBoundary } = marketClock()
    // +5s so the boundary tick sees the new state (open at 9:30:05, closing snapshot at 16:00:05).
    const delay = Math.min(open ? MARKET_INTERVAL_MS : OFF_HOURS_INTERVAL_MS, msToBoundary + 5000)
    logger.info(`[robinhood:poll] next in ${(delay / 60000).toFixed(1)}min (market ${open ? 'open' : 'closed'})`)
    setTimeout(tick, delay)
  }
  tick()
}
