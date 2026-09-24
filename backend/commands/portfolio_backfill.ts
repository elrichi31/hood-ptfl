import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DateTime } from 'luxon'
import PortfolioSnapshot from '#models/portfolio_snapshot'
import PositionSnapshot from '#models/position_snapshot'
import { callTool } from '#services/robinhood'
import { getAccounts, getBalance, getPositions, json } from '#services/portfolio'

const BAR_MS = 5 * 60 * 1000
const DAY_MS = 864e5

/**
 * Rebuilds 5-minute portfolio snapshots for the last N days from Robinhood's equity
 * bars, so the value chart has data for hours the poller wasn't running.
 *
 * Quantities/cash at time t = today's, minus the filled orders after t. Timestamps a
 * live snapshot already covers are skipped; re-running replaces earlier backfills.
 * ponytail: crypto has no historicals tool, so it's held at today's value; only the
 * first page of orders is read (fine for days, not months).
 */
export default class PortfolioBackfill extends BaseCommand {
  static commandName = 'portfolio:backfill'
  static description = 'Reconstruct 5-min portfolio snapshots for the last N days from Robinhood price history'
  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'How many days back (max 30)', default: 5 })
  declare days: number

  async run() {
    const days = Math.min(Math.max(this.days, 1), 30)
    const start = Date.now() - days * DAY_MS

    const [balance, positions, accounts] = await Promise.all([getBalance(), getPositions(), getAccounts()])
    const cashNow = balance.accounts.reduce((s, a) => s + a.cash, 0)
    const cryptoValue = positions.crypto.reduce((s, p) => s + p.value, 0)

    const orders = (
      await Promise.all(
        accounts.map(async (a) => json(await callTool('get_equity_orders', { account_number: a.account_number })).data.orders ?? [])
      )
    )
      .flat()
      .filter((o: any) => Number(o.cumulative_quantity) > 0 && o.last_transaction_at)
      .map((o: any) => ({
        symbol: o.symbol as string,
        at: new Date(o.last_transaction_at).getTime(),
        qty: Number(o.cumulative_quantity) * (o.side === 'buy' ? 1 : -1),
        notional: Number(o.cumulative_quantity) * Number(o.average_price ?? o.price ?? 0) * (o.side === 'buy' ? 1 : -1),
      }))
      .filter((o) => o.at >= start)

    const qtyNow = new Map(positions.equities.map((p) => [p.symbol, p.quantity]))
    const avgCost = new Map(positions.equities.map((p) => [p.symbol, p.avgCost]))
    const symbols = [...new Set([...qtyNow.keys(), ...orders.map((o) => o.symbol)])]
    if (!symbols.length) return this.logger.warning('No equity positions or recent orders — nothing to backfill')

    // symbol -> (bar end ms -> close). One call per day per 10 symbols keeps under the bar cap.
    const closes = new Map<string, Map<number, number>>()
    for (let dayStart = start; dayStart < Date.now() - 60_000; dayStart += DAY_MS) {
      for (let i = 0; i < symbols.length; i += 10) {
        const { data } = json(
          await callTool('get_equity_historicals', {
            symbols: symbols.slice(i, i + 10),
            start_time: new Date(dayStart).toISOString(),
            end_time: new Date(Math.min(dayStart + DAY_MS, Date.now())).toISOString(),
            interval: '5minute',
          })
        )
        for (const r of data.results ?? []) {
          const m = closes.get(r.symbol) ?? new Map()
          for (const b of r.bars ?? []) {
            if (!b.interpolated) m.set(new Date(b.begins_at).getTime() + BAR_MS, Number(b.close_price))
          }
          closes.set(r.symbol, m)
        }
      }
    }

    const timestamps = [...new Set([...closes.values()].flatMap((m) => [...m.keys()]))]
      .filter((t) => t <= Date.now())
      .sort((a, b) => a - b)

    await PortfolioSnapshot.query().where('backfilled', true).where('createdAt', '>=', new Date(start)).delete()
    const live = (await PortfolioSnapshot.query().where('createdAt', '>=', new Date(start - BAR_MS))).map((s) =>
      s.createdAt.toMillis()
    )

    const lastClose = new Map<string, number>()
    let inserted = 0
    let skipped = 0
    for (const t of timestamps) {
      for (const s of symbols) {
        const c = closes.get(s)?.get(t)
        if (c !== undefined) lastClose.set(s, c)
      }
      if (live.some((l) => Math.abs(l - t) < BAR_MS / 2)) {
        skipped++
        continue
      }

      const after = orders.filter((o) => o.at > t)
      const rows = symbols
        .map((s) => {
          const quantity = (qtyNow.get(s) ?? 0) - after.filter((o) => o.symbol === s).reduce((q, o) => q + o.qty, 0)
          const price = lastClose.get(s)
          return price && quantity > 1e-9 ? { symbol: s, quantity, price, value: quantity * price } : null
        })
        .filter((r) => r !== null)
      if (!rows.length) continue

      const cash = cashNow + after.reduce((c, o) => c + o.notional, 0)
      const snapshot = await PortfolioSnapshot.create({
        totalValue: rows.reduce((v, r) => v + r.value, 0) + cryptoValue + cash,
        cash,
        backfilled: true,
        createdAt: DateTime.fromMillis(t),
      })
      await PositionSnapshot.createMany([
        ...rows.map((r) => ({
          portfolioSnapshotId: snapshot.id,
          assetType: 'equity',
          symbol: r.symbol,
          quantity: r.quantity,
          avgCost: avgCost.get(r.symbol) ?? null,
          price: r.price,
          value: r.value,
          createdAt: DateTime.fromMillis(t),
        })),
        ...positions.crypto.map((p) => ({
          portfolioSnapshotId: snapshot.id,
          assetType: 'crypto',
          symbol: p.symbol,
          quantity: p.quantity,
          avgCost: p.avgCost,
          price: p.price,
          value: p.value,
          createdAt: DateTime.fromMillis(t),
        })),
      ])
      inserted++
    }

    this.logger.success(
      `Backfilled ${inserted} snapshots over ${days}d for ${symbols.length} symbols (${skipped} covered by live polls, ${orders.length} orders replayed)`
    )
  }
}
