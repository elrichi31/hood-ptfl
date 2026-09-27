import { test } from '@japa/runner'
import { scoreItem, type DiscoverItem } from '#services/discover'

const base: Omit<DiscoverItem, 'score'> = {
  symbol: 'X',
  name: 'X',
  logo: null,
  industry: null,
  newIndustry: false,
  peerOf: ['AMD'],
  price: null,
  changePct: null,
  marketCap: null,
  pe: null,
  revenueGrowth: null,
  netMargin: null,
  return52w: null,
  fromHigh: null,
  analysts: null,
  lastSurprisePct: null,
}
const analysts = (buyPct: number) => ({ total: 10, buyPct, strongBuy: 0, buy: 0, hold: 0, sell: 0 })

test('score rewards conviction, growth, margin and overlap, bounded 0–100', ({ assert }) => {
  const best = scoreItem({ ...base, analysts: analysts(1), revenueGrowth: 80, netMargin: 40, peerOf: ['A', 'B', 'C', 'D'] })
  const worst = scoreItem({ ...base, analysts: analysts(0), revenueGrowth: -50, netMargin: -30, peerOf: [] })
  assert.equal(best, 100)
  assert.equal(worst, 0)

  const unknown = scoreItem(base) // missing data scores neutral, not zero
  assert.isAbove(unknown, worst)
  assert.isBelow(unknown, best)
  assert.isAbove(scoreItem({ ...base, analysts: analysts(0.9) }), scoreItem({ ...base, analysts: analysts(0.3) }))
  assert.isAbove(scoreItem({ ...base, peerOf: ['A', 'B', 'C'] }), unknown)
})
