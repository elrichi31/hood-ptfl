import { callTool } from '#services/robinhood'
import { getAccounts, json } from '#services/portfolio'
import { heldPositions } from '#services/poller'

/** Realized P&L over the trailing year, summed across every account. */
export async function getRealizedPnl(span = 'year') {
  const accounts = await getAccounts()
  const buckets = await settledRows(
    accounts.map((a) => () => callTool('get_realized_pnl', { account_number: a.rhs_account_number, span })),
    (data) => data.data_points ?? []
  )
  const total = buckets.reduce((sum: number, b: any) => sum + (b.realized_gain ? Number(b.realized_gain) : 0), 0)
  return { total, span }
}

type OrderRow = {
  type: 'equity' | 'crypto'
  symbol: string
  side: string
  quantity: number
  price: number | null
  state: string
  createdAt: string
}

// Not every account has orders of every type (e.g. no linked crypto account) — the
// MCP returns a plain-text error for those, so a per-account failure is expected, not fatal.
// json() must run *inside* each settled promise, or its throw lands outside allSettled's net.
async function settledRows<T>(
  calls: (() => Promise<Awaited<ReturnType<typeof callTool>>>)[],
  pluck: (data: any) => T[]
): Promise<T[]> {
  const settled = await Promise.allSettled(calls.map((call) => call().then((res) => pluck(json(res).data) ?? [])))
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

/** Recent orders (any state) across every account, newest first. */
export async function getOrders(limit = 30): Promise<OrderRow[]> {
  const accounts = await getAccounts()

  const equityRaw = await settledRows(
    accounts.map((a) => () => callTool('get_equity_orders', { account_number: a.account_number })),
    (data) => data.orders
  )

  const rhsAccounts = [...new Set(accounts.map((a) => a.rhs_account_number))]
  const cryptoRaw = await settledRows(
    rhsAccounts.map((rhs) => () => callTool('get_crypto_orders', { rhs_account_number: rhs })),
    (data) => data.results
  )

  const equityOrders: OrderRow[] = equityRaw.filter(Boolean).map((o: any) => ({
    type: 'equity',
    symbol: o.symbol,
    side: o.side,
    quantity: Number(o.cumulative_quantity ?? o.quantity ?? 0),
    price: o.average_price ? Number(o.average_price) : o.price ? Number(o.price) : null,
    state: o.state,
    createdAt: o.created_at,
  }))
  const cryptoOrders: OrderRow[] = cryptoRaw.filter(Boolean).map((o: any) => ({
    type: 'crypto',
    symbol: o.currency_code,
    side: o.side,
    quantity: Number(o.cumulative_quantity ?? o.quantity ?? 0),
    price: o.average_price ? Number(o.average_price) : null,
    state: o.state,
    createdAt: o.created_at,
  }))

  return [...equityOrders, ...cryptoOrders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

/** On-demand enrichment for one equity symbol — fetched when a position row is opened, not preloaded. */
export async function getSymbolDetails(symbol: string) {
  const rsiStart = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()

  const [fundamentalsRes, earningsRes, ratingsRes, rsiRes] = await Promise.all([
    callTool('get_equity_fundamentals', { symbols: [symbol] }),
    callTool('get_earnings_results', { symbol }),
    callTool('get_equity_analyst_ratings', { symbols: [symbol] }),
    callTool('get_equity_technical_indicators', {
      symbol,
      type: 'rsi',
      interval: 'day',
      start_time: rsiStart,
      output: 'latest',
    }).catch(() => null),
  ])

  const f = json(fundamentalsRes).data.results?.[0] ?? null
  const earnings = json(earningsRes).data.results ?? []
  const nextEarnings = earnings.find((e: any) => e.report?.date && new Date(e.report.date) > new Date())
  const ratings = json(ratingsRes).data.results?.[0]?.ratings ?? null
  const rsi = rsiRes ? json(rsiRes).data.indicators?.[0]?.series?.[0]?.value ?? null : null

  return {
    symbol,
    sector: f?.sector ?? null,
    marketCap: f?.market_cap ? Number(f.market_cap) : null,
    peRatio: f?.pe_ratio ? Number(f.pe_ratio) : null,
    dividendYield: f?.dividend_yield ? Number(f.dividend_yield) : null,
    high52w: f?.high_52_weeks ? Number(f.high_52_weeks) : null,
    low52w: f?.low_52_weeks ? Number(f.low_52_weeks) : null,
    nextEarningsDate: nextEarnings?.report?.date ?? null,
    rsi: rsi !== null ? Number(rsi) : null,
    analystRatings: ratings
      ? {
          buy: ratings.num_buy_ratings,
          hold: ratings.num_hold_ratings,
          sell: ratings.num_sell_ratings,
          priceTarget: ratings.mean_price_target ? Number(ratings.mean_price_target) : null,
        }
      : null,
  }
}

/** Disclosed politician trades in tickers the user currently holds — fun, not preloaded on the dashboard. */
// ponytail: in-memory 6h cache — disclosures lag weeks, so a live fetch per page view is waste.
let tradesCache: { at: number; data: any[] } | null = null

export async function getPoliticianTradesForHoldings() {
  if (tradesCache && Date.now() - tradesCache.at < 6 * 3600e3) return tradesCache.data
  const { equities } = await heldPositions()
  const symbols = [...new Set(equities.map((p) => p.symbol))]

  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const { data } = json(await callTool('get_politician_trades', { equity_symbol: symbol }))
      return (data.trades ?? []).map((t: any) => ({ ...t, heldSymbol: symbol }))
    })
  )
  const results = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

  const data = results
    .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
    .slice(0, 40)
  if (data.length) tradesCache = { at: Date.now(), data }
  return data
}

export const PERIODS = { '1W': 7, '1M': 30, '3M': 91, '1Y': 365 } as const
type PeriodKey = keyof typeof PERIODS | 'YTD'

// ponytail: in-memory 6h cache — daily closes for past dates don't change.
let refCache: { at: number; data: Record<string, Partial<Record<PeriodKey, number>>> } | null = null

/**
 * Close price of each held equity 1W / 1M / 3M / YTD / 1Y ago, from one year of daily bars
 * (one Robinhood call per 10 symbols). Lets the positions table show period returns beyond
 * the snapshot history.
 */
export async function getReferencePrices() {
  if (refCache && Date.now() - refCache.at < 6 * 3600e3) return refCache.data
  const { equities } = await heldPositions()
  const symbols = [...new Set(equities.map((p) => p.symbol))]
  const now = Date.now()
  const ytdStart = new Date(new Date().getUTCFullYear(), 0, 1).getTime()
  const data: Record<string, Partial<Record<PeriodKey, number>>> = {}

  for (let i = 0; i < symbols.length; i += 10) {
    const { data: res } = json(
      await callTool('get_equity_historicals', {
        symbols: symbols.slice(i, i + 10),
        start_time: new Date(now - 380 * 864e5).toISOString(),
        end_time: new Date(now).toISOString(),
        interval: 'day',
      })
    )
    for (const r of res.results ?? []) {
      const bars = (r.bars ?? [])
        .filter((b: any) => !b.interpolated)
        .map((b: any) => ({ t: new Date(b.begins_at).getTime(), c: Number(b.close_price) }))
      // Last close on or before `t` (so a weekend target lands on Friday's close).
      const closeAt = (t: number) => bars.filter((b: any) => b.t <= t).at(-1)?.c
      const refs: Partial<Record<PeriodKey, number>> = {}
      for (const [k, d] of Object.entries(PERIODS)) {
        const c = closeAt(now - d * 864e5)
        if (c) refs[k as PeriodKey] = c
      }
      const ytd = closeAt(ytdStart - 1)
      if (ytd) refs.YTD = ytd
      data[r.symbol] = refs
    }
  }
  if (Object.keys(data).length) refCache = { at: Date.now(), data }
  return data
}
