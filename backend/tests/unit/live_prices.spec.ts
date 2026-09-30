import { test } from '@japa/runner'
import { mock } from 'node:test'
import * as live from '#services/live_prices'

class Socket {
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  send() {}
  close() {}
  trade(data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ type: 'trade', data }) })
  }
}

function setup() {
  let holdings = new Map([
    ['AAPL', 'AAPL'],
    ['COINBASE:BTC-USD', 'BTC'],
  ])
  const sockets: Socket[] = []
  const feed = live.createLivePriceFeed(
    async () => holdings,
    () => {
      const socket = new Socket()
      sockets.push(socket)
      return socket as unknown as WebSocket
    }
  )
  return { feed, sockets, sell: () => (holdings = new Map()) }
}

test.group('live prices', (group) => {
  group.each.setup(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    return () => mock.timers.reset()
  })

  test('disabled without a key; opening emits connected but no invented freshness', async ({
    assert,
  }) => {
    const { feed, sockets } = setup()
    const events: unknown[] = []
    feed.subscribe((event) => events.push(event))
    feed.start()
    assert.lengthOf(sockets, 0)
    assert.deepEqual(feed.snapshot(), {
      prices: {},
      timestamps: {},
      provider: 'disabled',
      lastTradeAt: null,
    })
    feed.start('dummy')
    assert.equal(feed.snapshot().provider, 'reconnecting')
    sockets[0].onopen?.()
    await feed.resync()
    assert.deepEqual(events.at(-1), {
      prices: {},
      timestamps: {},
      provider: 'connected',
      lastTradeAt: null,
    })
    feed.stop()
  })

  test('valid newest provider timestamps only; malformed/nontrade messages are harmless', async ({
    assert,
  }) => {
    const { feed, sockets } = setup()
    const events: unknown[] = []
    feed.subscribe((event) => events.push(event))
    feed.start('dummy')
    sockets[0].onopen?.()
    await feed.resync()
    for (const data of ['{', 'null', '[]', '{"type":"ping"}', '{"type":"trade","data":{}}']) {
      assert.doesNotThrow(() => sockets[0].onmessage?.({ data }))
    }
    sockets[0].trade([
      null,
      { s: 'AAPL', p: 10, t: 2000 },
      { s: 'AAPL', p: 9, t: 1000 },
      { s: 'AAPL', p: 99, t: '3000' },
      { s: 'AAPL', p: '99', t: 3000 },
      { s: 'AAPL', p: -1, t: 3000 },
      { s: 'AAPL', p: 99, t: 0 },
      { s: 'AAPL', p: 99 },
      { s: 'UNKNOWN', p: 99, t: 3000 },
      { s: 'COINBASE:BTC-USD', p: 50, t: 2500 },
    ])
    // JSON cannot represent Infinity: test the raw numeric overflow explicitly.
    sockets[0].onmessage?.({
      data: '{"type":"trade","data":[{"s":"AAPL","p":1e400,"t":3000},{"s":"AAPL","p":99,"t":1e400}]}',
    })
    mock.timers.tick(1000)
    assert.deepEqual(events.at(-1), {
      prices: { AAPL: 10, BTC: 50 },
      timestamps: { AAPL: 2000, BTC: 2500 },
      provider: 'connected',
      lastTradeAt: 2500,
    })
    assert.deepEqual(feed.prices(), { AAPL: 10, BTC: 50 })
    feed.stop()
  })

  test('error/close immediately reconnecting, retry connects, and sold symbols disappear', async ({
    assert,
  }) => {
    const { feed, sockets, sell } = setup()
    const events: ReturnType<typeof feed.snapshot>[] = []
    const off = feed.subscribe((event) => events.push(event))
    feed.start('dummy')
    sockets[0].onopen?.()
    await feed.resync()
    sockets[0].trade([{ s: 'AAPL', p: 10, t: 2000 }])
    sockets[0].onerror?.()
    assert.equal(events.at(-1)?.provider, 'reconnecting')
    mock.timers.tick(1000)
    assert.equal(events.at(-1)?.provider, 'reconnecting')
    sockets[0].onclose?.({ code: 1006, reason: '' })
    assert.equal(events.at(-1)?.provider, 'reconnecting')
    mock.timers.tick(5000)
    assert.lengthOf(sockets, 2)
    sockets[1].onopen?.()
    await feed.resync()
    assert.equal(feed.snapshot().lastTradeAt, 2000)
    sell()
    await feed.resync()
    assert.deepEqual(events.at(-1), {
      prices: {},
      timestamps: {},
      provider: 'connected',
      lastTradeAt: null,
    })
    off()
    const count = events.length
    feed.stop()
    mock.timers.tick(300_000)
    assert.lengthOf(events, count)
  }).timeout(0) // Advancing fake reconnect time must not fire Japa's real test deadline.
})
