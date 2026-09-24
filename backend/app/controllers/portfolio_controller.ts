import type { HttpContext } from '@adonisjs/core/http'
import { getLatest } from '#services/poller'

export default class PortfolioController {
  /** Balance, positions, P&L and orders from the poller's last pull — never live. */
  async latest({ response }: HttpContext) {
    const latest = await getLatest()
    return latest ? response.ok(latest) : response.serviceUnavailable({ error: 'No data pulled yet' })
  }
}
