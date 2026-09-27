import { test } from '@japa/runner'
import { fitOf, scoreItem, type DiscoverItem } from '#services/discover'

const base: Omit<DiscoverItem, 'score'> = {
  symbol: 'X',
  name: 'X',
  description: null,
  logo: null,
  kind: 'stock',
  industry: null,
  sector: null,
  newIndustry: false,
  sources: ['peer'],
  watchlists: [],
  peerOf: ['AMD'],
  price: null,
  changePct: null,
  marketCap: null,
  pe: null,
  dividendYield: null,
  revenueGrowth: null,
  netMargin: null,
  return52w: null,
  fromHigh: null,
  analysts: null,
  target: null,
  earnings: null,
  mspr: null,
  fit: null,
  spark: [],
}
const analysts = (buyPct: number) => ({ total: 10, buyPct, buy: 0, hold: 0, sell: 0 })
const fit = (corr: number) => ({
  corr,
  beta: 1,
  volatilityPct: 20,
  sigma: 0.01,
  cov: 0,
  deltaVolAt5: 0,
})

test('score rewards fit, conviction, upside, growth, margin and track record, bounded 0–100', ({
  assert,
}) => {
  const best = scoreItem({
    ...base,
    fit: fit(-0.2),
    analysts: analysts(1),
    target: { low: 1, mean: 2, high: 3, upsidePct: 50 },
    revenueGrowth: 80,
    netMargin: 40,
    earnings: { quarters: 4, beats: 4, avgSurprisePct: 10 },
  })
  const worst = scoreItem({
    ...base,
    fit: fit(1),
    analysts: analysts(0),
    target: { low: 1, mean: 1, high: 1, upsidePct: -20 },
    revenueGrowth: -50,
    netMargin: -30,
    earnings: { quarters: 4, beats: 0, avgSurprisePct: -10 },
  })
  assert.equal(best, 100)
  assert.equal(worst, 0)
  const unknown = scoreItem(base) // missing data scores neutral, not zero
  assert.isAbove(unknown, worst)
  assert.isBelow(unknown, best)
  // A diversifier beats an identical twin that moves with the portfolio.
  assert.isAbove(scoreItem({ ...base, fit: fit(0.1) }), scoreItem({ ...base, fit: fit(0.9) }))
})

test('fitOf: a hedge lowers portfolio volatility, a clone raises it', ({ assert }) => {
  const port = Array.from({ length: 200 }, (_, i) => (i % 2 ? 0.01 : -0.01) * (1 + (i % 7) / 10))
  const market = port.map((x) => x * 0.8)
  const hedge = fitOf(
    port.map((x) => -x),
    port,
    market
  )!
  const clone = fitOf(
    port.map((x) => 2 * x),
    port,
    market
  )!
  assert.closeTo(hedge.corr, -1, 1e-6)
  assert.closeTo(clone.corr, 1, 1e-6)
  assert.isBelow(hedge.deltaVolAt5, 0)
  assert.isAbove(clone.deltaVolAt5, 0)
  assert.closeTo(clone.beta, 2.5, 1e-6) // 2x the portfolio, which is 1.25x the market
  assert.isNull(fitOf(port.slice(0, 30), port, market)) // too little history
})
