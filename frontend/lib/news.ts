export type ImpactLevel = "high" | "medium" | "low";
export type Sentiment = "positive" | "neutral" | "negative";
export type NewsCategory = "earnings" | "company" | "crypto" | "macro" | "sec";
export type NewsFilter = "all" | "high-impact" | NewsCategory;
export type SortKey = "relevance" | "newest";

export interface NewsSource {
  name: string;
  url: string;
}

export interface NewsEvent {
  id: string;
  headline: string;
  tickers: string[];
  category: NewsCategory;
  impact: ImpactLevel;
  sentiment: Sentiment;
  /** -1..1, internal weighting — UI only ever shows the `sentiment` label. */
  sentimentScore: number;
  relevance: number;
  /** 0..1 TypeSafe probability this affects a holding; null/absent = not AI-classified. */
  affectsPortfolio?: number | null;
  /** TypeSafe alert decision (already confidence-gated); null/absent = not AI-classified. */
  alert?: "now" | "digest" | "ignore" | null;
  publishedAt: string;
  description: string;
  aiSummary: string;
  whyItMatters: string;
  sources: NewsSource[];
}

export interface UpcomingEvent {
  label: string;
  date: string;
}

export interface NewsFeed {
  events: NewsEvent[];
  portfolioCoverage: { covered: number; total: number };
  aiMarketBrief: string;
  upcomingEvents: UpcomingEvent[];
}

const FILTER_LABELS: Record<NewsFilter, string> = {
  all: "All",
  "high-impact": "High Impact",
  earnings: "Earnings",
  company: "Company",
  crypto: "Crypto",
  macro: "Macro",
  sec: "SEC Filings",
};

export const NEWS_FILTERS = Object.keys(FILTER_LABELS) as NewsFilter[];
export const filterLabel = (f: NewsFilter) => FILTER_LABELS[f];

export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

const minsAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/**
 * Mock feed shaped like the real one: swap this for a fetch to the backend
 * (which aggregates Finnhub / Alpha Vantage / Marketaux) without touching callers.
 */
export function getMockNewsFeed(): NewsFeed {
  const events: NewsEvent[] = [
    {
      id: "btc-selloff",
      headline: "Bitcoin drops 6% as risk assets sell off after Fed comments",
      tickers: ["MSTR", "BTC"],
      category: "crypto",
      impact: "high",
      sentiment: "negative",
      sentimentScore: -0.78,
      relevance: 92,
      publishedAt: minsAgo(18),
      description:
        "Bitcoin declined sharply following hawkish remarks from the Fed on rate policy, dragging crypto-linked equities down with it.",
      aiSummary:
        "Bitcoin declined sharply following comments interpreted as hawkish, triggering a broad risk-off move across crypto and crypto-adjacent equities.",
      whyItMatters:
        "MSTR represents 4.8% of your portfolio and has historically amplified Bitcoin's moves, so expect outsized downside versus the broader market today.",
      sources: [
        { name: "Reuters", url: "https://www.reuters.com" },
        { name: "CNBC", url: "https://www.cnbc.com" },
        { name: "Marketaux", url: "https://www.marketaux.com" },
      ],
    },
    {
      id: "meta-ai-datacenter",
      headline: "Meta announces new $10B AI datacenter buildout",
      tickers: ["META"],
      category: "company",
      impact: "medium",
      sentiment: "neutral",
      sentimentScore: 0.04,
      relevance: 58,
      publishedAt: minsAgo(43),
      description:
        "Meta confirmed a multi-year infrastructure investment to expand AI training capacity, funded largely through existing free cash flow.",
      aiSummary:
        "Capex guidance ticks up, but the spend is self-funded and in line with prior signaling — market reaction has been muted.",
      whyItMatters:
        "META is 3.1% of your portfolio. Higher capex can pressure near-term margins, but has historically been well tolerated when framed around AI capacity.",
      sources: [{ name: "CNBC", url: "https://www.cnbc.com" }],
    },
    {
      id: "amzn-antitrust",
      headline: "Amazon settles minor FTC labeling dispute",
      tickers: ["AMZN"],
      category: "sec",
      impact: "low",
      sentiment: "neutral",
      sentimentScore: 0.0,
      relevance: 21,
      publishedAt: minsAgo(75),
      description: "A narrow labeling dispute was resolved with no material fine or business change.",
      aiSummary: "Immaterial to Amazon's financials; procedural resolution with no operational impact.",
      whyItMatters: "AMZN is 2.2% of your portfolio. No action needed — this does not move the thesis.",
      sources: [{ name: "AP News", url: "https://apnews.com" }],
    },
    {
      id: "tsla-recall",
      headline: "Tesla issues software recall for driver-assist feature",
      tickers: ["TSLA"],
      category: "company",
      impact: "medium",
      sentiment: "negative",
      sentimentScore: -0.41,
      relevance: 64,
      publishedAt: minsAgo(95),
      description:
        "A over-the-air recall addresses an edge case in the driver-assist stack; no hardware changes required.",
      aiSummary: "OTA-only recall, low cost to remediate, but adds to a string of regulatory headlines this quarter.",
      whyItMatters:
        "TSLA is 6.1% of your portfolio, your largest single-stock position — regulatory headline risk here moves the portfolio more than most.",
      sources: [
        { name: "Reuters", url: "https://www.reuters.com" },
        { name: "Bloomberg", url: "https://www.bloomberg.com" },
      ],
    },
    {
      id: "amd-earnings-beat",
      headline: "AMD beats on data center revenue, raises guidance",
      tickers: ["AMD"],
      category: "earnings",
      impact: "high",
      sentiment: "positive",
      sentimentScore: 0.63,
      relevance: 88,
      publishedAt: minsAgo(140),
      description:
        "AMD's data center segment grew well above consensus on AI accelerator demand, and management raised full-year guidance.",
      aiSummary: "Broad beat-and-raise driven by AI accelerator demand; guidance raise signals durable, not one-off, strength.",
      whyItMatters: "AMD is 3.9% of your portfolio. Positive earnings surprises here have led to multi-day follow-through historically.",
      sources: [
        { name: "Bloomberg", url: "https://www.bloomberg.com" },
        { name: "Marketaux", url: "https://www.marketaux.com" },
      ],
    },
    {
      id: "nflx-price-hike",
      headline: "Netflix raises subscription prices in three regions",
      tickers: ["NFLX"],
      category: "company",
      impact: "low",
      sentiment: "positive",
      sentimentScore: 0.22,
      relevance: 34,
      publishedAt: minsAgo(210),
      description: "Netflix quietly raised prices across UK, Canada, and Australia, its second hike this year.",
      aiSummary: "Modest ARPU tailwind; churn impact has historically been limited for Netflix price moves of this size.",
      whyItMatters: "NFLX is 1.8% of your portfolio. Small positive to revenue-per-user, unlikely to move the stock alone.",
      sources: [{ name: "Reuters", url: "https://www.reuters.com" }],
    },
    {
      id: "fed-speech-preview",
      headline: "Markets brace for Fed speech on rate path Thursday",
      tickers: ["MSTR", "TSLA", "AMD"],
      category: "macro",
      impact: "medium",
      sentiment: "neutral",
      sentimentScore: -0.08,
      relevance: 71,
      publishedAt: minsAgo(260),
      description: "Traders are positioning defensively ahead of a scheduled Fed speech expected to address the rate path.",
      aiSummary: "Elevated pre-event volatility is typical; positioning has skewed cautious into the print.",
      whyItMatters: "Rate-sensitive and high-beta names in your portfolio (MSTR, TSLA, AMD) tend to see amplified moves around Fed commentary.",
      sources: [
        { name: "CNBC", url: "https://www.cnbc.com" },
        { name: "AP News", url: "https://apnews.com" },
      ],
    },
    {
      id: "mstr-sec-filing",
      headline: "MicroStrategy files 8-K disclosing additional Bitcoin purchase",
      tickers: ["MSTR", "BTC"],
      category: "sec",
      impact: "medium",
      sentiment: "neutral",
      sentimentScore: 0.1,
      relevance: 55,
      publishedAt: minsAgo(340),
      description: "The filing discloses a further balance-sheet allocation to Bitcoin, funded via existing facilities.",
      aiSummary: "Consistent with MicroStrategy's stated treasury strategy; not a change in direction.",
      whyItMatters: "Reinforces MSTR's tight coupling to Bitcoin price action already reflected in your portfolio's crypto exposure.",
      sources: [{ name: "Marketaux", url: "https://www.marketaux.com" }],
    },
  ];

  return {
    events,
    portfolioCoverage: { covered: 12, total: 15 },
    aiMarketBrief:
      "Your portfolio news flow is moderately negative today. Crypto-linked positions are receiving the largest amount of negative coverage, while META and AMZN have mostly neutral company-specific news.",
    upcomingEvents: [
      { label: "META Earnings", date: "Sep 24" },
      { label: "JPM Investor Event", date: "Sep 25" },
      { label: "Fed speech", date: "Sep 25" },
    ],
  };
}

export function filterAndSortNews(
  events: NewsEvent[],
  opts: { filter: NewsFilter; ticker: string; source: string; query: string; sort: SortKey },
) {
  const q = opts.query.trim().toLowerCase();
  const filtered = events.filter((e) => {
    if (opts.filter === "high-impact") {
      if (e.impact !== "high") return false;
    } else if (opts.filter !== "all" && e.category !== opts.filter) {
      return false;
    }
    if (opts.ticker !== "all" && !e.tickers.includes(opts.ticker)) return false;
    if (opts.source !== "all" && !e.sources.some((s) => s.name === opts.source)) return false;
    if (q && !`${e.headline} ${e.description} ${e.tickers.join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });
  return filtered.sort((a, b) =>
    opts.sort === "newest"
      ? +new Date(b.publishedAt) - +new Date(a.publishedAt)
      : b.relevance - a.relevance,
  );
}

export function sentimentSummary(events: NewsEvent[]) {
  return {
    positive: events.filter((e) => e.sentiment === "positive").length,
    neutral: events.filter((e) => e.sentiment === "neutral").length,
    negative: events.filter((e) => e.sentiment === "negative").length,
  };
}

export function mostAffectedHoldings(events: NewsEvent[], limit = 5) {
  const counts = new Map<string, number>();
  for (const e of events) for (const t of e.tickers) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([ticker, count]) => ({ ticker, count }));
}
