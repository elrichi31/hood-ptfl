import { test } from '@japa/runner'
import { mock } from 'node:test'
import { EventEmitter } from 'node:events'
import type { HttpContext } from '@adonisjs/core/http'
import LiveController from '#controllers/live_controller'
import type { LivePriceEvent } from '#services/live_prices'

function setup(failAt = Infinity) {
  const snapshot: LivePriceEvent = {
    prices: { AAPL: 10 },
    timestamps: { AAPL: 1234 },
    provider: 'connected',
    lastTradeAt: 1234,
  }
  const listeners = new Set<(event: LivePriceEvent) => void>()
  const feed = {
    snapshot: () => snapshot,
    subscribe(fn: (event: LivePriceEvent) => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    writeHead() {},
    write(data: string) {
      if (writes.length >= failAt) throw new Error('closed')
      writes.push(data)
      return true
    },
  })
  const writes: string[] = []
  const request = new EventEmitter()
  const context = { request: { request }, response: { response: res } } as unknown as HttpContext
  return {
    controller: new LiveController(feed),
    context,
    request,
    res,
    writes,
    listeners,
    snapshot,
  }
}

test.group('live SSE', (group) => {
  group.each.setup(() => {
    mock.timers.enable({ apis: ['setInterval'] })
    return () => mock.timers.reset()
  })

  test('initial full snapshot, trade events and 25s heartbeats preserve provider timestamps', async ({
    assert,
  }) => {
    const { controller, context, request, res, writes, listeners, snapshot } = setup()
    const done = controller.stream(context)
    assert.deepEqual(JSON.parse(writes[0].slice(6)), snapshot)
    request.emit('close') // Incoming request close is not the SSE response disconnect.
    assert.equal(listeners.size, 1)
    for (const fn of listeners) fn({ ...snapshot, provider: 'reconnecting' })
    assert.equal(JSON.parse(writes[1].slice(6)).provider, 'reconnecting')
    mock.timers.tick(25_000)
    assert.deepEqual(JSON.parse(writes[2].slice(6)), snapshot)
    res.emit('close')
    await done
    assert.equal(listeners.size, 0)
    assert.equal(res.listenerCount('close'), 0)
    assert.equal(res.listenerCount('error'), 0)
    mock.timers.tick(50_000)
    assert.lengthOf(writes, 3)
  })

  test('initial write failure releases listeners and never leaves a heartbeat', async ({
    assert,
  }) => {
    const { controller, context, writes, listeners, res } = setup(0)
    await controller.stream(context)
    assert.equal(listeners.size, 0)
    assert.equal(res.listenerCount('close'), 0)
    mock.timers.tick(50_000)
    assert.lengthOf(writes, 0)
  })

  test('heartbeat write failure and response error clean up', async ({ assert }) => {
    for (const failAt of [1, Infinity]) {
      const { controller, context, writes, listeners, res } = setup(failAt)
      const done = controller.stream(context)
      if (failAt === 1) mock.timers.tick(25_000)
      else res.emit('error', new Error('disconnected'))
      await done
      assert.equal(listeners.size, 0)
      assert.equal(res.listenerCount('close'), 0)
      mock.timers.tick(50_000)
      assert.lengthOf(writes, 1)
    }
  })
})
