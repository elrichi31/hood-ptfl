import { getMockNewsFeed, type NewsEvent, type NewsPage, type NewsSummary } from "@/lib/news";

/** Builds the paged-endpoint response the backend would send for `events` (first page of `size`). */
export function pageFrom(events: NewsEvent[], size = 12, offset = 0, withMeta = true): NewsPage {
  const slice = events.slice(offset, offset + size);
  const count = (s: NewsEvent["sentiment"]) => events.filter((e) => e.sentiment === s).length;
  const byTicker: NewsSummary["byTicker"] = {};
  for (const e of events) {
    for (const t of e.tickers) {
      const r = (byTicker[t] ??= { positive: 0, neutral: 0, negative: 0, count: 0, latest: e.headline, at: e.publishedAt });
      r[e.sentiment]++;
      r.count++;
    }
  }
  const page: NewsPage = { events: slice, total: events.length, offset, hasMore: offset + slice.length < events.length };
  if (!withMeta) return page;
  page.meta = {
    summary: {
      count: events.length,
      highImpact: events.filter((e) => e.impact === "high").length,
      lastUpdate: events[0]?.publishedAt ?? null,
      sentiment: { positive: count("positive"), neutral: count("neutral"), negative: count("negative") },
      daily: [],
      byTicker,
      tickers: [...new Set(events.flatMap((e) => e.tickers))].sort(),
      sources: [...new Set(events.flatMap((e) => e.sources.map((s) => s.name)))].sort(),
      tape: events.slice(0, 20).map((e) => ({ id: e.id, headline: e.headline, tickers: e.tickers, sentiment: e.sentiment, url: e.sources[0]?.url ?? null })),
    },
    portfolioCoverage: { covered: events.length ? 1 : 0, total: 22 },
    aiMarketBrief: "",
    upcomingEvents: [],
  };
  return page;
}

export const mockEvents = () => getMockNewsFeed().events;
