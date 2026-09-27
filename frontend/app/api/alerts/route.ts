import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import type { NewsFeed } from "@/lib/news";
import { describe, edgarForm4, notable, type InsiderActivity } from "@/lib/insiders";

type Item = { id: string; headline: string; tickers: string[]; publishedAt: string; url?: string };

// Feeds the top-bar bell: the "notify now" news events and notable insider trades (any buy, $1M+ sales)
// of the last 24h, newest first, and when the newest one landed (the client compares it to its last-seen time).
export async function GET(req: NextRequest) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [newsRes, insidersRes] = await Promise.all([backend("/api/v1/news"), backend("/api/v1/insiders")]);
  const since = Date.now() - 864e5;
  const recent = (iso: string) => new Date(iso).getTime() >= since;

  const feed: NewsFeed | null = newsRes.ok ? await newsRes.json() : null;
  const news: Item[] = (feed?.events ?? [])
    .filter((e) => e.alert === "now" && recent(e.publishedAt))
    .map((e) => ({ id: e.id, headline: e.headline, tickers: e.tickers, publishedAt: e.publishedAt, url: e.sources[0]?.url }));

  const activity: InsiderActivity | null = insidersRes.ok ? await insidersRes.json() : null;
  // seenAt = when the backend first saw the filing; the filing date guards against a restart re-dating old ones.
  const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const insiders: Item[] = (activity?.trades ?? [])
    .filter((t) => notable(t) && t.seenAt && recent(t.seenAt) && t.filingDate >= twoDaysAgo)
    .map((t) => ({
      id: `insider-${t.symbol}-${t.name}-${t.date}-${t.shares}`,
      headline: describe(t),
      tickers: [t.symbol],
      publishedAt: t.seenAt!,
      url: edgarForm4(t.symbol),
    }));

  const all = [...news, ...insiders];
  const latest = all.reduce<string | null>((m, e) => (!m || e.publishedAt > m ? e.publishedAt : m), null);
  const items = all.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 8);
  return NextResponse.json({ count: all.length, latest, items });
}
