"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import {
  NEWS_FILTERS,
  filterAndSortNews,
  filterLabel,
  mostAffectedHoldings,
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

function TickerPill({ ticker }: { ticker: string }) {
  return (
    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-medium">{ticker}</span>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className="font-figures mt-1.5 font-mono text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function NewsCard({ event, featured }: { event: NewsEvent; featured?: boolean }) {
  return (
    <Card className={featured ? "shadow-[inset_0_0_0_1px_var(--accent)]" : ""}>
      <div className="flex items-center gap-2">
        <ImpactBadge impact={event.impact} />
        <div className="flex gap-1.5">
          {event.tickers.map((t) => (
            <TickerPill key={t} ticker={t} />
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
        <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">AI Summary</p>
        <p className="mt-1 text-sm text-[var(--foreground)]">{event.aiSummary}</p>
      </div>

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
            <span title="Probabilidad (TypeSafe) de que afecte tus posiciones">
              <span className="text-[var(--muted)]">Impacto portafolio </span>
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

export function NewsIntelligence({ feed }: { feed: NewsFeed }) {
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
  const affected = mostAffectedHoldings(feed.events);
  const maxAffected = Math.max(...affected.map((a) => a.count), 1);
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
          <h1 className="text-[2.25rem] leading-tight font-bold tracking-tight">News Intelligence</h1>
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
              <NewsCard event={topStory} featured />
            </div>
          )}
          {rest.map((event) => (
            <NewsCard key={event.id} event={event} />
          ))}
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <Card title="Portfolio News Overview">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: SENTIMENT_COLOR.positive }}>Positive</span>
                <span className="font-figures font-mono">{overview.positive}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: SENTIMENT_COLOR.neutral }}>Neutral</span>
                <span className="font-figures font-mono">{overview.neutral}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: SENTIMENT_COLOR.negative }}>Negative</span>
                <span className="font-figures font-mono">{overview.negative}</span>
              </div>
            </div>
          </Card>

          <Card title="Most affected holdings">
            <div className="flex flex-col gap-2.5">
              {affected.map((a) => (
                <div key={a.ticker} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-sm font-medium">{a.ticker}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${(a.count / maxAffected) * 100}%` }}
                    />
                  </div>
                  <span className="font-figures w-6 shrink-0 text-right font-mono text-sm text-[var(--muted)]">
                    {a.count}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="AI Market Brief">
            <p className="text-sm text-[var(--foreground)]">{feed.aiMarketBrief}</p>
            <button
              type="button"
              disabled
              className="mt-3 w-full cursor-not-allowed rounded-[var(--radius)] border border-[var(--border)] py-1.5 text-sm font-medium text-[var(--muted)] opacity-60"
            >
              View full AI analysis
            </button>
          </Card>

          <Card title="Upcoming events">
            <div className="flex flex-col gap-2 text-sm">
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
