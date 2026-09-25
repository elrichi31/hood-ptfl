import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import NewsArticle from '#models/news_article'
import { heldPositions } from '#services/poller'
import {
  fetchFinnhubNews,
  fetchFinnhubGeneralNews,
  fetchAlphaVantageNews,
  fetchMarketauxNews,
  fetchUpcomingEarnings,
  type RawArticle,
} from '#services/news_providers'
import {
  AI_VERSION,
  classifyArticle,
  sameStoryScores,
  typesafeEnabled,
  type AlertDecision,
} from '#services/typesafe'

export type NewsCategory = 'earnings' | 'company' | 'crypto' | 'macro' | 'sec'
export type NewsEventOut = {
  id: string
  headline: string
  tickers: string[]
  category: NewsCategory
  impact: 'high' | 'medium' | 'low'
  sentiment: 'positive' | 'neutral' | 'negative'
  sentimentScore: number
  relevance: number
  /** 0..1 from TypeSafe, null when the article wasn't AI-classified. */
  affectsPortfolio: number | null
  /** Strongest TypeSafe alert decision in the cluster; null when not AI-classified. */
  alert: AlertDecision | null
  publishedAt: string
  description: string
  aiSummary: string
  whyItMatters: string
  sources: { name: string; url: string }[]
}
export type NewsFeedOut = {
  events: NewsEventOut[]
  portfolioCoverage: { covered: number; total: number }
  aiMarketBrief: string
  upcomingEvents: { label: string; date: string }[]
}

const SEC_HINTS = /\b(sec|8-k|10-k|10-q|filing|subpoena|lawsuit|settlement)\b/i
const EARNINGS_HINTS = /\b(earnings|eps|guidance|quarterly results|revenue beat|revenue miss)\b/i
const MACRO_HINTS =
  /\b(fed|federal reserve|inflation|rate hike|interest rates|gdp|cpi|jobs report|treasury)\b/i
const CRYPTO_HINTS = /\b(bitcoin|crypto|ethereum)\b/i
const CRYPTO_TICKERS = new Set(['BTC', 'ETH', 'XRP', 'DOGE', 'SOL', 'ADA', 'USDC', 'USDT', 'LTC'])
const MACRO_TOPICS = new Set([
  'Economy - Macro',
  'Economy - Monetary',
  'Economy - Fiscal',
  'Financial Markets',
])

/** Alpha Vantage's `topics` field (when present) is more reliable than keyword-matching. */
export function categorize(
  article: Pick<RawArticle, 'headline' | 'description' | 'tickers' | 'topics'>
): NewsCategory {
  if (article.topics?.includes('Earnings')) return 'earnings'
  if (article.topics?.includes('Blockchain')) return 'crypto'
  if (article.topics?.some((t) => MACRO_TOPICS.has(t))) return 'macro'

  const text = `${article.headline} ${article.description}`
  if (SEC_HINTS.test(text)) return 'sec'
  if (EARNINGS_HINTS.test(text)) return 'earnings'
  if (article.tickers.some((t) => CRYPTO_TICKERS.has(t)) || CRYPTO_HINTS.test(text)) return 'crypto'
  if (MACRO_HINTS.test(text)) return 'macro'
  return 'company'
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'with',
  'as',
  'is',
  'after',
  'amid',
  'over',
  'its',
])

function headlineTokens(headline: string): Set<string> {
  const words = headline.toLowerCase().match(/[a-z0-9]+/g) ?? []
  return new Set(words.filter((w) => w.length > 2 && !STOPWORDS.has(w)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : intersection / union
}

const CLUSTER_WINDOW_MS = 30 * 3600 * 1000
const CLUSTER_SIMILARITY = 0.35

/**
 * Groups articles about the same underlying story (shared ticker + published within
 * 30h + similar headline) so the UI can show "3 sources" instead of duplicate cards.
 * Articles TypeSafe already linked (storyId) group by that instead — its "same event?"
 * judgement beats word overlap in both directions.
 * ponytail: O(n²) headline-similarity scan — fine at the scale of ~a week of portfolio
 * news; revisit (e.g. bucket by ticker first) if the article count grows a lot.
 */
export function groupArticles(articles: RawArticle[]): RawArticle[][] {
  const sorted = [...articles].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
  const clusters: {
    articles: RawArticle[]
    tickers: Set<string>
    tokens: Set<string>
    latest: number
    storyIds: Set<number>
  }[] = []

  for (const article of sorted) {
    const tickers = new Set(article.tickers)
    const tokens = headlineTokens(article.headline)
    const storyId = article.storyId ?? null
    const match = clusters.find((c) =>
      storyId !== null && c.storyIds.size
        ? c.storyIds.has(storyId)
        : article.publishedAt.getTime() - c.latest <= CLUSTER_WINDOW_MS &&
          [...tickers].some((t) => c.tickers.has(t)) &&
          jaccard(tokens, c.tokens) >= CLUSTER_SIMILARITY
    )
    if (match) {
      match.articles.push(article)
      if (storyId !== null) match.storyIds.add(storyId)
      tickers.forEach((t) => match.tickers.add(t))
      match.latest = Math.max(match.latest, article.publishedAt.getTime())
    } else {
      clusters.push({
        articles: [article],
        tickers,
        tokens,
        latest: article.publishedAt.getTime(),
        storyIds: new Set(storyId !== null ? [storyId] : []),
      })
    }
  }
  return clusters.map((c) => c.articles)
}

function buildEvent(cluster: RawArticle[], weightByTicker: Map<string, number>): NewsEventOut {
  const rep = [...cluster].sort(
    (a, b) => b.relevanceRaw - a.relevanceRaw || b.publishedAt.getTime() - a.publishedAt.getTime()
  )[0]
  const tickers = [...new Set(cluster.flatMap((a) => a.tickers))]
  const avgSentiment =
    cluster.reduce((s, a) => s + (a.ai ? a.ai.sentiment : a.sentimentScore), 0) / cluster.length
  const ai = rep.ai ?? cluster.find((a) => a.ai)?.ai ?? null
  const avgRelevanceRaw = cluster.reduce((s, a) => s + a.relevanceRaw, 0) / cluster.length

  // TypeSafe's "which holding is this mainly about" beats "biggest holding mentioned".
  const topHolding =
    ai?.mostAffected && weightByTicker.has(ai.mostAffected)
      ? { symbol: ai.mostAffected, weight: weightByTicker.get(ai.mostAffected)! }
      : tickers.reduce<{ symbol: string; weight: number } | null>((best, t) => {
          const weight = weightByTicker.get(t) ?? 0
          return !best || weight > best.weight ? { symbol: t, weight } : best
        }, null)
  const alerts = cluster.map((a) => a.ai?.alert).filter((x): x is AlertDecision => Boolean(x))
  const alert: AlertDecision | null = alerts.includes('now')
    ? 'now'
    : alerts.includes('digest')
      ? 'digest'
      : alerts.length
        ? 'ignore'
        : null
  const portfolioWeightPct = topHolding?.weight ?? 0

  // 70% provider relevance + up to 30pts for how big a portfolio position the ticker is.
  const heuristicRelevance = avgRelevanceRaw * 70 + Math.min(portfolioWeightPct, 30)
  // With TypeSafe: half heuristic, half "does this affect a holding?" probability.
  const relevance = Math.round(
    Math.max(0, Math.min(100, ai ? heuristicRelevance / 2 + ai.affectsPortfolio * 50 : heuristicRelevance))
  )
  const impact: NewsEventOut['impact'] = ai
    ? ai.impact >= 2 ? 'high' : ai.impact >= 1 ? 'medium' : 'low'
    : relevance >= 75 || Math.abs(avgSentiment) >= 0.6 ? 'high' : relevance >= 45 ? 'medium' : 'low'
  const sentiment: NewsEventOut['sentiment'] =
    avgSentiment > 0.15 ? 'positive' : avgSentiment < -0.15 ? 'negative' : 'neutral'

  const whyItMatters =
    topHolding && topHolding.weight > 0
      ? `${topHolding.symbol} is ${topHolding.weight.toFixed(1)}% of your portfolio.`
      : `Related to ${tickers.join(', ') || 'the broader market'} — not currently a portfolio holding.`

  const seenUrls = new Set<string>()
  const sources = cluster
    .filter((a) => (seenUrls.has(a.url) ? false : seenUrls.add(a.url)))
    .map((a) => ({ name: a.sourceName, url: a.url }))

  return {
    id: rep.externalId,
    headline: rep.headline,
    tickers,
    category: ai && ai.categoryConfidence >= 0.5 ? ai.category : categorize(rep),
    impact,
    sentiment,
    sentimentScore: Number(avgSentiment.toFixed(2)),
    relevance,
    affectsPortfolio: ai ? Number(ai.affectsPortfolio.toFixed(2)) : null,
    alert,
    publishedAt: rep.publishedAt.toISOString(),
    description: rep.description,
    // "AI Summary" is the provider's own abstract, not an LLM call — no summarization
    // key was requested, and Finnhub/Alpha Vantage/Marketaux all already ship one.
    aiSummary: rep.summary || rep.description,
    whyItMatters,
    sources,
  }
}

function buildMarketBrief(events: NewsEventOut[]): string {
  if (!events.length) return 'No portfolio news in the last few days.'

  const counts = { positive: 0, neutral: 0, negative: 0 }
  for (const e of events) counts[e.sentiment]++
  const tone =
    counts.negative > counts.positive
      ? 'moderately negative'
      : counts.positive > counts.negative
        ? 'moderately positive'
        : 'mixed'

  const byTicker = new Map<string, number>()
  for (const e of events) for (const t of e.tickers) byTicker.set(t, (byTicker.get(t) ?? 0) + 1)
  const top = [...byTicker.entries()].sort((a, b) => b[1] - a[1])[0]
  const topLine = top
    ? ` ${top[0]} is receiving the most coverage (${top[1]} ${top[1] === 1 ? 'story' : 'stories'}).`
    : ''

  return `Your portfolio news flow is ${tone} today.${topLine}`
}

// Refreshed on every ingest cycle — not persisted, it's just an earnings calendar lookahead.
let cachedUpcomingEvents: { label: string; date: string }[] = []

/** Fetches from every configured provider and upserts into news_articles, deduped per provider+externalId. */
export async function ingestNews() {
  const { equities } = await heldPositions()
  const symbols = [...new Set(equities.map((p) => p.symbol))].slice(0, 20)

  const [finnhub, finnhubGeneral, alphavantage, marketaux, upcoming] = await Promise.all([
    fetchFinnhubNews(symbols),
    fetchFinnhubGeneralNews(),
    fetchAlphaVantageNews(symbols),
    fetchMarketauxNews(symbols),
    fetchUpcomingEarnings(symbols),
  ])
  const articles = [...finnhub, ...finnhubGeneral, ...alphavantage, ...marketaux]
  cachedUpcomingEvents = upcoming

  for (const a of articles) {
    await NewsArticle.firstOrCreate(
      { provider: a.provider, externalId: a.externalId },
      {
        headline: a.headline,
        description: a.description,
        summary: a.summary,
        url: a.url,
        sourceName: a.sourceName,
        tickers: JSON.stringify(a.tickers),
        publishedAt: DateTime.fromJSDate(a.publishedAt),
        sentimentScore: a.sentimentScore,
        relevanceRaw: a.relevanceRaw,
      }
    )
  }

  await classifyPending(equities)
  await linkStories()

  logger.info(
    `[news:poll] fetched ${articles.length} articles (${symbols.length} tickers, ${upcoming.length} upcoming earnings)`
  )
}

const CLASSIFY_PER_CYCLE = 100

/**
 * Runs TypeSafe over feed-window articles that haven't been classified yet. No-op
 * without TYPESAFE_API_KEY. Failed calls stay null and get retried next cycle.
 */
export async function classifyPending(equities: { symbol: string; value: number }[]) {
  const totalValue = equities.reduce((s, p) => s + p.value, 0) || 1
  const portfolio = equities.map((p) => ({ symbol: p.symbol, weightPct: (p.value / totalValue) * 100 }))
  const pending = await NewsArticle.query()
    .where((q) => q.whereNull('ai').orWhere('ai', 'not like', `%"v":${AI_VERSION},%`))
    .where('publishedAt', '>=', DateTime.now().minus({ days: FEED_LOOKBACK_DAYS }).toJSDate())
    .orderBy('publishedAt', 'desc')
    .limit(CLASSIFY_PER_CYCLE)

  let done = 0
  // 5 at a time — polite to their rate limit, still fast.
  for (let i = 0; i < pending.length; i += 5) {
    await Promise.all(
      pending.slice(i, i + 5).map(async (row) => {
        const ai = await classifyArticle(
          { headline: row.headline, description: row.description, tickers: JSON.parse(row.tickers) },
          portfolio
        )
        if (!ai) return
        row.ai = JSON.stringify(ai)
        await row.save()
        done++
      })
    )
  }
  if (pending.length) logger.info(`[news:typesafe] classified ${done}/${pending.length} articles`)
}

const LINK_PER_CYCLE = 100
const LINK_CANDIDATES = 5
const LINK_PREFILTER_SIMILARITY = 0.1
const SAME_STORY_MIN = 0.7

/**
 * Assigns story_id to unlinked feed-window articles, oldest first: the few most
 * similar earlier articles (shared ticker, within 30h) go to TypeSafe as "same event?"
 * questions in one call; the best yes joins that story, otherwise it starts its own.
 * No-op without TYPESAFE_API_KEY (grouping falls back to headline similarity).
 */
export async function linkStories() {
  if (!typesafeEnabled()) return
  const rows = await NewsArticle.query()
    .where('publishedAt', '>=', DateTime.now().minus({ days: FEED_LOOKBACK_DAYS }).toJSDate())
    .orderBy('publishedAt', 'asc')
  const meta = rows.map((r) => ({
    row: r,
    tickers: new Set<string>(JSON.parse(r.tickers)),
    tokens: headlineTokens(r.headline),
  }))

  let linked = 0
  let processed = 0
  for (const [i, a] of meta.entries()) {
    if (a.row.storyId !== null) continue
    if (processed >= LINK_PER_CYCLE) break
    processed++

    const t = a.row.publishedAt.toMillis()
    const candidates = meta
      .slice(0, i)
      .filter(
        (c) =>
          c.row.storyId !== null &&
          t - c.row.publishedAt.toMillis() <= CLUSTER_WINDOW_MS &&
          [...a.tickers].some((x) => c.tickers.has(x))
      )
      .map((c) => ({ c, sim: jaccard(a.tokens, c.tokens) }))
      .filter((x) => x.sim >= LINK_PREFILTER_SIMILARITY)
      .sort((x, y) => y.sim - x.sim)
      .slice(0, LINK_CANDIDATES)
      .map((x) => x.c)

    let storyId = a.row.id
    if (candidates.length) {
      const scores = await sameStoryScores(a.row, candidates.map((c) => c.row))
      if (!scores) break // API down — retry the rest next cycle
      const best = scores.indexOf(Math.max(...scores))
      if (scores[best] >= SAME_STORY_MIN) {
        storyId = candidates[best].row.storyId!
        linked++
      }
    }
    a.row.storyId = storyId
    await a.row.save()
  }
  if (processed) logger.info(`[news:typesafe] story-linked ${processed} articles (${linked} joined an existing story)`)
}

const FEED_LOOKBACK_DAYS = 5
const MIN_RELEVANCE = 20
const MAX_EVENTS = 40

/** Reads the last few days of stored articles, clusters them into events, and scores them against the live portfolio. */
export async function getNewsFeed(): Promise<NewsFeedOut> {
  const since = DateTime.now().minus({ days: FEED_LOOKBACK_DAYS }).toJSDate()
  const rows = await NewsArticle.query()
    .where('publishedAt', '>=', since)
    .orderBy('publishedAt', 'desc')

  const raw: RawArticle[] = rows.map((r) => ({
    provider: r.provider as RawArticle['provider'],
    externalId: r.externalId,
    headline: r.headline,
    description: r.description,
    summary: r.summary,
    url: r.url,
    sourceName: r.sourceName,
    tickers: JSON.parse(r.tickers),
    publishedAt: r.publishedAt.toJSDate(),
    sentimentScore: r.sentimentScore,
    relevanceRaw: r.relevanceRaw,
    ai: r.ai ? JSON.parse(r.ai) : null,
    storyId: r.storyId,
  }))

  const { equities } = await heldPositions()
  const totalValue = equities.reduce((s, p) => s + p.value, 0) || 1
  const weightByTicker = new Map(equities.map((p) => [p.symbol, (p.value / totalValue) * 100]))

  const allEvents = groupArticles(raw)
    .map((cluster) => buildEvent(cluster, weightByTicker))
    .sort((a, b) => b.relevance - a.relevance)

  // Filtering here (not at ingest) keeps the raw articles around in case the relevance
  // formula changes later, but only surfaces a curated, boundedly-sized feed to the UI.
  const events = allEvents.filter((e) => e.relevance >= MIN_RELEVANCE).slice(0, MAX_EVENTS)

  const coveredTickers = new Set(
    events.flatMap((e) => e.tickers).filter((t) => weightByTicker.has(t))
  )

  return {
    events,
    portfolioCoverage: { covered: coveredTickers.size, total: equities.length },
    aiMarketBrief: buildMarketBrief(events),
    upcomingEvents: cachedUpcomingEvents,
  }
}

// 2h keeps Alpha Vantage's 25-req/day free tier comfortable (12/day) even with a
// few dev-server restarts in a day — Finnhub and Marketaux have far more headroom.
const POLL_INTERVAL_MS = 2 * 60 * 60 * 1000

/**
 * Fetches on an interval, but skips the immediate call on boot if the last ingest was
 * recent — every `npm run dev` restart used to re-poll instantly, which is how a single
 * afternoon of restarts nearly burned through Alpha Vantage's whole daily quota.
 */
export function startNewsPolling() {
  const tick = async () => {
    await ingestNews().catch((err) => logger.error({ err }, '[news:poll] failed'))
    setTimeout(tick, POLL_INTERVAL_MS)
  }

  NewsArticle.query()
    .orderBy('createdAt', 'desc')
    .first()
    .then((latest) => {
      const elapsedMs = latest ? Date.now() - latest.createdAt.toMillis() : Infinity
      if (elapsedMs >= POLL_INTERVAL_MS) {
        tick()
      } else {
        logger.info(
          `[news:poll] last ingest was ${Math.round(elapsedMs / 60000)}min ago, waiting before the next one`
        )
        setTimeout(tick, POLL_INTERVAL_MS - elapsedMs)
        // The earnings calendar lives in memory, so reload it now (Finnhub only, cheap) instead of
        // leaving Upcoming events empty until the next full ingest.
        heldPositions()
          .then(({ equities }) => fetchUpcomingEarnings([...new Set(equities.map((p) => p.symbol))].slice(0, 20)))
          .then((upcoming) => (cachedUpcomingEvents = upcoming))
          .catch((err) => logger.error({ err }, '[news:poll] could not load upcoming earnings'))
      }
    })
    .catch((err) => {
      logger.error({ err }, '[news:poll] could not check last ingest, polling immediately')
      tick()
    })
}
