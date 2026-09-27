import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { trackedFetch, getApiUsage } from '#services/api_usage'

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
