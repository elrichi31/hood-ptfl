import { test } from '@japa/runner'
import { mock } from 'node:test'
import type { HttpContext } from '@adonisjs/core/http'
import PortfolioSnapshot from '#models/portfolio_snapshot'
import HistoryController from '#controllers/history_controller'

function setup(limit?: unknown) {
  const limits: number[] = []
  const orders: unknown[][] = []
  const query = mock.method(PortfolioSnapshot, 'query', () => ({
    orderBy(...args: unknown[]) {
      orders.push(args)
      return this
    },
    async limit(value: number) {
      limits.push(value)
      return []
    },
  }))
  let status = 0
  let body: unknown
  const context = {
    request: { qs: () => (limit === undefined ? {} : { limit }) },
    response: {
      ok(value: unknown) {
        status = 200
        body = value
      },
      badRequest(value: unknown) {
        status = 400
        body = value
      },
    },
  } as unknown as HttpContext
  return { context, query, limits, orders, result: () => ({ status, body }) }
}

test.group('history limit', (group) => {
  group.each.teardown(() => mock.restoreAll())

  test('rejects invalid limits before querying snapshots', async ({ assert }) => {
    for (const limit of [
      '',
      'abc',
      'NaN',
      'Infinity',
      '0',
      '-1',
      '1.5',
      '10001',
      ['5'],
      { n: 5 },
    ]) {
      const s = setup(limit)
      await new HistoryController().index(s.context)
      assert.equal(s.result().status, 400, `limit ${JSON.stringify(limit)} must return 400`)
      assert.equal(s.query.mock.callCount(), 0)
      assert.deepEqual(s.result().body, { error: 'limit must be an integer between 1 and 10000' })
      s.query.mock.restore()
    }
  })

  test('preserves the default and accepts bounded integer limits', async ({ assert }) => {
    for (const [input, expected] of [
      [undefined, 2000],
      ['1', 1],
      ['2000', 2000],
      ['10000', 10000],
    ]) {
      const s = setup(input)
      await new HistoryController().index(s.context)
      assert.equal(s.result().status, 200)
      assert.deepEqual(s.limits, [expected])
      assert.deepEqual(s.orders, [['created_at', 'desc']])
      assert.deepEqual(s.result().body, [])
      s.query.mock.restore()
    }
  })
})
