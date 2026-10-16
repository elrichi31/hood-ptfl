import { test } from '@japa/runner'
import { cacheAsync } from '#services/async_cache'

test('async cache shares builds, expires after success and retries failures', async ({
  assert,
}) => {
  let now = 0
  let calls = 0
  let release!: (value: number) => void
  const load = cacheAsync(
    () => {
      calls++
      return new Promise<number>((resolve) => {
        release = resolve
      })
    },
    60000,
    () => now
  )
  const first = load()
  const second = load()
  await Promise.resolve()
  assert.equal(calls, 1)
  now = 5000
  release(42)
  assert.deepEqual(await Promise.all([first, second]), [42, 42])
  now = 64999
  assert.equal(await load(), 42)
  assert.equal(calls, 1)
  now = 65000
  const third = load()
  await Promise.resolve()
  assert.equal(calls, 2)
  release(43)
  assert.equal(await third, 43)

  let attempts = 0
  const retry = cacheAsync(async () => {
    if (++attempts === 1) throw new Error('offline')
    return []
  }, 60000)
  await assert.rejects(() => retry(), 'offline')
  assert.deepEqual(await retry(), [])
  assert.deepEqual(await retry(), [])
  assert.equal(attempts, 2)
})
