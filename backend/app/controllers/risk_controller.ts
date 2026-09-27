import type { HttpContext } from '@adonisjs/core/http'
import { getRisk, symbolReturns } from '#services/risk'

export default class RiskController {
  async index({ response }: HttpContext) {
    return response.ok(await getRisk())
  }

  async returns({ response, params }: HttpContext) {
    const symbol = String(params.symbol).toUpperCase()
    if (!/^[A-Z.]{1,6}$/.test(symbol)) return response.badRequest({ error: 'Invalid symbol' })
    const data = await symbolReturns(symbol)
    return data ? response.ok(data) : response.notFound({ error: `No price history for ${symbol}` })
  }
}
