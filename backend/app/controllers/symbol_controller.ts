import type { HttpContext } from '@adonisjs/core/http'
import { getSymbolDetails } from '#services/enrichment'

export default class SymbolController {
  async show({ response, params }: HttpContext) {
    return response.ok(await getSymbolDetails(params.symbol.toUpperCase()))
  }
}
