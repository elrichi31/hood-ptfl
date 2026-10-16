import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Holdings } from "@/components/news/NewsIntelligence";
import { ProgressiveNews } from "@/components/news/ProgressiveNews";
import { DashboardRetry } from "@/components/DashboardRetry";
import { getMockNewsFeed, type NewsFeed } from "@/lib/news";
import { prevCloseFor, type Hist } from "@/lib/history";
import { auth } from "@/lib/auth";
import { viewerTz } from "@/lib/tz";
import { backend } from "@/lib/backend";

type Position = { symbol: string; price: number; value: number; prevClose?: number; prevCloseDate?: string };

async function loadHoldings(): Promise<Holdings | null> {
  try {
    const [latestRes, histRes, tz] = await Promise.all([
      backend("/api/v1/latest"), backend("/api/v1/history/positions"), viewerTz(),
    ]);
    if (!latestRes.ok || !histRes.ok) return null;
    const [latest, hist]: [{ positions: Record<string, Position[]> }, Hist] = await Promise.all([latestRes.json(), histRes.json()]);
    const positions = Object.values(latest.positions).flat();
    const total = positions.reduce((s, p) => s + p.value, 0) || 1;
    return Object.fromEntries(positions.map((p) => {
      const prevClose = prevCloseFor(hist, p, tz);
      return [p.symbol, { price: p.price, weight: (p.value / total) * 100, today: prevClose ? ((p.price - prevClose) / prevClose) * 100 : null }];
    }));
  } catch {
    return null;
  }
}

export default async function News() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const holdings = loadHoldings();
  let feed: NewsFeed | null = null;
  try {
    const response = await backend("/api/v1/news");
    if (response.ok) {
      const live: NewsFeed = await response.json();
      if (Array.isArray(live.events)) feed = live.events.length ? live : getMockNewsFeed();
    }
  } catch { /* Keep a visible retry state instead of failing the whole route. */ }

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-10">
      {feed ? <ProgressiveNews feed={feed} holdings={holdings} /> : (
        <div role="alert" className="flex items-center gap-3 text-sm text-[var(--muted)]">Could not load news.<DashboardRetry /></div>
      )}
    </main>
  );
}
