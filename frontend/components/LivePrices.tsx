"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { LiveNumber } from "@/components/LiveNumber";
import type { PositionHistory } from "@/components/PortfolioExplorer";

type Live = { prices: Record<string, number>; connected: boolean; at: string | null };
const LiveContext = createContext<Live>({ prices: {}, connected: false, at: null });

/** Real-time trade prices (Finnhub via the backend), keyed by symbol — BTC for crypto. Empty outside the provider. */
export const useLivePrices = () => useContext(LiveContext);

// Matches the poller's market-hours cadence: each refresh picks up the newest saved snapshot.
const REFRESH_MS = 5 * 60 * 1000;

export function LivePricesProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<Live>({ prices: {}, connected: false, at: null });
  const router = useRouter();

  useEffect(() => {
    // EventSource reconnects by itself after a drop.
    const es = new EventSource("/api/live");
    es.onopen = () => setLive((l) => ({ ...l, connected: true }));
    es.onerror = () => setLive((l) => ({ ...l, connected: false }));
    es.onmessage = (e) => {
      const batch: Record<string, number> = JSON.parse(e.data);
      setLive((l) => ({ connected: true, at: new Date().toISOString(), prices: { ...l.prices, ...batch } }));
    };
    return () => es.close();
  }, []);

  // Re-fetch the server-rendered data (history, balances) so the saved-snapshot parts don't go stale.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

type Priced = { symbol: string; quantity: number; price: number };

/** Σ qty × (live − polled price): how far live trades have moved these positions since the last poll. */
const liveDelta = (positions: Priced[], prices: Record<string, number>) =>
  positions.reduce((s, p) => s + (prices[p.symbol] ? (prices[p.symbol] - p.price) * p.quantity : 0), 0);

/**
 * The snapshot history plus one in-memory "now" point priced with live trades (never saved — the poller
 * stores a real snapshot every 5 min). Same qty and cash as the last snapshot, so everything derived
 * from it (range P&L, Today, drawdown) counts the move as market gain, not a deposit.
 */
export function useLiveHistory(h: PositionHistory): PositionHistory {
  const { prices, at } = useLivePrices();
  return useMemo(() => {
    const n = h.at.length;
    // Dates, not strings: snapshot times come from Luxon and may carry a -04:00 offset.
    if (!n || !at || new Date(at).getTime() <= new Date(h.at[n - 1]).getTime()) return h;
    let delta = 0;
    const symbols = Object.fromEntries(
      Object.entries(h.symbols).map(([s, v]) => {
        const q = v.qty[n - 1];
        const p = v.price[n - 1];
        const live = q != null && p != null ? prices[s] : undefined;
        if (live) delta += q! * (live - p!);
        return [s, { ...v, qty: [...v.qty, q], price: [...v.price, live ?? p] }];
      })
    );
    if (!delta) return h;
    return { at: [...h.at, at], total: [...h.total, h.total[n - 1] + delta], cash: [...h.cash, h.cash[n - 1]], symbols };
  }, [h, prices, at]);
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const signed = (n: number) => (n >= 0 ? `+${money(n)}` : `-${money(Math.abs(n))}`);

/**
 * Robinhood's polled total, moved by each position's live price change since that poll. Delta rather
 * than Σ qty·price, so anything we don't price live (options, pending cash) stays in the total.
 */
export function LiveTotal({ total, positions }: { total: number; positions: Priced[] }) {
  const { prices, connected } = useLivePrices();

  return (
    <span className="inline-flex items-center gap-2">
      <LiveNumber value={total + liveDelta(positions, prices)} />
      {connected && (
        <span
          title="Live prices"
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--success)]"
          aria-label="Live"
        />
      )}
    </span>
  );
}

/** The Today card, moved by the same live delta the chart's "now" point uses — so the two always agree. */
export function LiveToday({
  day,
  base,
  equities,
  crypto,
}: {
  day: { securities: number; crypto: number; series: number[] };
  /** Value at the previous close — Today's % denominator. */
  base: number;
  equities: Priced[];
  crypto: Priced[];
}) {
  const { prices } = useLivePrices();
  const securities = day.securities + liveDelta(equities, prices);
  const cryptoPnl = day.crypto + liveDelta(crypto, prices);
  const pnl = securities + cryptoPnl;
  const last = day.series[day.series.length - 1];
  const moved = pnl - (day.securities + day.crypto);

  return (
    <StatCard
      label="Today"
      value={<LiveNumber value={pnl} signed />}
      color={pnl >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}
      icon={<CalendarClock size={15} />}
      trend={{
        series: moved && last != null ? [...day.series, last + moved] : day.series,
        pct: base ? (pnl / base) * 100 : null,
        caption: `stocks ${signed(securities)} · crypto ${signed(cryptoPnl)}`,
      }}
    />
  );
}
