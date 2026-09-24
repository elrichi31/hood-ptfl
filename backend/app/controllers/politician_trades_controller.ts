import type { HttpContext } from '@adonisjs/core/http'
import { getPoliticianTradesForHoldings } from '#services/enrichment'

export default class PoliticianTradesController {
  async index({ response }: HttpContext) {
    return response.ok(await getPoliticianTradesForHoldings())
  }
}
