import logger from '@adonisjs/core/services/logger'
import PortfolioSnapshot from '#models/portfolio_snapshot'
import PositionSnapshot from '#models/position_snapshot'
import { getBalance, getPositions, type Position } from '#services/portfolio'
import { getOrders, getRealizedPnl } from '#services/enrichment'

const MARKET_INTERVAL_MS = 5 * 60 * 1000
const OFF_HOURS_INTERVAL_MS = 30 * 60 * 1000

/** NYSE regular hours, Mon–Fri 9:30–16:00 ET. No holiday calendar — ponytail: add one if it matters. */
function isMarketOpen(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  const weekday = get('weekday')
  const minutesSinceMidnight = Number(get('hour')) * 60 + Number(get('minute'))

  if (weekday === 'Sat' || weekday === 'Sun') return false
  return minutesSinceMidnight >= 9 * 60 + 30 && minutesSinceMidnight < 16 * 60
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

async function pollOnce() {
  // pnl/orders are extras: a failure there keeps the previous value instead of dropping the snapshot.
  const [balance, positions, pnl, orders] = await Promise.all([
    getBalance(),
    getPositions(),
    getRealizedPnl().catch(() => latest?.pnl ?? null),
    getOrders().catch(() => latest?.orders ?? []),
  ])

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
  logger.info(`[robinhood:poll] snapshot #${snapshot.id} saved — total $${balance.total.toFixed(2)}`)
}

/** Fetches the portfolio immediately, then every 5 min while the market's open, 30 min otherwise. */
export function startPolling() {
  const tick = async () => {
    inflight = pollOnce().catch((err) => logger.error({ err }, '[robinhood:poll] failed'))
    await inflight
    const open = isMarketOpen()
    const delay = open ? MARKET_INTERVAL_MS : OFF_HOURS_INTERVAL_MS
    logger.info(`[robinhood:poll] next in ${delay / 60000}min (market ${open ? 'open' : 'closed'})`)
    setTimeout(tick, delay)
  }
  tick()
}
