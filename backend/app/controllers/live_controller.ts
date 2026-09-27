import type { HttpContext } from '@adonisjs/core/http'
import { livePrices, onLivePrices } from '#services/live_prices'

export default class LiveController {
  /** Server-Sent Events: a snapshot of every known price, then batches of changes as trades land. */
  async stream({ request, response }: HttpContext) {
    const res = response.response
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no', // don't let a reverse proxy buffer the stream
    })
    const send = (batch: Record<string, number>) => res.write(`data: ${JSON.stringify(batch)}\n\n`)
    send(livePrices())

    const off = onLivePrices(send)
    // Comment line every 25s so idle proxies don't cut the connection while the market's closed.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)

    await new Promise<void>((resolve) =>
      request.request.on('close', () => {
        off()
        clearInterval(heartbeat)
        resolve()
      })
    )
  }
}
