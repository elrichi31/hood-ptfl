import type { HttpContext } from '@adonisjs/core/http'
import { getHeldSectors } from '#services/sectors'

export default class SectorsController {
  async index({ response }: HttpContext) {
    return response.ok(await getHeldSectors())
  }
}
