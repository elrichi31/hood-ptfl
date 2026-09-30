import type { HttpContext } from '@adonisjs/core/http'
import { livePriceFeed, type LivePriceEvent } from '#services/live_prices'

type Feed = Pick<typeof livePriceFeed, 'snapshot' | 'subscribe'>

export default class LiveController {
  constructor(private feed: Feed = livePriceFeed) {}

  /** Full snapshots include provider status and original trade timestamps. */
  async stream({ response }: HttpContext) {
    const res = response.response
    await new Promise<void>((resolve) => {
      let closed = false
      let off: () => unknown = () => {}
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const cleanup = () => {
        if (closed) return
        closed = true
        off()
        clearInterval(heartbeat)
        res.off('close', cleanup)
        res.off('error', cleanup)
        resolve()
      }
      const send = (event: LivePriceEvent) => {
        if (closed) return
        if (res.destroyed || res.writableEnded) {
          cleanup()
          return
        }
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        } catch {
          cleanup()
          res.destroy?.()
        }
      }
      // IncomingMessage.close can fire when the GET request completes, not when SSE disconnects.
      res.on('close', cleanup)
      res.on('error', cleanup)
      try {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache, no-transform',
          'connection': 'keep-alive',
          'x-accel-buffering': 'no',
        })
        send(this.feed.snapshot())
        if (closed) return
        off = this.feed.subscribe(send)
        // This keeps proxies alive WITHOUT making cached prices appear freshly received.
        heartbeat = setInterval(() => send(this.feed.snapshot()), 25_000)
      } catch {
        cleanup()
        res.destroy?.()
      }
    })
  }
}
