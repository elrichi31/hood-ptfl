import { test } from '@japa/runner'
import {
  categorize,
  groupArticles,
  queryNews,
  selectFeedEvents,
  summarizeNews,
  type NewsEventOut,
} from '#services/news'
import type { RawArticle } from '#services/news_providers'

function article(overrides: Partial<RawArticle>): RawArticle {
  return {
    provider: 'finnhub',
    externalId: Math.random().toString(36),
    headline: 'Some headline',
    description: '',
    summary: '',
    url: 'https://example.com/a',
    sourceName: 'Example',
    tickers: [],
    publishedAt: new Date('2024-01-15T12:00:00Z'),
    sentimentScore: 0,
    relevanceRaw: 0.5,
    ...overrides,
  }
}

test.group('news: categorize', () => {
  test('flags SEC filing language', ({ assert }) => {
    assert.equal(
      categorize(
        article({ headline: 'Company files 8-K disclosing new purchase', tickers: ['MSTR'] })
      ),
      'sec'
    )
  })

  test('flags earnings language', ({ assert }) => {
    assert.equal(categorize(article({ headline: 'AMD beats on EPS, raises guidance' })), 'earnings')
  })

  test('flags crypto by ticker even without crypto keywords', ({ assert }) => {
    assert.equal(
      categorize(article({ headline: 'Update on holdings', tickers: ['BTC'] })),
      'crypto'
    )
  })

  test('flags macro language', ({ assert }) => {
    assert.equal(
      categorize(article({ headline: 'Fed signals rate hike amid inflation concerns' })),
      'macro'
    )
  })

  test('prefers Alpha Vantage topics over keyword heuristics', ({ assert }) => {
    assert.equal(
      categorize(article({ headline: 'Routine update', topics: ['Earnings'] })),
      'earnings'
    )
  })

  test('falls back to company', ({ assert }) => {
    assert.equal(
      categorize(article({ headline: 'Meta announces new datacenter buildout' })),
      'company'
    )
  })
})

test.group('news: groupArticles', () => {
  test('merges same-story articles from different providers into one cluster', ({ assert }) => {
    const clusters = groupArticles([
      article({
        provider: 'finnhub',
        headline: 'Bitcoin drops 6% as risk assets sell off',
        tickers: ['MSTR', 'BTC'],
        publishedAt: new Date('2024-01-15T12:00:00Z'),
      }),
      article({
        provider: 'marketaux',
        headline: 'Bitcoin drops after risk assets sell off broadly',
        tickers: ['BTC'],
        publishedAt: new Date('2024-01-15T13:00:00Z'),
      }),
    ])
    assert.lengthOf(clusters, 1)
    assert.lengthOf(clusters[0], 2)
  })

  test('keeps unrelated stories in separate clusters', ({ assert }) => {
    const clusters = groupArticles([
      article({ headline: 'Bitcoin drops 6% as risk assets sell off', tickers: ['BTC'] }),
      article({ headline: 'Meta announces new datacenter buildout', tickers: ['META'] }),
    ])
    assert.lengthOf(clusters, 2)
  })

  test('keeps similar headlines apart when tickers do not overlap', ({ assert }) => {
    const clusters = groupArticles([
      article({ headline: 'Company beats on quarterly earnings', tickers: ['AMD'] }),
      article({ headline: 'Company beats on quarterly earnings', tickers: ['NFLX'] }),
    ])
    assert.lengthOf(clusters, 2)
  })

  test('does not cluster the same ticker across a stale time window', ({ assert }) => {
    const clusters = groupArticles([
      article({
        headline: 'Tesla issues recall for driver-assist feature',
        tickers: ['TSLA'],
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      }),
      article({
        headline: 'Tesla issues recall for driver-assist feature',
        tickers: ['TSLA'],
        publishedAt: new Date('2024-01-10T00:00:00Z'),
      }),
    ])
    assert.lengthOf(clusters, 2)
  })

  test('TypeSafe storyId overrides headline similarity both ways', ({ assert }) => {
    const clusters = groupArticles([
      // Same words, but TypeSafe said different events.
      article({ headline: 'Nvidia stock falls on China news', tickers: ['NVDA'], storyId: 1 }),
      article({
        headline: 'Nvidia stock falls on China news again',
        tickers: ['NVDA'],
        storyId: 2,
      }),
      // No shared words, but TypeSafe said same event.
      article({ headline: 'Apple unveils foldable iPhone', tickers: ['AAPL'], storyId: 3 }),
      article({
        headline: 'Cupertino giant shows bendable handset',
        tickers: ['AAPL'],
        storyId: 3,
      }),
    ])
    assert.deepEqual(
      clusters.map((c) => c.length),
      [1, 1, 2]
    )
  })
})

function event(
  id: string,
  tickers: string[],
  relevance: number,
  publishedAt: string
): NewsEventOut {
  return {
    id,
    headline: id,
    tickers,
    category: 'company',
    impact: 'low',
    sentiment: 'neutral',
    sentimentScore: 0,
    relevance,
    affectsPortfolio: null,
    alert: null,
    publishedAt,
    description: '',
    aiSummary: '',
    whyItMatters: '',
    sources: [],
  }
}

test.group('news: selectFeedEvents', () => {
  test('keeps the top stories by relevance', ({ assert }) => {
    const events = [
      event('low', ['AAPL'], 30, '2024-01-15T10:00:00Z'),
      event('high', ['AAPL'], 90, '2024-01-15T09:00:00Z'),
      event('mid', ['AAPL'], 60, '2024-01-15T08:00:00Z'),
    ]
    const out = selectFeedEvents(events, ['AAPL'], { max: 2, perTicker: 0 })
    assert.deepEqual(
      out.map((e) => e.id),
      ['high', 'mid']
    )
  })

  test('a crowded-out holding still gets its latest stories', ({ assert }) => {
    const events = [
      event('a1', ['AAPL'], 95, '2024-01-15T10:00:00Z'),
      event('a2', ['AAPL'], 90, '2024-01-15T09:00:00Z'),
      event('n-old', ['NVDA'], 25, '2024-01-14T09:00:00Z'),
      event('n-new', ['NVDA'], 22, '2024-01-15T11:00:00Z'),
      event('n-mid', ['NVDA'], 24, '2024-01-15T05:00:00Z'),
    ]
    const out = selectFeedEvents(events, ['AAPL', 'NVDA'], { max: 2, perTicker: 2 })
    const nvda = out.filter((e) => e.tickers.includes('NVDA')).map((e) => e.id)
    assert.sameMembers(nvda, ['n-new', 'n-mid'])
    assert.lengthOf(out, 4)
  })

  test('does not duplicate events that cover several holdings', ({ assert }) => {
    const events = [event('both', ['AAPL', 'NVDA'], 80, '2024-01-15T10:00:00Z')]
    const out = selectFeedEvents(events, ['AAPL', 'NVDA'], { max: 5, perTicker: 2 })
    assert.lengthOf(out, 1)
  })
})

const base = { limit: 10, offset: 0, sort: 'relevance' as const }

test.group('news: queryNews / summarizeNews', () => {
  const events = [
    {
      ...event('a', ['AAPL'], 90, '2024-01-15T10:00:00Z'),
      impact: 'high' as const,
      category: 'earnings' as const,
      headline: 'Apple beats',
    },
    {
      ...event('b', ['NVDA'], 70, '2024-01-16T10:00:00Z'),
      sentiment: 'negative' as const,
      headline: 'Nvidia probe',
    },
    {
      ...event('c', ['AAPL', 'NVDA'], 50, '2024-01-14T10:00:00Z'),
      sentiment: 'positive' as const,
      sources: [{ name: 'Reuters', url: 'https://r.example/c' }],
    },
    event('d', ['KO'], 30, '2024-01-17T10:00:00Z'),
  ]

  test('sorts by relevance or recency', ({ assert }) => {
    assert.deepEqual(
      queryNews(events, base).events.map((e) => e.id),
      ['a', 'b', 'c', 'd']
    )
    assert.deepEqual(
      queryNews(events, { ...base, sort: 'newest' }).events.map((e) => e.id),
      ['d', 'b', 'a', 'c']
    )
  })

  test('filters by category, high impact, ticker, source and text', ({ assert }) => {
    const ids = (q: Partial<typeof base> & Record<string, unknown>) =>
      queryNews(events, { ...base, ...q }).events.map((e) => e.id)
    assert.deepEqual(ids({ category: 'earnings' }), ['a'])
    assert.deepEqual(ids({ category: 'high-impact' }), ['a'])
    assert.deepEqual(ids({ ticker: 'NVDA' }), ['b', 'c'])
    assert.deepEqual(ids({ source: 'Reuters' }), ['c'])
    assert.deepEqual(ids({ q: 'apple' }), ['a'])
    assert.deepEqual(ids({ q: 'nvda' }), ['b', 'c'])
  })

  test('pages through results and reports the unfiltered total', ({ assert }) => {
    const p1 = queryNews(events, { ...base, limit: 3 })
    assert.equal(p1.total, 4)
    assert.deepEqual(
      p1.events.map((e) => e.id),
      ['a', 'b', 'c']
    )
    const p2 = queryNews(events, { ...base, limit: 3, offset: 3 })
    assert.deepEqual(
      p2.events.map((e) => e.id),
      ['d']
    )
    assert.lengthOf(queryNews(events, { ...base, offset: 50 }).events, 0)
  })

  test('summarizes the whole feed for the side panels', ({ assert }) => {
    const s = summarizeNews(events)
    assert.equal(s.count, 4)
    assert.equal(s.highImpact, 1)
    assert.equal(s.lastUpdate, '2024-01-17T10:00:00Z')
    assert.deepEqual(s.sentiment, { positive: 1, neutral: 2, negative: 1 })
    assert.deepEqual(s.tickers, ['AAPL', 'KO', 'NVDA'])
    assert.equal(s.byTicker.NVDA.count, 2)
    assert.equal(s.byTicker.NVDA.latest, 'Nvidia probe')
    assert.deepEqual(
      s.daily.map((d) => d.day),
      ['2024-01-14', '2024-01-15', '2024-01-16', '2024-01-17']
    )
    assert.equal(s.tape[0].id, 'd')
    assert.isAtMost(s.tape.length, 20)
  })
})
