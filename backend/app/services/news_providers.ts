import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import type { NewsAi } from '#services/typesafe'

export type RawArticle = {
  provider: 'finnhub' | 'alphavantage' | 'marketaux'
  externalId: string
  headline: string
  description: string
  summary: string
  url: string
  sourceName: string
  tickers: string[]
  publishedAt: Date
  /** -1..1 */
  sentimentScore: number
  /** 0..1, how on-topic the article is for its matched tickers */
  relevanceRaw: number
  /** AlphaVantage-only: lets categorize() skip the keyword heuristic when present. */
  topics?: string[]
  /** TypeSafe classification, when TYPESAFE_API_KEY is set — overrides the heuristics. */
  ai?: NewsAi | null
  /** TypeSafe story link (see linkStories); when set it overrides headline-similarity grouping. */
  storyId?: number | null
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** A provider outage shouldn't take down the whole poll — log and return nothing. */
async function safeFetchJson(url: string, provider: string): Promise<any | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn(`[news:${provider}] HTTP ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    logger.warn({ err }, `[news:${provider}] request failed`)
    return null
  }
}

/** Company news per held equity, one Finnhub call per symbol (60 req/min on the free tier). */
export async function fetchFinnhubNews(symbols: string[]): Promise<RawArticle[]> {
  const key = env.get('FINNHUB_API_KEY')
  if (!key || !symbols.length) return []

  const to = new Date()
  const from = new Date(to.getTime() - 2 * 24 * 3600 * 1000)

  const perSymbol = await Promise.all(
    symbols.map(async (symbol) => {
      const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${ymd(from)}&to=${ymd(to)}&token=${key}`
      const items = await safeFetchJson(url, 'finnhub')
      if (!Array.isArray(items)) return []
      // Finnhub has no server-side result cap and syndicates a lot of wire-service filler —
      // keep only the newest handful per symbol so one popular ticker can't flood the feed.
      return items
        .sort((a: any, b: any) => b.datetime - a.datetime)
        .slice(0, 12)
        .map((item: any): RawArticle => ({
          provider: 'finnhub',
          externalId: String(item.id),
          headline: item.headline,
          description: item.summary ?? '',
          summary: item.summary ?? '',
          url: item.url,
          sourceName: item.source ?? 'Finnhub',
          tickers: [symbol],
          publishedAt: new Date(item.datetime * 1000),
          sentimentScore: estimateSentiment(`${item.headline} ${item.summary ?? ''}`),
          relevanceRaw: 0.55, // ponytail: flat prior (this endpoint is already symbol-scoped) — weight by keyword match if it gets noisy
        }))
    })
  )
  return perSymbol.flat()
}

/** General market headlines (not tied to a single ticker) — mainly feeds the Macro filter. */
export async function fetchFinnhubGeneralNews(): Promise<RawArticle[]> {
  const key = env.get('FINNHUB_API_KEY')
  if (!key) return []

  const items = await safeFetchJson(
    `https://finnhub.io/api/v1/news?category=general&token=${key}`,
    'finnhub'
  )
  if (!Array.isArray(items)) return []
  return items.slice(0, 30).map((item: any): RawArticle => ({
    provider: 'finnhub',
    externalId: String(item.id),
    headline: item.headline,
    description: item.summary ?? '',
    summary: item.summary ?? '',
    url: item.url,
    sourceName: item.source ?? 'Finnhub',
    tickers: [],
    publishedAt: new Date(item.datetime * 1000),
    sentimentScore: estimateSentiment(`${item.headline} ${item.summary ?? ''}`),
    relevanceRaw: 0.4,
  }))
}

/** Earnings dates for held tickers in the next 3 weeks — one Finnhub call, filtered client-side. */
export async function fetchUpcomingEarnings(
  symbols: string[]
): Promise<{ label: string; date: string }[]> {
  const key = env.get('FINNHUB_API_KEY')
  if (!key || !symbols.length) return []

  const from = new Date()
  const to = new Date(from.getTime() + 21 * 24 * 3600 * 1000)
  const data = await safeFetchJson(
    `https://finnhub.io/api/v1/calendar/earnings?from=${ymd(from)}&to=${ymd(to)}&token=${key}`,
    'finnhub'
  )
  const items = data?.earningsCalendar
  if (!Array.isArray(items)) return []

  return items
    .filter((e: any) => symbols.includes(e.symbol))
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 6)
    .map((e: any) => ({
      label: `${e.symbol} Earnings`,
      date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }))
}

function parseAlphaVantageDate(raw: string): Date {
  // "20240115T093000" -> 2024-01-15T09:30:00Z
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`
  return new Date(iso)
}

/** NEWS_SENTIMENT covers every held ticker in one call — the free tier only allows 25 calls/day. */
export async function fetchAlphaVantageNews(symbols: string[]): Promise<RawArticle[]> {
  const key = env.get('ALPHAVANTAGE_API_KEY')
  if (!key || !symbols.length) return []

  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbols.map(encodeURIComponent).join(',')}&apikey=${key}`
  const data = await safeFetchJson(url, 'alphavantage')
  const feed = data?.feed
  if (!Array.isArray(feed)) return []

  return feed.map((item: any): RawArticle => {
    const held = (item.ticker_sentiment ?? []).filter((t: any) => symbols.includes(t.ticker))
    const matched = held.length ? held : (item.ticker_sentiment ?? [])
    const avg = (key2: string) =>
      matched.length
        ? matched.reduce((s: number, t: any) => s + Number(t[key2] ?? 0), 0) / matched.length
        : 0

    return {
      provider: 'alphavantage',
      externalId: item.url,
      headline: item.title,
      description: item.summary ?? '',
      summary: item.summary ?? '',
      url: item.url,
      sourceName: item.source ?? 'Alpha Vantage',
      tickers: held.length ? held.map((t: any) => t.ticker) : symbols,
      publishedAt: parseAlphaVantageDate(item.time_published),
      sentimentScore: matched.length
        ? avg('ticker_sentiment_score')
        : Number(item.overall_sentiment_score ?? 0),
      relevanceRaw: matched.length ? avg('relevance_score') : 0.5,
      topics: (item.topics ?? []).map((t: any) => t.topic),
    }
  })
}

/** Marketaux also takes every held ticker in one call — 100 req/day on the free tier. */
export async function fetchMarketauxNews(symbols: string[]): Promise<RawArticle[]> {
  const key = env.get('MARKETAUX_API_KEY')
  if (!key || !symbols.length) return []

  const url = `https://api.marketaux.com/v1/news/all?symbols=${symbols.map(encodeURIComponent).join(',')}&filter_entities=true&language=en&api_token=${key}`
  const data = await safeFetchJson(url, 'marketaux')
  const items = data?.data
  if (!Array.isArray(items)) return []

  return items.map((item: any): RawArticle => {
    const entities = (item.entities ?? []).filter((e: any) => symbols.includes(e.symbol))
    const avgSentiment = entities.length
      ? entities.reduce((s: number, e: any) => s + Number(e.sentiment_score ?? 0), 0) /
        entities.length
      : estimateSentiment(`${item.title} ${item.description ?? ''}`)

    return {
      provider: 'marketaux',
      externalId: item.uuid,
      headline: item.title,
      description: item.description ?? item.snippet ?? '',
      summary: item.description ?? item.snippet ?? '',
      url: item.url,
      sourceName: item.source ?? 'Marketaux',
      tickers: entities.length ? entities.map((e: any) => e.symbol) : symbols,
      publishedAt: new Date(item.published_at),
      sentimentScore: avgSentiment,
      relevanceRaw: 0.6, // ponytail: flat prior for entity-matched articles — Marketaux doesn't expose a relevance score
    }
  })
}

const POSITIVE_WORDS = [
  'beats',
  'beat',
  'surge',
  'surges',
  'soar',
  'soars',
  'jump',
  'jumps',
  'rally',
  'rallies',
  'gain',
  'gains',
  'record',
  'raises',
  'raise',
  'upgrade',
  'upgraded',
  'outperform',
  'strong',
  'growth',
  'profit',
  'bullish',
  'buy',
  'positive',
  'expands',
  'expansion',
  'win',
  'wins',
]
const NEGATIVE_WORDS = [
  'misses',
  'miss',
  'falls',
  'fall',
  'plunge',
  'plunges',
  'drop',
  'drops',
  'slump',
  'slumps',
  'loss',
  'losses',
  'cuts',
  'cut',
  'downgrade',
  'downgraded',
  'underperform',
  'weak',
  'recall',
  'lawsuit',
  'investigation',
  'bearish',
  'sell',
  'negative',
  'layoffs',
  'decline',
  'declines',
]

/**
 * Keyword-count sentiment for providers that don't supply their own score (Finnhub).
 * ponytail: naive bag-of-words heuristic, not real NLP — swap for a proper sentiment
 * model/API if the mismatches against provider-scored articles start to matter.
 */
export function estimateSentiment(text: string): number {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  let score = 0
  for (const w of words) {
    if (POSITIVE_WORDS.includes(w)) score += 1
    if (NEGATIVE_WORDS.includes(w)) score -= 1
  }
  return Math.max(-1, Math.min(1, score / 4))
}
