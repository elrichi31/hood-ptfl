import { test } from '@japa/runner'
import { categorize, groupArticles } from '#services/news'
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
      article({ headline: 'Nvidia stock falls on China news again', tickers: ['NVDA'], storyId: 2 }),
      // No shared words, but TypeSafe said same event.
      article({ headline: 'Apple unveils foldable iPhone', tickers: ['AAPL'], storyId: 3 }),
      article({ headline: 'Cupertino giant shows bendable handset', tickers: ['AAPL'], storyId: 3 }),
    ])
    assert.deepEqual(
      clusters.map((c) => c.length),
      [1, 1, 2]
    )
  })
})
