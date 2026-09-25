"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import {
  NEWS_FILTERS,
  filterAndSortNews,
  filterLabel,
  sentimentSummary,
  timeAgo,
  type NewsEvent,
  type NewsFeed,
  type NewsFilter,
  type SortKey,
} from "@/lib/news";

const IMPACT_COLOR: Record<NewsEvent["impact"], string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--muted)",
};

/** Per held ticker: story count, sentiment mix, latest headline — sorted by portfolio weight. */
function holdingsPulse(events: NewsEvent[], holdings: Holdings) {
  type Row = { positive: number; neutral: number; negative: number; count: number; latest: string; at: string };
  const by = new Map<string, Row>();
  for (const e of events) {
    for (const t of e.tickers) {
      if (!holdings[t]) continue;
      const r = by.get(t) ?? { positive: 0, neutral: 0, negative: 0, count: 0, latest: e.headline, at: e.publishedAt };
      r[e.sentiment]++;
      r.count++;
      if (e.publishedAt > r.at) Object.assign(r, { latest: e.headline, at: e.publishedAt });
      by.set(t, r);
    }
  }
  return [...by]
    .map(([ticker, r]) => ({ ticker, ...r, ...holdings[ticker] }))
    .sort((a, b) => b.weight - a.weight);
}

/** Story counts by sentiment per calendar day, oldest first. */
function dailySentiment(events: NewsEvent[]) {
  const by = new Map<string, { positive: number; neutral: number; negative: number }>();
  for (const e of events) {
    const day = e.publishedAt.slice(0, 10);
    const r = by.get(day) ?? { positive: 0, neutral: 0, negative: 0 };
    r[e.sentiment]++;
    by.set(day, r);
  }
  return [...by].map(([day, r]) => ({ day, ...r })).sort((a, b) => a.day.localeCompare(b.day));
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

export function NewsIntelligence({ feed, holdings = {} }: { feed: NewsFeed; holdings?: Holdings }) {
  const [filter, setFilter] = useState<NewsFilter>("all");
  const [ticker, setTicker] = useState("all");
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");

  const tickers = useMemo(
    () => [...new Set(feed.events.flatMap((e) => e.tickers))].sort(),
    [feed.events],
  );
  const sources = useMemo(
    () => [...new Set(feed.events.flatMap((e) => e.sources.map((s) => s.name)))].sort(),
    [feed.events],
  );

  const sorted = useMemo(
    () => filterAndSortNews(feed.events, { filter, ticker, source, query, sort }),
    [feed.events, filter, ticker, source, query, sort],
  );
  const [topStory, ...rest] = sorted;

  const overview = sentimentSummary(feed.events);
  const pulse = holdingsPulse(feed.events, holdings);
  const daily = dailySentiment(feed.events);
  const maxDaily = Math.max(...daily.map((d) => d.positive + d.neutral + d.negative), 1);
  const sentTotal = overview.positive + overview.neutral + overview.negative || 1;
  const highImpactCount = feed.events.filter((e) => e.impact === "high").length;
  const lastUpdate = feed.events.reduce(
    (latest, e) => (new Date(e.publishedAt) > new Date(latest) ? e.publishedAt : latest),
    feed.events[0]?.publishedAt ?? new Date().toISOString(),
  );

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

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryStat label="Relevant today" value={String(feed.events.length)} />
        <SummaryStat label="High impact" value={String(highImpactCount)} />
        <SummaryStat
          label="Portfolio coverage"
          value={`${feed.portfolioCoverage.covered} / ${feed.portfolioCoverage.total} positions`}
        />
        <SummaryStat label="Last update" value={timeAgo(lastUpdate)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {NEWS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === f
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
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
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
          value={source}
          onChange={(e) => setSource(e.target.value)}
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search news..."
          className="min-w-[180px] flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          <option value="relevance">Sort: Relevance</option>
          <option value="newest">Sort: Newest</option>
        </select>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          {!sorted.length && (
            <Card>
              <p className="text-sm text-[var(--muted)]">No stories match these filters.</p>
            </Card>
          )}
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
              <p className="text-sm text-[var(--muted)]">No news on your holdings yet.</p>
            ) : (
              <div className="flex flex-col">
                {pulse.map((h) => (
                  <button
                    key={h.ticker}
                    type="button"
                    onClick={() => setTicker(ticker === h.ticker ? "all" : h.ticker)}
                    className={`-mx-2 rounded-md border-b border-[var(--border)] px-2 py-2 text-left last:border-0 hover:bg-[var(--surface-hover)] ${
                      ticker === h.ticker ? "bg-[var(--surface-hover)]" : ""
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
            <p className="text-sm text-[var(--foreground)]">{feed.aiMarketBrief}</p>
          </Card>

          <Card title="Upcoming events">
            <div className="flex flex-col gap-2 text-sm">
              {!feed.upcomingEvents.length && (
                <p className="text-[var(--muted)]">No earnings from your holdings in the next weeks.</p>
              )}
              {feed.upcomingEvents.map((e) => (
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
