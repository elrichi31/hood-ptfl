export type InsiderTrade = {
  symbol: string;
  name: string;
  side: "buy" | "sell";
  date: string;
  filingDate: string;
  shares: number;
  avgPrice: number;
  value: number;
  pctOfStake: number | null;
  seenAt?: string;
};

export type InsiderSummary = {
  symbol: string;
  bought: number;
  sold: number;
  buyers: number;
  sellers: number;
  mspr: number | null;
};

export type InsiderActivity = { trades: InsiderTrade[]; summary: InsiderSummary[] };

/** The company's Form 4 filings on SEC EDGAR (it accepts a ticker as CIK). */
export const edgarForm4 = (symbol: string) =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(symbol)}&type=4&owner=include&count=40`;

export const compactUsd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

/** Worth ringing the bell for: any open-market buy (rare), or a sale of $1M+. */
export const notable = (t: InsiderTrade) => t.side === "buy" || t.value >= 1e6;

export const describe = (t: InsiderTrade) =>
  `${t.name} ${t.side === "buy" ? "bought" : "sold"} ${compactUsd(t.value)} of ${t.symbol}` +
  (t.pctOfStake != null ? ` (${t.pctOfStake.toFixed(t.pctOfStake < 10 ? 1 : 0)}% of their stake)` : "");
