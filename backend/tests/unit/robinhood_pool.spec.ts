import { test } from '@japa/runner'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { createToolPool } from '#services/robinhood'

function fakeConnect(script: Array<(name: string) => unknown>) {
  const stats = { connects: 0, closes: 0, calls: 0 }
  const connect = async () => {
    const id = stats.connects++
    return {
      callTool: async ({ name }: { name: string }) => {
        stats.calls++
        const step = script[Math.min(id, script.length - 1)]
        return step(name)
      },
      close: async () => {
        stats.closes++
      },
    } as any
  }
  return { connect, stats }
}

test.group('robinhood tool pool', () => {
  test('reuses one session across sequential and concurrent calls', async ({ assert }) => {
    const { connect, stats } = fakeConnect([(n) => ({ content: [{ text: n }] })])
    const call = createToolPool(connect)
    await call('get_a', {})
    await Promise.all([call('get_b', {}), call('get_c', {}), call('get_d', {})])
    assert.equal(stats.connects, 1)
    assert.equal(stats.calls, 4)
  })

  test('reconnects and retries once when the transport fails', async ({ assert }) => {
    const { connect, stats } = fakeConnect([
      () => {
        throw new Error('socket hang up')
      },
      (n) => ({ content: [{ text: n }] }),
    ])
    const call = createToolPool(connect)
    const res: any = await call('get_a', {})
    assert.equal(res.content[0].text, 'get_a')
    assert.equal(stats.connects, 2)
  })

  test('gives up after one retry', async ({ assert }) => {
    const { connect, stats } = fakeConnect([
      () => {
        throw new Error('down')
      },
    ])
    const call = createToolPool(connect)
    await assert.rejects(() => call('get_a', {}), 'down')
    assert.equal(stats.connects, 2)
  })

  test('does not retry or tear down on a protocol error from a healthy server', async ({
    assert,
  }) => {
    const { connect, stats } = fakeConnect([
      () => {
        throw new McpError(ErrorCode.InvalidParams, 'bad symbol')
      },
    ])
    const call = createToolPool(connect)
    await assert.rejects(() => call('get_a', {}), /bad symbol/)
    await assert.rejects(() => call('get_b', {}), /bad symbol/)
    assert.equal(stats.connects, 1)
    assert.equal(stats.calls, 2)
  })

  test('treats a request timeout as an unhealthy session', async ({ assert }) => {
    const { connect, stats } = fakeConnect([
      () => {
        throw new McpError(ErrorCode.RequestTimeout, 'timed out')
      },
      (n) => ({ content: [{ text: n }] }),
    ])
    const call = createToolPool(connect)
    await call('get_a', {})
    assert.equal(stats.connects, 2)
  })

  test('recycles the session after its max age', async ({ assert }) => {
    let t = 0
    const { connect, stats } = fakeConnect([(n) => ({ content: [{ text: n }] })])
    const call = createToolPool(connect, { maxAgeMs: 1000, now: () => t })
    await call('get_a', {})
    t = 500
    await call('get_b', {})
    assert.equal(stats.connects, 1)
    t = 1500
    await call('get_c', {})
    assert.equal(stats.connects, 2)
  })

  test('a failed connect is not cached', async ({ assert }) => {
    let n = 0
    const call = createToolPool(async () => {
      if (n++ === 0) throw new Error('offline')
      return { callTool: async () => ({ content: [] }), close: async () => {} } as any
    })
    await call('get_a', {}) // first attempt fails to connect, retry succeeds
    assert.equal(n, 2)
  })
})
