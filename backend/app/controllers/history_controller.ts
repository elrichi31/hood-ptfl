import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import PortfolioSnapshot from '#models/portfolio_snapshot'
import db from '@adonisjs/lucid/services/db'
import { getDailyPnl } from '#services/daily_pnl'
import { getReferencePrices } from '#services/enrichment'

let positionsCache: { key: string; body: unknown } | null = null

async function buildPositions(snapshots: PortfolioSnapshot[]) {
  const index = new Map(snapshots.map((s, i) => [s.id, i]))
  // Raw rows, not models: ~40k position rows took >1s to hydrate through Lucid, ~60ms raw.
  // Filter by id set, not time: backfill inserts old timestamps with new ids.
  const rows: {
    portfolio_snapshot_id: number
    symbol: string
    asset_type: string
    quantity: string
    price: string
  }[] = await db
    .from('position_snapshots')
    .whereIn('portfolio_snapshot_id', [...index.keys()])
    .select('portfolio_snapshot_id', 'symbol', 'asset_type', 'quantity', 'price')

  const symbols: Record<
    string,
    { type: string; qty: (number | null)[]; price: (number | null)[] }
  > = {}
  for (const r of rows) {
    const i = index.get(r.portfolio_snapshot_id)!
    const s = (symbols[r.symbol] ??= {
      type: r.asset_type,
      qty: Array(snapshots.length).fill(null),
      price: Array(snapshots.length).fill(null),
    })
    s.qty[i] = Number(r.quantity)
    s.price[i] = Number(r.price)
  }
  return {
    at: snapshots.map((s) => s.createdAt.toISO()),
    total: snapshots.map((s) => Number(s.totalValue)),
    cash: snapshots.map((s) => Number(s.cash)),
    symbols,
  }
}

/** Time series of saved snapshots (see #services/poller), for charting. */
export default class HistoryController {
  async index({ response, request }: HttpContext) {
    const limit = Number(request.qs().limit ?? 2000)
    // Newest N, then back to chronological order for the chart.
    const snapshots = (
      await PortfolioSnapshot.query().orderBy('created_at', 'desc').limit(limit)
    ).reverse()

    return response.ok(
      snapshots.map((s) => ({
        totalValue: s.totalValue,
        cash: s.cash,
        at: s.createdAt.toISO(),
      }))
    )
  }

  /**
   * Per-symbol quantity/price at every snapshot of the last 90 days, column-oriented
   * (one array per symbol, aligned with `at`, null where the symbol wasn't held).
   * ponytail: ships the whole month and lets the client slice by range — fine for a
   * personal portfolio (~a few hundred KB); add server-side range/downsampling if it grows.
   */
  async positions({ response }: HttpContext) {
    const snapshots = await PortfolioSnapshot.query()
      .where('createdAt', '>=', DateTime.now().minus({ days: 90 }).toJSDate())
      .orderBy('created_at', 'asc')
    if (!snapshots.length) return response.ok({ at: [], total: [], cash: [], symbols: {} })

    // Only changes when the poller saves a snapshot, so reuse the last build until then.
    const key = `${snapshots.length}:${snapshots[snapshots.length - 1].id}`
    if (positionsCache?.key !== key) {
      positionsCache = { key, body: await buildPositions(snapshots) }
    }
    return response.ok(positionsCache.body)
  }

  /** Market P&L per ET day (see #services/daily_pnl). */
  async daily({ response }: HttpContext) {
    return response.ok(await getDailyPnl())
  }

  /** Held equities' closes 1W/1M/3M/YTD/1Y ago, for period returns. */
  async references({ response }: HttpContext) {
    return response.ok(await getReferencePrices())
  }
}
