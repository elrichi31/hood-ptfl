"use client";

import { useEffect, useState } from "react";
import { NewsIntelligence, type Holdings } from "@/components/news/NewsIntelligence";
import { DashboardRetry } from "@/components/DashboardRetry";
import type { NewsFeed } from "@/lib/news";

/** Optional portfolio enrichment must not suspend the feed or reset its filters. */
export function ProgressiveNews({ feed, holdings }: { feed: NewsFeed; holdings: Promise<Holdings | null> }) {
  const [result, setResult] = useState<{ source: typeof holdings; data: Holdings | null } | null>(null);
  const current = result?.source === holdings ? result : null;
  useEffect(() => {
    let active = true;
    const settle = (data: Holdings | null) => { if (active) setResult({ source: holdings, data }); };
    holdings.then(settle, () => settle(null));
    return () => { active = false; };
  }, [holdings]);
  return (
    <>
      {!current && <p role="status" className="mb-3 text-xs text-[var(--muted)]">Loading portfolio indicators…</p>}
      {current && !current.data && <div role="alert" className="mb-3 flex items-center gap-3 text-sm text-[var(--muted)]">Portfolio indicators are unavailable. News is still available.<DashboardRetry /></div>}
      <NewsIntelligence feed={feed} holdings={current?.data ?? {}} holdingsLoading={!current} holdingsUnavailable={!!current && !current.data} />
    </>
  );
}
