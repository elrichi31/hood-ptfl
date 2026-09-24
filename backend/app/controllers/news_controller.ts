import type { HttpContext } from '@adonisjs/core/http'
import { getNewsFeed } from '#services/news'

export default class NewsController {
  async index({ response }: HttpContext) {
    return response.ok(await getNewsFeed())
  }
}
