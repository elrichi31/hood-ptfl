import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import type { NewsFeed } from "@/lib/news";

// Feeds the top-bar bell: how many "notify now" events came in the last 24h, and
// when the newest one was published (the client compares it to its last-seen time).
export async function GET(req: NextRequest) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = await backend("/api/v1/news");
  if (!res.ok) return NextResponse.json({ count: 0, latest: null });
  const feed: NewsFeed = await res.json();
  const since = Date.now() - 864e5;
  const now = feed.events.filter((e) => e.alert === "now" && new Date(e.publishedAt).getTime() >= since);
  const latest = now.reduce<string | null>((m, e) => (!m || e.publishedAt > m ? e.publishedAt : m), null);
  return NextResponse.json({ count: now.length, latest });
}
