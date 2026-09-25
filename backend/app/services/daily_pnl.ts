import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import PortfolioSnapshot from '#models/portfolio_snapshot'
import PositionSnapshot from '#models/position_snapshot'

const etDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

/**
 * Trading day a snapshot's move belongs to (ET date), close to close like Robinhood's history:
 * day D covers (previous close, D's 16:00 close]. After-hours, overnight and weekends roll into
 * the next trading day. ponytail: no holiday calendar.
 */
export function sessionOf(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  let wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  let day = etDay(d)
  if (wd >= 1 && wd <= 5 && Number(get('hour')) * 60 + Number(get('minute')) <= 960) return day
  do {
    day = new Date(new Date(`${day}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10)
    wd = (wd + 1) % 7
  } while (wd === 0 || wd === 6)
  return day
}

/**
 * P&L per trading session (see sessionOf), from the saved snapshots. For each consecutive pair:
 *   gain = Δ Robinhood total value − money moved in/out (Δ cash + Σ Δqty × price)
 * so deposits, buys and sells never count as gains. Using Robinhood's own total (not our
 * qty × quote sum) keeps it consistent with the value chart — overnight quotes are
 * extended-hours while the total uses the regular close, and that gap swings ±$10.
 * Recomputes the last `days` days and upserts them into daily_pnls.
 */
export async function computeDailyPnl(days = 3) {
  const cutoff = sessionOf(DateTime.now().minus({ days }).toJSDate())
  // One extra day so the first kept day has the previous day's last snapshot as its base.
  const snaps = await PortfolioSnapshot.query()
    .where(
      'createdAt',
      '>=',
      DateTime.now()
        .minus({ days: days + 4 })
        .toJSDate()
    )
    .orderBy('created_at', 'asc')
  if (snaps.length < 2) return 0

  // Filter by time, not id: backfill inserts old timestamps with new ids.
  const rows = await PositionSnapshot.query().whereIn(
    'portfolioSnapshotId',
    PortfolioSnapshot.query().select('id').where('createdAt', '>=', snaps[0].createdAt.toJSDate())
  )
  const held = new Map<number, Map<string, { q: number; p: number }>>()
  for (const r of rows) {
    const m = held.get(r.portfolioSnapshotId) ?? new Map()
    m.set(r.symbol, { q: Number(r.quantity), p: Number(r.price) })
    held.set(r.portfolioSnapshotId, m)
  }

  const out = new Map<string, { pnl: number; start: number; end: number }>()
  for (let i = 1; i < snaps.length; i++) {
    const day = sessionOf(snaps[i].createdAt.toJSDate())
    if (day < cutoff) continue
    const prev = held.get(snaps[i - 1].id) ?? new Map()
    const cur = held.get(snaps[i].id) ?? new Map()
    let flow = Number(snaps[i].cash) - Number(snaps[i - 1].cash)
    for (const symbol of new Set([...prev.keys(), ...cur.keys()])) {
      const a = prev.get(symbol)
      const b = cur.get(symbol)
      flow += ((b?.q ?? 0) - (a?.q ?? 0)) * (b?.p ?? a!.p)
    }
    const pnl = Number(snaps[i].totalValue) - Number(snaps[i - 1].totalValue) - flow
    const d = out.get(day) ?? { pnl: 0, start: Number(snaps[i - 1].totalValue), end: 0 }
    d.pnl += pnl
    d.end = Number(snaps[i].totalValue)
    out.set(day, d)
  }

  const now = new Date()
  const records = [...out].map(([day, d]) => ({
    day,
    pnl: Math.round(d.pnl * 100) / 100,
    pct: d.start ? (d.pnl / d.start) * 100 : null,
    start_value: d.start,
    end_value: d.end,
    updated_at: now,
  }))
  // Replace the whole recomputed range, so a day that no longer exists under the session rule goes away.
  await db.transaction(async (trx) => {
    await trx.from('daily_pnls').where('day', '>=', cutoff).delete()
    if (records.length) await trx.table('daily_pnls').insert(records)
  })
  return records.length
}

export async function getDailyPnl() {
  const rows = await db.from('daily_pnls').orderBy('day', 'asc')
  return rows.map((r) => ({
    day: r.day as string,
    pnl: Number(r.pnl),
    pct: r.pct == null ? null : Number(r.pct),
    startValue: Number(r.start_value),
    endValue: Number(r.end_value),
  }))
}

/** Boot: fill every day the snapshots cover (cheap, one pass), then keep the last few fresh per poll. */
export function backfillDailyPnl() {
  computeDailyPnl(400)
    .then((n) => logger.info(`[daily-pnl] computed ${n} days`))
    .catch((err) => logger.error({ err }, '[daily-pnl] backfill failed'))
}
