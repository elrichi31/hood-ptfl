import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { trackedFetch, getApiUsage, budgetAllows } from '#services/api_usage'

test('trackedFetch counts calls, failures and rate-limit headers per provider', async ({ assert, cleanup }) => {
  await db.beginGlobalTransaction()
  const realFetch = globalThis.fetch
  cleanup(async () => {
    globalThis.fetch = realFetch
    await db.rollbackGlobalTransaction()
  })

  let status = 200
  globalThis.fetch = async () =>
    new Response('{}', { status, headers: { 'X-Ratelimit-Remaining': '42' } })

  const before = (await getApiUsage()).find((u) => u.provider === 'finnhub')!.today
  await trackedFetch('finnhub', 'https://example.test')
  status = 429
  await trackedFetch('finnhub', 'https://example.test')

  const finnhub = (await getApiUsage()).find((u) => u.provider === 'finnhub')!
  assert.equal(finnhub.today, before + 2)
  assert.isAtLeast(finnhub.todayErrors, 1)
  assert.equal(finnhub.rateHeaders?.['x-ratelimit-remaining'], '42')
})

test('budgetAllows spreads a daily quota evenly and keeps one call spare', ({ assert }) => {
  const at = (h: number) => new Date(Date.UTC(2026, 8, 27, h))
  // Alpha Vantage, 25/day: ~1 per hour
  assert.isTrue(budgetAllows('alphavantage', 0, at(0)))
  assert.isFalse(budgetAllows('alphavantage', 1, at(0)))
  assert.isTrue(budgetAllows('alphavantage', 12, at(12)))
  assert.isFalse(budgetAllows('alphavantage', 13, at(12)))
  assert.isFalse(budgetAllows('alphavantage', 24, at(23.99))) // never the 25th
  // Marketaux, 100/day: at noon ~50 used is fine, 51 isn't
  assert.isTrue(budgetAllows('marketaux', 50, at(12)))
  assert.isFalse(budgetAllows('marketaux', 51, at(12)))
  // Finnhub has no daily cap
  assert.isTrue(budgetAllows('finnhub', 10_000, at(1)))
})
