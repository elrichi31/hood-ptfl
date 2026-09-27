"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Live = { prices: Record<string, number>; connected: boolean };
const LiveContext = createContext<Live>({ prices: {}, connected: false });

/** Real-time trade prices (Finnhub via the backend), keyed by symbol — BTC for crypto. Empty outside the provider. */
export const useLivePrices = () => useContext(LiveContext);

export function LivePricesProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<Live>({ prices: {}, connected: false });

  useEffect(() => {
    // EventSource reconnects by itself after a drop.
    const es = new EventSource("/api/live");
    es.onopen = () => setLive((l) => ({ ...l, connected: true }));
    es.onerror = () => setLive((l) => ({ ...l, connected: false }));
    es.onmessage = (e) => {
      const batch: Record<string, number> = JSON.parse(e.data);
      setLive((l) => ({ connected: true, prices: { ...l.prices, ...batch } }));
    };
    return () => es.close();
  }, []);

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Robinhood's polled total, moved by each position's live price change since that poll. Delta rather
 * than Σ qty·price, so anything we don't price live (options, pending cash) stays in the total.
 */
export function LiveTotal({
  total,
  positions,
}: {
  total: number;
  positions: { symbol: string; quantity: number; price: number }[];
}) {
  const { prices, connected } = useLivePrices();
  const live =
    total +
    positions.reduce(
      (s, p) =>
        s + (prices[p.symbol] ? (prices[p.symbol] - p.price) * p.quantity : 0),
      0,
    );

  return (
    <span className="inline-flex items-center gap-2">
      {money(live)}
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
