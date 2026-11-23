"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/Card";
import {
  DEFAULT_NEWS_QUERY,
  NEWS_FILTERS,
  NEWS_PAGE_SIZE,
  fetchNewsPage,
  filterLabel,
  timeAgo,
  type NewsEvent,
  type NewsMeta,
  type NewsPage,
  type NewsQueryState,
  type NewsSummary,
  type SortKey,
} from "@/lib/news";

const IMPACT_COLOR: Record<NewsEvent["impact"], string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--muted)",
};

/** Per held ticker: story count, sentiment mix, latest headline — sorted by portfolio weight. */
function holdingsPulse(byTicker: NewsSummary["byTicker"], holdings: Holdings) {
  return Object.entries(byTicker)
    .filter(([ticker]) => holdings[ticker])
    .map(([ticker, r]) => ({ ticker, ...r, ...holdings[ticker] }))
    .sort((a, b) => b.weight - a.weight);
}

const SENTIMENT_COLOR: Record<NewsEvent["sentiment"], string> = {
  positive: "var(--success)",
  neutral: "var(--muted)",
  negative: "var(--danger)",
};

function ImpactBadge({ impact }: { impact: NewsEvent["impact"] }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase" style={{ color: IMPACT_COLOR[impact] }}>
      <span className="h-2 w-2 rounded-full" style={{ background: IMPACT_COLOR[impact] }} />
      {impact}
    </span>
  );
}

export type Holdings = Record<string, { price: number; weight: number; today: number | null }>;

const signedPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const moveColor = (n: number | null) =>
  n == null ? "var(--muted)" : n >= 0 ? "var(--success)" : "var(--danger)";

/** Ticker chip; for a held ticker it also shows today's price move, so the headline sits next to the reaction. */
function TickerPill({ ticker, holding }: { ticker: string; holding?: Holdings[string] }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        holding ? "border-[var(--accent)]" : "border-[var(--border)]"
      }`}
      title={holding ? `You hold ${ticker} · ${holding.weight.toFixed(1)}% of portfolio` : undefined}
    >
      {ticker}
      {holding?.today != null && (
        <span className="font-figures font-mono" style={{ color: moveColor(holding.today) }}>
          {signedPct(holding.today)}
        </span>
      )}
    </span>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className="font-figures mt-1.5 font-mono text-lg font-semibold break-words sm:text-2xl">{value}</p>
    </Card>
  );
}

export function NewsCard({ event, featured, holdings }: { event: NewsEvent; featured?: boolean; holdings?: Holdings }) {
  return (
    <Card className={featured ? "shadow-[inset_0_0_0_1px_var(--accent)]" : ""}>
      <div className="flex items-center gap-2">
        <ImpactBadge impact={event.impact} />
        <div className="flex gap-1.5">
          {event.tickers.map((t) => (
            <TickerPill key={t} ticker={t} holding={holdings?.[t]} />
          ))}
        </div>
      </div>

      <h3 className={`mt-3 font-semibold tracking-tight ${featured ? "text-xl" : "text-base"}`}>{event.headline}</h3>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
        <span>{event.sources.map((s) => s.name).join(" · ")}</span>
        <span>· {timeAgo(event.publishedAt)}</span>
        {event.sources.length > 1 && (
          <span className="rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[10px] font-medium">
            {event.sources.length} sources
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-[var(--foreground)]">{event.description}</p>

      <div className="mt-3">
        <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">Why it matters</p>
        <p className="mt-1 text-sm text-[var(--foreground)]">{event.whyItMatters}</p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <div className="flex items-center gap-4 text-sm">
          <span>
            <span className="text-[var(--muted)]">Relevance </span>
            <span className="font-figures font-mono font-medium">{event.relevance}/100</span>
          </span>
          {event.affectsPortfolio != null && (
            <span title="Probability (TypeSafe) that this affects your holdings">
              <span className="text-[var(--muted)]">Portfolio impact </span>
              <span
                className={`font-figures font-mono font-medium ${event.affectsPortfolio >= 0.5 ? "text-[var(--accent)]" : ""}`}
              >
                {Math.round(event.affectsPortfolio * 100)}%
              </span>
            </span>
          )}
          <span style={{ color: SENTIMENT_COLOR[event.sentiment] }} className="font-medium capitalize">
            {event.sentiment}
          </span>
        </div>
        <a
          href={event.sources[0].url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-hover)]"
        >
          Read source
        </a>
      </div>
    </Card>
  );
}

/** Broadcast-style tape: newest headlines scroll right-to-left with each ticker's move today. */
function TickerTape({ items, holdings }: { items: NewsSummary["tape"]; holdings: Holdings }) {
  if (!items.length) return null;
  const tape = (hidden?: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden}>
      {items.map((e) => {
        const t = e.tickers.find((x) => holdings[x]) ?? e.tickers[0];
        const move = t ? holdings[t]?.today : null;
        return (
          <a
            key={e.id}
            href={e.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={hidden ? -1 : undefined}
            className="flex items-center gap-2 px-5 text-sm whitespace-nowrap hover:text-[var(--accent)]"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SENTIMENT_COLOR[e.sentiment] }} />
            {t && <span className="font-semibold">{t}</span>}
            {move != null && (
              <span className="font-figures font-mono text-xs" style={{ color: moveColor(move) }}>
                {move >= 0 ? "▲" : "▼"} {signedPct(move)}
              </span>
            )}
            <span className="text-[var(--secondary-foreground)]">{e.headline}</span>
            <span className="pl-3 text-[var(--border)]">•</span>
          </a>
        );
      })}
    </div>
  );
  return (
    <div className="ticker mt-5 flex overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
      <span className="z-10 flex shrink-0 items-center gap-1.5 bg-[var(--danger)] px-3 py-2 text-xs font-bold tracking-wider text-white uppercase">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        Live
      </span>
      <div className="relative flex-1 overflow-hidden py-2">
        {/* ~6s per headline keeps the speed readable whatever the count */}
        <div className="ticker-track flex w-max" style={{ ["--ticker-duration" as string]: `${items.length * 6}s` }}>
          {tape()}
          {tape(true)}
        </div>
      </div>
    </div>
  );
}

const EMPTY_META: NewsMeta = {
  summary: { count: 0, highImpact: 0, lastUpdate: null, sentiment: { positive: 0, neutral: 0, negative: 0 }, daily: [], byTicker: {}, tickers: [], sources: [], tape: [] },
  portfolioCoverage: { covered: 0, total: 0 },
  aiMarketBrief: "",
  upcomingEvents: [],
};

export function NewsIntelligence({ feed, holdings = {}, holdingsLoading = false, holdingsUnavailable = false }: { feed: NewsPage; holdings?: Holdings; holdingsLoading?: boolean; holdingsUnavailable?: boolean }) {
  // The controls (immediate) vs. the query the cards on screen were loaded with.
  const [controls, setControls] = useState<NewsQueryState>(DEFAULT_NEWS_QUERY);
  const [applied, setApplied] = useState<NewsQueryState>(DEFAULT_NEWS_QUERY);

  // Cards come a page at a time from the server; the side panels use the summary of the whole feed.
  const [events, setEvents] = useState(feed.events);
  const [total, setTotal] = useState(feed.total);
  const [hasMore, setHasMore] = useState(feed.hasMore);
  const [meta, setMeta] = useState<NewsMeta>(feed.meta ?? EMPTY_META);
  const [loading, setLoading] = useState<"query" | "more" | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const isDefault = (Object.keys(DEFAULT_NEWS_QUERY) as (keyof NewsQueryState)[]).every((k) => applied[k] === DEFAULT_NEWS_QUERY[k]);

  // A background refresh (new server render) updates the panels, and the cards too unless the
  // reader has filtered or already loaded more pages (their place in the list is kept).
  const [seenFeed, setSeenFeed] = useState(feed);
  if (feed !== seenFeed) {
    setSeenFeed(feed);
    if (feed.meta) setMeta(feed.meta);
    if (isDefault && events.length <= NEWS_PAGE_SIZE) {
      setEvents(feed.events);
      setTotal(feed.total);
      setHasMore(feed.hasMore);
    }
  }

  // Filters, sort and search are applied by the server: any change reloads page 1. Search waits a
  // beat after the last keystroke, and a newer request cancels the one still in flight.
  const inflight = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => {
    inflight.current?.abort();
    clearTimeout(timer.current);
  }, []);

  function run(next: NewsQueryState) {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setLoading("query");
    setPageError(null);
    fetchNewsPage(next, 0, controller.signal)
      .then((page) => {
        setEvents(page.events);
        setTotal(page.total);
        setHasMore(page.hasMore);
        setApplied(next);
        setLoading(null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPageError("Could not load stories. Try again.");
        setLoading(null);
      });
  }

  function update(patch: Partial<NewsQueryState>, debounced = false) {
    const next = { ...controls, ...patch };
    setControls(next);
    clearTimeout(timer.current);
    if (debounced) timer.current = setTimeout(() => run(next), 300);
    else run(next);
  }

  async function loadMore() {
    setLoading("more");
    setPageError(null);
    try {
      const page = await fetchNewsPage(applied, events.length);
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...page.events.filter((e) => !seen.has(e.id))];
      });
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch {
      setPageError("Could not load more stories. Try again.");
    } finally {
      setLoading(null);
    }
  }

  const { summary } = meta;
  const [topStory, ...rest] = events;
  const overview = summary.sentiment;
  const pulse = holdingsPulse(summary.byTicker, holdings);
  const daily = summary.daily;
  const maxDaily = Math.max(...daily.map((d) => d.positive + d.neutral + d.negative), 1);
  const sentTotal = overview.positive + overview.neutral + overview.negative || 1;
  const lastUpdate = summary.lastUpdate ?? new Date().toISOString();
  const tickers = summary.tickers;
  const sources = summary.sources;

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] text-base font-semibold text-[var(--accent-foreground)]">
          N
        </div>
        <div>
          <h1 className="text-2xl leading-tight sm:text-[2.25rem] font-bold tracking-tight">News Intelligence</h1>
          <p className="text-sm text-[var(--muted)]">Financial news personalized to my current portfolio.</p>
        </div>
      </div>

      <TickerTape items={summary.tape} holdings={holdings} />

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryStat label="Relevant today" value={String(summary.count)} />
        <SummaryStat label="High impact" value={String(summary.highImpact)} />
        <SummaryStat
          label="Portfolio coverage"
          value={`${meta.portfolioCoverage.covered} / ${meta.portfolioCoverage.total} positions`}
        />
        <SummaryStat label="Last update" value={timeAgo(lastUpdate)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {NEWS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => update({ filter: f })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              controls.filter === f
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            }`}
          >
            {filterLabel(f)}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={controls.ticker}
          onChange={(e) => update({ ticker: e.target.value })}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          <option value="all">All tickers</option>
          {tickers.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={controls.source}
          onChange={(e) => update({ source: e.target.value })}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={controls.query}
          onChange={(e) => update({ query: e.target.value }, true)}
          placeholder="Search news..."
          className="min-w-[180px] flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        />
        <select
          value={controls.sort}
          onChange={(e) => update({ sort: e.target.value as SortKey })}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          <option value="relevance">Sort: Relevance</option>
          <option value="newest">Sort: Newest</option>
        </select>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8" aria-busy={loading === "query"}>
          {!events.length && loading !== "query" && (
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {isDefault && !summary.count
                  ? "No news for your holdings yet. The first sync can take a few minutes."
                  : "No stories match these filters."}
              </p>
            </Card>
          )}
          <div className={`flex flex-col gap-4 transition-opacity ${loading === "query" ? "opacity-50" : ""}`}>
            {topStory && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                  Top story for your portfolio
                </p>
                <NewsCard event={topStory} featured holdings={holdings} />
              </div>
            )}
            {rest.map((event) => (
              <NewsCard key={event.id} event={event} holdings={holdings} />
            ))}
          </div>
          {pageError && (
            <p role="alert" className="text-sm text-[var(--danger)]">{pageError}</p>
          )}
          {events.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-1">
              <p className="font-figures font-mono text-xs text-[var(--muted)]">
                Showing {events.length} of {total}
              </p>
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading !== null}
                  className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-semibold hover:bg-[var(--surface-hover)] disabled:opacity-50"
                >
                  {loading === "more" ? "Loading…" : "Show more stories"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <Card title="Sentiment">
            <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
              {(["positive", "neutral", "negative"] as const).map((k) =>
                overview[k] ? (
                  <div key={k} style={{ width: `${(overview[k] / sentTotal) * 100}%`, background: SENTIMENT_COLOR[k] }} />
                ) : null
              )}
            </div>
            <div className="mt-2 flex justify-between text-xs">
              {(["positive", "neutral", "negative"] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[var(--muted)] capitalize">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: SENTIMENT_COLOR[k] }} />
                  {k} <span className="font-figures font-mono text-[var(--foreground)]">{overview[k]}</span>
                </span>
              ))}
            </div>
            {daily.length > 1 && (
              <>
                <p className="mt-4 mb-2 text-xs text-[var(--muted)]">Stories per day</p>
                <div className="flex h-20 items-end gap-1">
                  {daily.map((d) => {
                    const n = d.positive + d.neutral + d.negative;
                    return (
                      <div
                        key={d.day}
                        className="flex flex-1 flex-col-reverse overflow-hidden rounded-sm"
                        style={{ height: `${(n / maxDaily) * 100}%` }}
                        title={`${d.day}: ${d.positive} positive · ${d.neutral} neutral · ${d.negative} negative`}
                      >
                        {(["negative", "neutral", "positive"] as const).map((k) => (
                          <div key={k} style={{ height: `${(d[k] / n) * 100}%`, background: SENTIMENT_COLOR[k] }} />
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
                  <span>{daily[0].day.slice(5)}</span>
                  <span>{daily[daily.length - 1].day.slice(5)}</span>
                </div>
              </>
            )}
          </Card>

          <Card title="Holdings pulse">
            {!pulse.length ? (
              <p className="text-sm text-[var(--muted)]">{holdingsLoading ? "Loading portfolio indicators…" : holdingsUnavailable ? "Portfolio indicators are unavailable." : "No news on your holdings yet."}</p>
            ) : (
              <div className="flex flex-col">
                {pulse.map((h) => (
                  <button
                    key={h.ticker}
                    type="button"
                    onClick={() => update({ ticker: controls.ticker === h.ticker ? "all" : h.ticker })}
                    className={`-mx-2 rounded-md border-b border-[var(--border)] px-2 py-2 text-left last:border-0 hover:bg-[var(--surface-hover)] ${
                      controls.ticker === h.ticker ? "bg-[var(--surface-hover)]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{h.ticker}</span>
                      <span className="text-xs text-[var(--muted)]">{h.weight.toFixed(1)}%</span>
                      <span className="font-figures ml-auto font-mono text-xs" style={{ color: moveColor(h.today) }}>
                        {h.today == null ? "—" : signedPct(h.today)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                        <div style={{ width: `${(h.positive / h.count) * 100}%`, background: SENTIMENT_COLOR.positive }} />
                        <div style={{ width: `${(h.neutral / h.count) * 100}%`, background: SENTIMENT_COLOR.neutral }} />
                        <div style={{ width: `${(h.negative / h.count) * 100}%`, background: SENTIMENT_COLOR.negative }} />
                      </div>
                      <span className="font-figures shrink-0 font-mono text-xs text-[var(--muted)]">
                        {h.count} {h.count === 1 ? "story" : "stories"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">{h.latest}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Market brief">
            <p className="text-sm text-[var(--foreground)]">{meta.aiMarketBrief}</p>
          </Card>

          <Card title="Upcoming events">
            <div className="flex flex-col gap-2 text-sm">
              {!meta.upcomingEvents.length && (
                <p className="text-[var(--muted)]">No earnings from your holdings in the next weeks.</p>
              )}
              {meta.upcomingEvents.map((e) => (
                <div key={e.label} className="flex items-center justify-between">
                  <span>{e.label}</span>
                  <span className="text-[var(--muted)]">{e.date}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
