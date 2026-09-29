import { test } from '@japa/runner'
import { fitOf, scoreItem, type DiscoverItem } from '#services/discover'

const base: Omit<DiscoverItem, 'opportunity' | 'portfolioFit' | 'score'> = {
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
  sectorPct: null,
  nextEarnings: null,
  spark: [],
}
const analysts = (buyPct: number) => ({ total: 10, buyPct, buy: 0, hold: 0, sell: 0 })
const fit = (deltaVolAt5: number, beta = 1) => ({
  corr: 0,
  beta,
  volatilityPct: 20,
  sigma: 0.01,
  cov: 0,
  deltaVolAt5,
})

test('score splits into opportunity and portfolio fit, bounded 0–100', ({ assert }) => {
  const best = scoreItem({
    ...base,
    fit: fit(-2, 0),
    sectorPct: 0,
    analysts: { ...analysts(1), total: 1e6 },
    target: { low: 1, mean: 2, high: 3, upsidePct: 50 },
    revenueGrowth: 80,
    netMargin: 40,
    earnings: { quarters: 4, beats: 4, avgSurprisePct: 10 },
  })
  const worst = scoreItem({
    ...base,
    fit: fit(1, 2),
    sectorPct: 40,
    analysts: { ...analysts(0), total: 1e6 },
    target: { low: 1, mean: 1, high: 1, upsidePct: -20 },
    revenueGrowth: -50,
    netMargin: -30,
    earnings: { quarters: 4, beats: 0, avgSurprisePct: -10 },
  })
  assert.deepEqual(best, { opportunity: 100, portfolioFit: 100, score: 100 })
  assert.deepEqual(worst, { opportunity: 0, portfolioFit: 0, score: 0 })
  const unknown = scoreItem(base).score // missing data scores neutral, not zero
  assert.isAbove(unknown, 0)
  assert.isBelow(unknown, 100)
  // A diversifier beats an identical twin that raises your volatility.
  assert.isAbove(scoreItem({ ...base, fit: fit(-1) }).score, scoreItem({ ...base, fit: fit(0.5) }).score)
  // Same stock, but you're already 22% in its sector: worse fit.
  assert.isAbove(scoreItem({ ...base, sectorPct: 0 }).portfolioFit, scoreItem({ ...base, sectorPct: 22 }).portfolioFit)
  // 3 analysts at 100% Buy count for less than 40 at 95%.
  assert.isBelow(
    scoreItem({ ...base, analysts: { ...analysts(1), total: 3 } }).opportunity,
    scoreItem({ ...base, analysts: { ...analysts(0.95), total: 40 } }).opportunity
  )
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
