import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import type { NewsCategory } from '#services/news'

/** Bump when the questions change so old classifications get redone. */
export const AI_VERSION = 2

export type AlertDecision = 'now' | 'digest' | 'ignore'

export type NewsAi = {
  v: number
  category: NewsCategory
  categoryConfidence: number
  /** -1..1 */
  sentiment: number
  /** 0 = none … 3 = major */
  impact: number
  /** 0..1 probability the article moves a held position's price by more than ~2% */
  affectsPortfolio: number
  /** The held ticker the article is mainly about; null when it mentions no holding. */
  mostAffected: string | null
  /** Already confidence-gated: an unsure "now" is downgraded to "digest". */
  alert: AlertDecision
}

const ALERT_MIN_CONFIDENCE = 0.6

const BASE_QUESTIONS = {
  category: {
    type: 'choice',
    instructions: 'What kind of financial news is `article`?',
    criteria: {
      earnings: 'Earnings reports, EPS, revenue, guidance',
      company: 'Company-specific news: products, deals, management, analyst ratings',
      crypto: 'Cryptocurrencies, blockchain, digital assets',
      macro: 'Economy, central banks, interest rates, inflation, broad markets',
      sec: 'Regulators, SEC filings, lawsuits, investigations',
    },
  },
  sentiment: {
    type: 'score',
    instructions: 'How positive or negative is `article` for the stock price of the companies it mentions?',
    criteria: ['Very negative', 'Negative', 'Neutral', 'Positive', 'Very positive'],
  },
  impact: {
    type: 'score',
    instructions: 'How much is `article` likely to move the price of the holdings listed in `portfolio`?',
    criteria: [
      'No effect on the holdings',
      'Minor, unlikely to move the price',
      'Moderate, could move the price a few percent',
      'Major, likely to move the price significantly',
    ],
  },
  moves_price: {
    type: 'noul',
    instructions:
      'Does `article` report new information likely to move the price of a holding in `portfolio` by more than 2%?',
    criteria: {
      true: 'A new, specific event about a held company: earnings surprise, guidance change, deal, lawsuit, regulation, major product news',
      false: 'Recaps of past moves, opinion or listicles, generic market commentary, or the holding is only mentioned in passing',
    },
  },
  alert: {
    type: 'choice',
    instructions: 'Should the owner of `portfolio` be notified about `article`?',
    criteria: {
      now: 'Material and time-sensitive for a holding: the owner should see it today',
      digest: 'Relevant to a holding but not urgent, fine in an end-of-day summary',
      ignore: 'Noise: price recaps, listicles, promotional content, or not about a holding',
    },
  },
}

async function ask(state: unknown, questions: Record<string, unknown>): Promise<Record<string, any> | null> {
  const key = env.get('TYPESAFE_API_KEY')
  if (!key) return null

  // Retries 429/529 with backoff (1s, 2s), as the API docs ask.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'jev-latest', state, questions }),
      })
      if ((res.status === 429 || res.status === 529) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
        continue
      }
      if (!res.ok) {
        logger.warn(`[news:typesafe] HTTP ${res.status} ${await res.text().catch(() => '')}`)
        return null
      }
      return ((await res.json()) as any).answers
    } catch (err) {
      logger.warn({ err }, '[news:typesafe] request failed')
      return null
    }
  }
}

export const typesafeEnabled = () => Boolean(env.get('TYPESAFE_API_KEY'))

/**
 * Classifies one article with TypeSafe's Jev model (docs.typesafe.ai). Returns null
 * when TYPESAFE_API_KEY is unset or the call fails, so callers fall back to heuristics.
 */
export async function classifyArticle(
  article: { headline: string; description: string; tickers: string[] },
  portfolio: { symbol: string; weightPct: number }[]
): Promise<NewsAi | null> {
  const heldMentioned = portfolio.filter((p) => article.tickers.includes(p.symbol)).map((p) => p.symbol)
  const questions: Record<string, unknown> = { ...BASE_QUESTIONS }
  if (heldMentioned.length > 1) {
    questions.most_affected = {
      type: 'choice',
      instructions: 'Which of these holdings is `article` mainly about?',
      criteria: Object.fromEntries(heldMentioned.map((s) => [s, null])),
    }
  }

  const a = await ask(
    {
      article: {
        headline: article.headline,
        description: article.description.slice(0, 2000),
        tickers: article.tickers,
      },
      portfolio: portfolio.map((p) => ({ symbol: p.symbol, weight_pct: Number(p.weightPct.toFixed(1)) })),
    },
    questions
  )
  if (!a) return null

  const alert: AlertDecision =
    a.alert.choice === 'now' && a.alert.confidence < ALERT_MIN_CONFIDENCE ? 'digest' : a.alert.choice
  return {
    v: AI_VERSION,
    category: a.category.choice,
    categoryConfidence: a.category.confidence,
    sentiment: (a.sentiment.score - 2) / 2,
    impact: a.impact.score,
    affectsPortfolio: a.moves_price.noul,
    mostAffected: a.most_affected?.choice ?? heldMentioned[0] ?? null,
    alert,
  }
}

/**
 * For each candidate, the probability it reports the same underlying event as `article`.
 * All candidates go in one call — Jev answers the questions in parallel.
 */
export async function sameStoryScores(
  article: { headline: string; description: string },
  candidates: { headline: string; description: string }[]
): Promise<number[] | null> {
  const questions = Object.fromEntries(
    candidates.map((c, i) => [
      `c${i}`,
      {
        type: 'noul',
        instructions: {
          candidate: { headline: c.headline, description: c.description.slice(0, 600) },
          question: 'Does `candidate` report the same underlying news event as `article`?',
        },
        criteria: {
          true: 'Same specific event (same announcement, deal, result or incident), even if worded differently',
          false: 'A different event, even if about the same company or topic',
        },
      },
    ])
  )
  const a = await ask(
    { article: { headline: article.headline, description: article.description.slice(0, 600) } },
    questions
  )
  return a ? candidates.map((_, i) => a[`c${i}`].noul) : null
}
