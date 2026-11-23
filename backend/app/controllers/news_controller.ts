import type { HttpContext } from '@adonisjs/core/http'
import { getNewsFeed, getNewsPage, type NewsQuery } from '#services/news'

const CATEGORIES = new Set(['high-impact', 'earnings', 'company', 'crypto', 'macro', 'sec'])
const MAX_LIMIT = 50

/** Strict integer from a query string, or null when absent; undefined when present but invalid. */
function intParam(raw: unknown, fallback: number, min: number, max: number) {
  if (raw === undefined) return fallback
  if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw)) return undefined
  const n = Number(raw)
  return n >= min && n <= max ? n : undefined
}

export default class NewsController {
  /** The whole feed (used by the alerts bell). */
  async index({ response }: HttpContext) {
    return response.ok(await getNewsFeed())
  }

  /** One page of cards plus, on the first page, the summary the side panels need. */
  async page({ request, response }: HttpContext) {
    const qs = request.qs()
    const limit = intParam(qs.limit, 12, 1, MAX_LIMIT)
    const offset = intParam(qs.offset, 0, 0, 100_000)
    if (limit === undefined || offset === undefined) {
      return response.badRequest({
        error: `limit must be 1-${MAX_LIMIT} and offset a non-negative integer`,
      })
    }
    const sort = qs.sort === undefined ? 'relevance' : qs.sort
    if (sort !== 'relevance' && sort !== 'newest') {
      return response.badRequest({ error: 'sort must be relevance or newest' })
    }
    const text = (v: unknown, max: number) =>
      typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined
    const category = text(qs.category, 20)
    if (category !== undefined && !CATEGORIES.has(category)) {
      return response.badRequest({ error: 'unknown category' })
    }
    const query: NewsQuery = {
      limit,
      offset,
      sort,
      category,
      ticker: text(qs.ticker, 12),
      source: text(qs.source, 80),
      q: text(qs.q, 100),
    }
    return response.ok(await getNewsPage(query))
  }
}
