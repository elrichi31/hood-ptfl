import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import PortfolioSnapshot from '#models/portfolio_snapshot'
import PositionSnapshot from '#models/position_snapshot'

/** Time series of saved snapshots (see #services/poller), for charting. */
export default class HistoryController {
  async index({ response, request }: HttpContext) {
    const limit = Number(request.qs().limit ?? 2000)
    // Newest N, then back to chronological order for the chart.
    const snapshots = (await PortfolioSnapshot.query().orderBy('created_at', 'desc').limit(limit)).reverse()

    return response.ok(
      snapshots.map((s) => ({
        totalValue: s.totalValue,
        cash: s.cash,
        at: s.createdAt.toISO(),
      }))
    )
  }

  /**
   * Per-symbol quantity/price at every snapshot of the last 31 days, column-oriented
   * (one array per symbol, aligned with `at`, null where the symbol wasn't held).
   * ponytail: ships the whole month and lets the client slice by range — fine for a
   * personal portfolio (~a few hundred KB); add server-side range/downsampling if it grows.
   */
  async positions({ response }: HttpContext) {
    const snapshots = await PortfolioSnapshot.query()
      .where('createdAt', '>=', DateTime.now().minus({ days: 31 }).toJSDate())
      .orderBy('created_at', 'asc')
    if (!snapshots.length) return response.ok({ at: [], total: [], cash: [], symbols: {} })

    const index = new Map(snapshots.map((s, i) => [s.id, i]))
    const rows = await PositionSnapshot.query().where('portfolioSnapshotId', '>=', snapshots[0].id)

    const symbols: Record<string, { type: string; qty: (number | null)[]; price: (number | null)[] }> = {}
    for (const r of rows) {
      const i = index.get(r.portfolioSnapshotId)
      if (i === undefined) continue
      const s = (symbols[r.symbol] ??= {
        type: r.assetType,
        qty: Array(snapshots.length).fill(null),
        price: Array(snapshots.length).fill(null),
      })
      s.qty[i] = Number(r.quantity)
      s.price[i] = Number(r.price)
    }

    return response.ok({
      at: snapshots.map((s) => s.createdAt.toISO()),
      total: snapshots.map((s) => Number(s.totalValue)),
      cash: snapshots.map((s) => Number(s.cash)),
      symbols,
    })
  }
}
