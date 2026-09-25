import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import type { NewsFeed } from "@/lib/news";

// Feeds the top-bar bell: the "notify now" events of the last 24h (newest first), and
// when the newest one was published (the client compares it to its last-seen time).
export async function GET(req: NextRequest) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = await backend("/api/v1/news");
  if (!res.ok) return NextResponse.json({ count: 0, latest: null, items: [] });
  const feed: NewsFeed = await res.json();
  const since = Date.now() - 864e5;
  const now = feed.events.filter((e) => e.alert === "now" && new Date(e.publishedAt).getTime() >= since);
  const latest = now.reduce<string | null>((m, e) => (!m || e.publishedAt > m ? e.publishedAt : m), null);
  const items = now
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 8)
    .map((e) => ({ id: e.id, headline: e.headline, tickers: e.tickers, publishedAt: e.publishedAt, url: e.sources[0]?.url }));
  return NextResponse.json({ count: now.length, latest, items });
}
