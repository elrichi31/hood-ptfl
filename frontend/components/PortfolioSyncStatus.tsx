"use client";

import { useEffect, useState } from "react";

// Polls run every 5 min in market hours and 30 min otherwise; allow a 5-min grace period.
const DELAYED_MS = 35 * 60_000;

export function PortfolioSyncStatus({
  at,
  tz,
  checkedAt,
}: {
  at?: string;
  tz: string;
  checkedAt: number;
}) {
  // Use the server's initial clock on both SSR and hydration, then age locally.
  const [clock, setClock] = useState(checkedAt);
  const now = Math.max(checkedAt, clock);
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const savedAt = at ? Date.parse(at) : NaN;
  const available = Number.isFinite(savedAt) && savedAt <= now;
  const delayed = available && now - savedAt > DELAYED_MS;
  const minutes = available ? Math.floor((now - savedAt) / 60_000) : 0;
  const age = minutes === 0 ? "just now" : `${minutes} min ago`;

  return (
    <p
      role="status"
      aria-label="Portfolio synchronization"
      className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${delayed ? "text-[var(--warning)]" : "text-[var(--muted)]"}`}
    >
      <span>
        {!available
          ? "Portfolio sync unavailable"
          : delayed
            ? "Portfolio sync delayed"
            : "Last successful portfolio sync"}
      </span>
      {available && (
        <>
          <span>· Last saved</span>
          <time dateTime={at} title={at}>
            {new Date(savedAt).toLocaleString("en-US", {
              timeZone: tz,
              dateStyle: "medium",
              timeStyle: "medium",
            })}
          </time>
          <span>Positions &amp; cash · {age}</span>
          {delayed && (
            <span>
              Positions and cash may be outdated; showing last saved data.
            </span>
          )}
        </>
      )}
    </p>
  );
}
