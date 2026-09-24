import { timingSafeEqual } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

/**
 * The backend is internal-only: every request must carry the shared secret the
 * Next.js server sends (BACKEND_TOKEN), so exposing the port by mistake leaks nothing.
 */
export default class InternalTokenMiddleware {
  handle({ request, response }: HttpContext, next: NextFn) {
    const expected = Buffer.from(env.get('BACKEND_TOKEN'))
    const given = Buffer.from(request.header('x-internal-token') ?? '')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return response.unauthorized({ error: 'Unauthorized' })
    }
    return next()
  }
}
