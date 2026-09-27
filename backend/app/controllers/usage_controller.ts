import type { HttpContext } from '@adonisjs/core/http'
import { getApiUsage } from '#services/api_usage'

export default class UsageController {
  async index({ response }: HttpContext) {
    return response.ok(await getApiUsage())
  }
}
