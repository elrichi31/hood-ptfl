"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server page on an interval so newly ingested headlines appear without a manual
 * reload. Skips hidden tabs (and refreshes right when the tab comes back), and never overlaps itself.
 */
export function NewsAutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !pending) startTransition(() => router.refresh());
    };
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs, pending]);

  return null;
}
