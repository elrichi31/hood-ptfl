import { test } from '@japa/runner'
import { computeRisk, type Closes } from '#services/risk'

// 30 trading days of a benchmark that alternates +1% / -1%.
const days = Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
const series = (mult: number): Closes => {
  let p = 100
  return new Map(days.map((d, i) => [d, i ? (p *= 1 + (i % 2 ? 0.01 : -0.01) * mult) : p]))
}

test('beta, concentration, drawdown and scenarios from daily closes', ({ assert }) => {
  const spy = series(1)
  const risk = computeRisk(
    [
      { symbol: 'LEV', type: 'equity', value: 600, sector: 'Tech' },
      { symbol: 'SPY', type: 'equity', value: 300, sector: 'Funds & ETFs' },
      { symbol: 'USDC', type: 'crypto', value: 100, sector: null },
    ],
    0,
    new Map([['LEV', series(2)], ['SPY', spy]]),
    spy
  )

  const beta = (s: string) => risk.positions.find((p) => p.symbol === s)!.beta
  assert.closeTo(beta('LEV')!, 2, 0.01)
  assert.closeTo(beta('SPY')!, 1, 0.01)
  assert.equal(beta('USDC'), 0)
  assert.closeTo(risk.beta!, 0.6 * 2 + 0.3 * 1, 0.01)

  assert.deepEqual(risk.concentration.top1, { symbol: 'LEV', pct: 60 })
  assert.equal(risk.concentration.top3Pct, 100)
  assert.closeTo(risk.concentration.effectivePositions!, 1 / (0.36 + 0.09 + 0.01), 0.1)

  assert.isBelow(risk.maxDrawdownPct!, 0)
  assert.closeTo(risk.worstDay!.pct!, -1.5, 0.01) // 0.6·-2% + 0.3·-1%
  assert.closeTo(risk.scenarios[1].loss!, -(600 * 2 + 300) * 0.1, 0.5)
})
