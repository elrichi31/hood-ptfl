"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { LiveNumber } from "@/components/LiveNumber";
import type { PositionHistory } from "@/components/PortfolioExplorer";

type QuoteEvent = {
  prices: Record<string, number>;
  timestamps: Record<string, number>;
  provider: "connected" | "reconnecting" | "disabled";
  lastTradeAt: number | null;
};
type Live = {
  prices: Record<string, number>;
  timestamps: Record<string, number>;
  connected: boolean;
  at: string | null;
  status: "live" | "reconnecting" | "stale" | "waiting" | "disabled";
};
const LiveContext = createContext<Live>({
  prices: {},
  timestamps: {},
  connected: false,
  at: null,
  status: "reconnecting",
});
export const useLivePrices = () => useContext(LiveContext);
const REFRESH_MS = 5 * 60 * 1000;
const STALE_MS = 60_000;

function validEvent(value: unknown): value is QuoteEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as QuoteEvent;
  if (!["connected", "reconnecting", "disabled"].includes(e.provider))
    return false;
  if (
    !e.prices ||
    typeof e.prices !== "object" ||
    Array.isArray(e.prices) ||
    !e.timestamps ||
    typeof e.timestamps !== "object" ||
    Array.isArray(e.timestamps)
  )
    return false;
  const times = Object.values(e.timestamps);
  if (Object.keys(e.prices).length !== times.length) return false;
  for (const [symbol, price] of Object.entries(e.prices)) {
    const t = e.timestamps[symbol];
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(t) ||
      t <= 0 ||
      t > Date.now() + STALE_MS
    )
      return false;
  }
  const last = times.length ? Math.max(...times) : null;
  return e.lastTradeAt === last;
}

export function LivePricesProvider({
  children,
  snapshotAt,
}: {
  children: ReactNode;
  snapshotAt?: string;
}) {
  const [event, setEvent] = useState<QuoteEvent | null>(null);
  const [stream, setStream] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource("/api/live");
    // An open browser/backend connection does not prove Finnhub is connected.
    es.onopen = () => setStream(false);
    es.onerror = () => setStream(false);
    es.onmessage = (message) => {
      try {
        const next: unknown = JSON.parse(message.data);
        if (!validEvent(next)) return;
        setEvent(next); // full snapshots also remove sold symbols
        setStream(true);
        setNow(Date.now());
      } catch {
        /* Ignore malformed frames; keep last known quotes and their original times. */
      }
    };
    const clock = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      es.close();
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  // Cached quotes older than the polled balance must not override newer snapshot prices.
  const prices = useMemo(() => {
    const cutoff = snapshotAt ? Date.parse(snapshotAt) : 0;
    return Object.fromEntries(
      Object.entries(event?.prices ?? {}).filter(
        ([symbol]) => event!.timestamps[symbol] > cutoff,
      ),
    );
  }, [event, snapshotAt]);
  const status: Live["status"] =
    !stream || !event
      ? "reconnecting"
      : event.provider === "disabled"
        ? "disabled"
        : event.provider === "reconnecting"
          ? "reconnecting"
          : event.lastTradeAt == null
            ? "waiting"
            : Object.values(event.timestamps).some(
                  (t) => (now ?? t) - t > STALE_MS,
                )
              ? "stale"
              : "live";
  const live: Live = {
    prices,
    timestamps: event?.timestamps ?? {},
    status,
    connected: status === "live",
    at: event?.lastTradeAt ? new Date(event.lastTradeAt).toISOString() : null,
  };
  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

const STATUS_LABELS: Record<Live["status"], string> = {
  live: "Live quotes",
  reconnecting: "Reconnecting",
  stale: "Quotes delayed",
  waiting: "Waiting for quotes",
  disabled: "Live quotes unavailable",
};
export function LiveQuoteStatus() {
  const { status, at } = useLivePrices();
  return (
    <p
      role="status"
      className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "animate-pulse bg-[var(--success)]" : "bg-[var(--muted)]"}`}
      />
      <span>{STATUS_LABELS[status]}</span>
      {at && (
        <span>
          · Last quote{" "}
          <time dateTime={at} title={at}>
            {new Date(at).toLocaleTimeString("en-US")}
          </time>
        </span>
      )}
      {status === "stale" && (
        <span>· Some quotes are over 60s old; markets may be closed.</span>
      )}
      {status === "disabled" && <span>· Showing saved portfolio data.</span>}
    </p>
  );
}

type Priced = { symbol: string; quantity: number; price: number };

/** Σ qty × (live − polled price): how far live trades have moved these positions since the last poll. */
const liveDelta = (positions: Priced[], prices: Record<string, number>) =>
  positions.reduce(
    (s, p) =>
      s + (prices[p.symbol] ? (prices[p.symbol] - p.price) * p.quantity : 0),
    0,
  );

/**
 * The snapshot history plus one in-memory "now" point priced with live trades (never saved — the poller
 * stores a real snapshot every 5 min). Same qty and cash as the last snapshot, so everything derived
 * from it (range P&L, Today, drawdown) counts the move as market gain, not a deposit.
 */
export function useLiveHistory(h: PositionHistory): PositionHistory {
  const { prices, timestamps, at } = useLivePrices();
  return useMemo(() => {
    const n = h.at.length;
    // Dates, not strings: snapshot times come from Luxon and may carry a -04:00 offset.
    if (!n || !at || new Date(at).getTime() <= new Date(h.at[n - 1]).getTime())
      return h;
    let delta = 0;
    const symbols = Object.fromEntries(
      Object.entries(h.symbols).map(([s, v]) => {
        const q = v.qty[n - 1];
        const p = v.price[n - 1];
        const live =
          q != null && p != null && timestamps[s] > Date.parse(h.at[n - 1])
            ? prices[s]
            : undefined;
        if (live) delta += q! * (live - p!);
        return [
          s,
          { ...v, qty: [...v.qty, q], price: [...v.price, live ?? p] },
        ];
      }),
    );
    if (!delta) return h;
    return {
      at: [...h.at, at],
      total: [...h.total, h.total[n - 1] + delta],
      cash: [...h.cash, h.cash[n - 1]],
      symbols,
    };
  }, [h, prices, timestamps, at]);
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const signed = (n: number) =>
  n >= 0 ? `+${money(n)}` : `-${money(Math.abs(n))}`;

/**
 * Robinhood's polled total, moved by each position's live price change since that poll. Delta rather
 * than Σ qty·price, so anything we don't price live (options, pending cash) stays in the total.
 */
export function LiveTotal({
  total,
  positions,
}: {
  total: number;
  positions: Priced[];
}) {
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
        series:
          moved && last != null ? [...day.series, last + moved] : day.series,
        pct: base ? (pnl / base) * 100 : null,
        caption: `stocks ${signed(securities)} · crypto ${signed(cryptoPnl)}`,
      }}
    />
  );
}
