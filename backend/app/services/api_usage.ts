import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

export type Provider = 'finnhub' | 'alphavantage' | 'marketaux' | 'typesafe'

// Free-tier limits as published by each provider. null = no daily cap / not published.
const PROVIDERS: Record<Provider, { envKey: string; perDay: number | null; perMinute: number | null }> = {
  finnhub: { envKey: 'FINNHUB_API_KEY', perDay: null, perMinute: 60 },
  alphavantage: { envKey: 'ALPHAVANTAGE_API_KEY', perDay: 25, perMinute: 5 },
  marketaux: { envKey: 'MARKETAUX_API_KEY', perDay: 100, perMinute: null },
  typesafe: { envKey: 'TYPESAFE_API_KEY', perDay: null, perMinute: null },
}

// Rate-limit headers from the latest response (Finnhub sends X-Ratelimit-*). In memory: they're per-minute anyway.
const lastHeaders = new Map<Provider, Record<string, string>>()

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10)

/** fetch() that counts every call against the provider's daily quota. Never throws on bookkeeping. */
export async function trackedFetch(provider: Provider, url: string, init?: RequestInit) {
  let ok = false
  try {
    const res = await fetch(url, init)
    ok = res.ok
    const limits = Object.fromEntries(
      [...res.headers].filter(([k]) => /ratelimit|usage|quota/i.test(k))
    )
    if (Object.keys(limits).length) lastHeaders.set(provider, limits)
    return res
  } finally {
    const now = new Date()
    await db
      .table('api_usages')
      .insert({ provider, day: utcDay(now), calls: 1, errors: ok ? 0 : 1, updated_at: now })
      .onConflict(['provider', 'day'])
      .merge({
        calls: db.raw('api_usages.calls + 1'),
        errors: db.raw('api_usages.errors + ?', [ok ? 0 : 1]),
        updated_at: now,
      })
      .catch((err) => logger.warn({ err }, `[api-usage] could not record ${provider} call`))
  }
}

/** Per provider: today's calls vs quota plus the last 7 UTC days. */
export async function getApiUsage() {
  const since = utcDay(new Date(Date.now() - 6 * 24 * 3600 * 1000))
  const rows = await db.from('api_usages').where('day', '>=', since).orderBy('day', 'asc')
  const today = utcDay()

  return (Object.keys(PROVIDERS) as Provider[]).map((provider) => {
    const { envKey, perDay, perMinute } = PROVIDERS[provider]
    const mine = rows.filter((r) => r.provider === provider)
    const todayRow = mine.find((r) => r.day === today)
    const total = mine.reduce((s, r) => s + Number(r.calls), 0)
    return {
      provider,
      configured: Boolean(env.get(envKey as any)),
      perDay,
      perMinute,
      today: Number(todayRow?.calls ?? 0),
      todayErrors: Number(todayRow?.errors ?? 0),
      avg7d: Math.round((total / 7) * 10) / 10,
      days: mine.map((r) => ({ day: r.day, calls: Number(r.calls), errors: Number(r.errors) })),
      rateHeaders: lastHeaders.get(provider) ?? null,
      lastCallAt: mine.at(-1)?.updated_at ?? null,
    }
  })
}
