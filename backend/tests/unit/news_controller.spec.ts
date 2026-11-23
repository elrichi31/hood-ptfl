import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import NewsController from '#controllers/news_controller'

function call(qs: Record<string, unknown>) {
  let status = 0
  let body: unknown
  const context = {
    request: { qs: () => qs },
    response: {
      ok(v: unknown) {
        status = 200
        body = v
      },
      badRequest(v: unknown) {
        status = 400
        body = v
      },
    },
  } as unknown as HttpContext
  return new NewsController().page(context).then(() => ({ status, body }))
}

test.group('news page: query validation', () => {
  test('rejects malformed paging, sort and category before touching the feed', async ({
    assert,
  }) => {
    const bad: Record<string, unknown>[] = [
      { limit: '0' },
      { limit: '51' },
      { limit: 'abc' },
      { limit: ['5'] },
      { offset: '-1' },
      { offset: '1.5' },
      { offset: '9999999' },
      { sort: 'oldest' },
      { category: 'sports' },
    ]
    for (const qs of bad) {
      const res = await call(qs)
      assert.equal(res.status, 400, `${JSON.stringify(qs)} must be rejected`)
    }
  })
})
