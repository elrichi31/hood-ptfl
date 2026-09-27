import type { HttpContext } from '@adonisjs/core/http'
import { getDiscover } from '#services/discover'

export default class DiscoverController {
  async index({ response }: HttpContext) {
    return response.ok(getDiscover())
  }
}
