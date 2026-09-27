import type { HttpContext } from '@adonisjs/core/http'
import { getInsiderActivity } from '#services/insiders'

export default class InsidersController {
  async index({ response }: HttpContext) {
    return response.ok(await getInsiderActivity())
  }
}
