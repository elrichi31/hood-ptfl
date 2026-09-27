import { test } from '@japa/runner'
import { computeRisk, earningsMoves, project, tailRisk, type Closes } from '#services/risk'

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
    new Map([
      ['LEV', series(2)],
      ['SPY', spy],
    ]),
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

test('projection ignores the trailing return and follows the CAPM drift', ({ assert }) => {
  // A history that went up 0.3%/day (~+100%/yr) with ±1% noise.
  const daily = Array.from({ length: 500 }, (_, i) => 0.003 + (i % 2 ? 0.01 : -0.01))
  const a = project(daily, 1, 1000)!
  const b = project(daily, 1, 1000)!
  assert.deepEqual(a.horizons, b.horizons) // seeded → stable between loads

  const year = a.horizons[2]
  // Drift = 4% + 1 × 5% = 9%/yr, so the median lands near +9%, nowhere near +100%.
  assert.closeTo(year.p50! / 1000 - 1, 0.09, 0.03)
  assert.isBelow(year.p5!, year.p50!)
  assert.isAbove(year.p95!, year.p50!)
  assert.equal(a.bands[0].p50, 1000)
  assert.isBelow(a.drawdownBadPct!, a.drawdownTypicalPct!)
})

test('earnings moves use the session that priced the report in', ({ assert }) => {
  const closes: Closes = new Map([
    ['2026-07-01', 100],
    ['2026-07-02', 110], // am report on 07-02: +10% vs 07-01
    ['2026-08-03', 200],
    ['2026-08-04', 200], // pm report on 08-04 → reaction on 08-05
    ['2026-08-05', 180], // −10%
  ])
  const moves = earningsMoves(
    [
      { date: '2026-07-02', timing: 'am' },
      { date: '2026-08-04', timing: 'pm' },
      { date: '2026-11-03', timing: 'pm' }, // future, ignored
    ],
    closes,
    '2026-09-27'
  )
  assert.lengthOf(moves, 2)
  assert.closeTo(moves[0], 10, 1e-9) // newest first
  assert.closeTo(moves[1], 10, 1e-9)
})

test('tailRisk: historical VaR is the 5th-percentile loss, CVaR the average beyond it', ({
  assert,
}) => {
  // 100 days: 95 flat, 5 losses of 1..5%.
  const daily = [...Array(95).fill(0), -0.01, -0.02, -0.03, -0.04, -0.05]
  const { var95, cvar95 } = tailRisk(daily, 1000)
  assert.equal(var95, 10) // the 5th-worst day: −1%
  assert.equal(cvar95, 30) // mean of the worst five: −3%
  assert.isAbove(cvar95!, var95!)
  assert.deepEqual(tailRisk([0.01], 1000), { var95: null, cvar95: null })
})
