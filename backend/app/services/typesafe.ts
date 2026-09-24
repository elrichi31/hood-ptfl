import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import type { NewsCategory } from '#services/news'

export type NewsAi = {
  category: NewsCategory
  categoryConfidence: number
  /** -1..1 */
  sentiment: number
  /** 0 = none … 3 = major */
  impact: number
  /** 0..1 probability the article materially affects a held position */
  affectsPortfolio: number
}

const QUESTIONS = {
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
  affects_portfolio: {
    type: 'noul',
    instructions:
      'Does `article` contain information that materially affects the value of any holding in `portfolio`?',
  },
}

/**
 * Classifies one article with TypeSafe's Jev model (docs.typesafe.ai). Returns null
 * when TYPESAFE_API_KEY is unset or the call fails, so callers fall back to heuristics.
 */
export async function classifyArticle(
  article: { headline: string; description: string; tickers: string[] },
  portfolio: { symbol: string; weightPct: number }[]
): Promise<NewsAi | null> {
  const key = env.get('TYPESAFE_API_KEY')
  if (!key) return null

  try {
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state: {
          article: {
            headline: article.headline,
            description: article.description.slice(0, 2000),
            tickers: article.tickers,
          },
          portfolio: portfolio.map((p) => ({ symbol: p.symbol, weight_pct: Number(p.weightPct.toFixed(1)) })),
        },
        questions: QUESTIONS,
      }),
    })
    if (!res.ok) {
      logger.warn(`[news:typesafe] HTTP ${res.status} ${await res.text().catch(() => '')}`)
      return null
    }
    const { answers: a } = (await res.json()) as any
    return {
      category: a.category.choice,
      categoryConfidence: a.category.confidence,
      sentiment: (a.sentiment.score - 2) / 2,
      impact: a.impact.score,
      affectsPortfolio: a.affects_portfolio.noul,
    }
  } catch (err) {
    logger.warn({ err }, '[news:typesafe] request failed')
    return null
  }
}
