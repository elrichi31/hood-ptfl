/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),
  // Shared secret the Next.js server sends as x-internal-token (use a long random value)
  BACKEND_TOKEN: Env.schema.string(),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // News providers (blank = that provider is skipped)
  FINNHUB_API_KEY: Env.schema.string.optional(),
  ALPHAVANTAGE_API_KEY: Env.schema.string.optional(),
  MARKETAUX_API_KEY: Env.schema.string.optional(),

  // TypeSafe (Jev) news classification — blank = keyword heuristics only
  TYPESAFE_API_KEY: Env.schema.string.optional(),
})
