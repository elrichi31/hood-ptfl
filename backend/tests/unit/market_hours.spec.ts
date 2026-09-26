import { test } from '@japa/runner'
import { sessionOf } from '#services/daily_pnl'
import { marketClock } from '#services/poller'

// Sept 2026 is EDT (UTC-4).
const et = (s: string) => new Date(`${s}-04:00`)

test.group('market hours', () => {
  test('close poll counts toward the same session, after-hours rolls forward', ({ assert }) => {
    assert.equal(sessionOf(et('2026-09-25T16:00:05')), '2026-09-25')
    assert.equal(sessionOf(et('2026-09-25T16:01:00')), '2026-09-28') // Fri AH → Mon
  })

  test('holidays roll into the next trading day', ({ assert }) => {
    assert.equal(sessionOf(et('2026-09-07T12:00:00')), '2026-09-08') // Labor Day
    assert.equal(sessionOf(et('2026-09-04T17:00:00')), '2026-09-08') // Fri AH skips the weekend + Labor Day
  })

  test('poller wakes on the open and on the close', ({ assert }) => {
    const pre = marketClock(et('2026-09-25T09:29:00'))
    assert.isFalse(pre.open)
    assert.approximately(pre.msToBoundary, 60_000, 1)
    const late = marketClock(et('2026-09-25T15:58:00'))
    assert.isTrue(late.open)
    assert.approximately(late.msToBoundary, 120_000, 1)
    assert.isFalse(marketClock(et('2026-09-07T11:00:00')).open) // Labor Day
  })
})
