import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NewsIntelligence, type Holdings } from "@/components/news/NewsIntelligence";
import { getMockNewsFeed, type NewsFeed } from "@/lib/news";
import { prevCloseFor, type Hist } from "@/lib/history";
import { auth } from "@/lib/auth";
import { viewerTz } from "@/lib/tz";
import { backend } from "@/lib/backend";

type Position = { symbol: string; price: number; value: number; prevClose?: number; prevCloseDate?: string };

export default async function News() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [newsRes, latestRes, histRes] = await Promise.all([
    backend("/api/v1/news"),
    backend("/api/v1/latest"),
    backend("/api/v1/history/positions"),
  ]);
  const live: NewsFeed | null = newsRes.ok ? await newsRes.json() : null;
  // No provider API keys configured yet (or nothing ingested) — fall back to mock data.
  const feed = live && live.events.length ? live : getMockNewsFeed();

  // Reduced server-side to a small per-ticker map, so the month of history never ships to the browser.
  const positions: Position[] = latestRes.ok
    ? Object.values((await latestRes.json()).positions as Record<string, Position[]>).flat()
    : [];
  const hist: Hist | undefined = histRes.ok ? await histRes.json() : undefined;
  const total = positions.reduce((s, p) => s + p.value, 0) || 1;
  const tz = await viewerTz();
  const holdings: Holdings = Object.fromEntries(
    positions.map((p) => {
      const prevClose = prevCloseFor(hist, p, tz);
      return [
        p.symbol,
        { price: p.price, weight: (p.value / total) * 100, today: prevClose ? ((p.price - prevClose) / prevClose) * 100 : null },
      ];
    })
  );

  return (
    <>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-10">
        <NewsIntelligence feed={feed} holdings={holdings} />
      </main>
    </>
  );
}
