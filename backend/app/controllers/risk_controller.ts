import type { HttpContext } from '@adonisjs/core/http'
import { getRisk } from '#services/risk'

export default class RiskController {
  async index({ response }: HttpContext) {
    return response.ok(await getRisk())
  }
}
