import { test } from '@japa/runner'
import { foldTrades } from '#services/insiders'

const line = (o: Record<string, unknown>) => ({
  id: 'f1',
  name: 'Jane CEO',
  symbol: 'AMD',
  transactionDate: '2026-09-15',
  filingDate: '2026-09-17',
  isDerivative: false,
  ...o,
})

test('folds one filing into a single trade and drops non-decisions', ({ assert }) => {
  const trades = foldTrades(
    [
      // one sale split across two price lines: 100 @ 10 then 300 @ 12, 600 shares left
      line({ transactionCode: 'S', change: -100, transactionPrice: 10, share: 900 }),
      line({ transactionCode: 'S', change: -300, transactionPrice: 12, share: 600 }),
      line({ transactionCode: 'M', change: 500, transactionPrice: 0, share: 1000 }), // option exercise
      line({ transactionCode: 'F', change: -50, transactionPrice: 11, share: 950 }), // tax withholding
      line({ transactionCode: 'S', change: -10, transactionPrice: 10, share: 5, isDerivative: true }),
      line({ id: 'f2', transactionCode: 'P', change: 200, transactionPrice: 20, share: 1200 }),
      line({ id: 'f3', transactionCode: 'P', change: 1, transactionPrice: 5, share: 1, transactionDate: '2020-01-01' }), // too old
    ],
    '2026-06-01'
  )

  assert.lengthOf(trades, 2)
  const sell = trades.find((t) => t.side === 'sell')!
  assert.equal(sell.shares, 400)
  assert.equal(sell.value, 100 * 10 + 300 * 12)
  assert.closeTo(sell.avgPrice, 11.5, 1e-9)
  assert.closeTo(sell.pctOfStake!, 40, 1e-9) // 400 of the 1000 held before

  const buy = trades.find((t) => t.side === 'buy')!
  assert.equal(buy.value, 4000)
  assert.closeTo(buy.pctOfStake!, (200 / 1200) * 100, 1e-9)
})
