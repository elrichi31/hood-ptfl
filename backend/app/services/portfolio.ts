import { callTool } from '#services/robinhood'

export const json = (res: Awaited<ReturnType<typeof callTool>>) => {
  const text = (res.content as any)[0].text
  if (res.isError) throw new Error(`MCP tool error: ${text}`)
  return JSON.parse(text)
}

export type Account = {
  account_number: string
  rhs_account_number: string
  nickname?: string
  brokerage_account_type: string
}
type PortfolioTotals = { total_value: string; cash: string }
type EquityPosition = {
  symbol: string
  quantity: string
  average_buy_price: string | null
  type: string
}
type CryptoPosition = {
  currency: { code: string; name: string }
  quantity: string
  cost_bases: { direct_quantity: string; direct_cost_basis: string }[] | null
}

export type Position = {
  symbol: string
  name?: string
  quantity: number
  avgCost: number | null
  price: number
  value: number
}

export async function getAccounts(): Promise<Account[]> {
  const { data } = json(await callTool('get_accounts'))
  return data.accounts
}

/** Total balance across every Robinhood account. */
export async function getBalance() {
  const accounts = await getAccounts()
  const perAccount = await Promise.all(
    accounts.map(async (acc) => {
      const { data: portfolio } = json(
        await callTool('get_portfolio', { account_number: acc.account_number })
      ) as { data: PortfolioTotals }
      return {
        type: acc.brokerage_account_type,
        nickname: acc.nickname ?? null,
        totalValue: Number(portfolio.total_value),
        cash: Number(portfolio.cash),
      }
    })
  )
  return {
    total: perAccount.reduce((sum, a) => sum + a.totalValue, 0),
    accounts: perAccount,
  }
}

/** Position-level breakdown (stocks/ETFs + crypto) across all accounts, priced live. */
export async function getPositions(): Promise<{ equities: Position[]; crypto: Position[] }> {
  const accounts = await getAccounts()

  const equityRaw = (
    await Promise.all(
      accounts.map((a) => callTool('get_equity_positions', { account_number: a.account_number }))
    )
  ).flatMap((res) => json(res).data.positions ?? []) as EquityPosition[]
  const equities = equityRaw.filter((p) => p.type !== 'empty' && Number(p.quantity) !== 0)

  const rhsAccounts = [...new Set(accounts.map((a) => a.rhs_account_number))]
  const cryptoRaw = (
    await Promise.all(
      rhsAccounts.map((rhs) => callTool('get_crypto_positions', { rhs_account_number: rhs }))
    )
  ).flatMap((res) => json(res).data.results ?? []) as CryptoPosition[]
  const cryptos = cryptoRaw.filter((p) => Number(p.quantity) > 0)

  const [equityQuotes, cryptoQuotes] = await Promise.all([
    equities.length
      ? json(await callTool('get_equity_quotes', { symbols: equities.map((p) => p.symbol) }))
      : { data: { results: [] } },
    cryptos.length
      ? json(
          await callTool('get_crypto_quotes', {
            symbols: cryptos.map((p) => `${p.currency.code}-USD`),
          })
        )
      : { data: { results: [] } },
  ])
  const priceBySymbol = new Map(
    (equityQuotes.data.results as any[]).map((r) => [r.quote.symbol, Number(r.quote.last_trade_price)])
  )
  const priceByPair = new Map(
    (cryptoQuotes.data.results as any[]).map((r) => [r.symbol, Number(r.mark_price)])
  )

  return {
    equities: equities.map((p) => {
      const quantity = Number(p.quantity)
      const price = priceBySymbol.get(p.symbol) ?? 0
      return {
        symbol: p.symbol,
        quantity,
        avgCost: p.average_buy_price ? Number(p.average_buy_price) : null,
        price,
        value: quantity * price,
      }
    }),
    crypto: cryptos.map((p) => {
      const quantity = Number(p.quantity)
      const pairSymbol = `${p.currency.code}USD`
      const price = priceByPair.get(pairSymbol) ?? 0
      const bases = p.cost_bases ?? []
      const costQty = bases.reduce((s, b) => s + Number(b.direct_quantity), 0)
      const costTotal = bases.reduce((s, b) => s + Number(b.direct_cost_basis), 0)
      return {
        symbol: p.currency.code,
        name: p.currency.name,
        quantity,
        avgCost: costQty > 0 ? costTotal / costQty : null,
        price,
        value: quantity * price,
      }
    }),
  }
}
