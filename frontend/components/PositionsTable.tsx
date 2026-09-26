"use client";

import { useEffect, useState } from "react";
import { Modal } from "@heroui/react";
import { prevCloseFor, priceAgo, priceContext, type Hist } from "@/lib/history";

type Position = {
  symbol: string;
  name?: string;
  quantity: number;
  avgCost: number | null;
  price: number;
  value: number;
  prevClose?: number;
  prevCloseDate?: string;
};

type SymbolDetails = {
  symbol: string;
  sector: string | null;
  marketCap: number | null;
  peRatio: number | null;
  dividendYield: number | null;
  high52w: number | null;
  low52w: number | null;
  nextEarningsDate: string | null;
  rsi: number | null;
  analystRatings: { buy: number; hold: number; sell: number; priceTarget: number | null } | null;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const compact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

// Deterministic pastel-ish hue per ticker, Notion-tag style.
function tickerHue(symbol: string) {
  let hash = 0;
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Track + marker meter: a value's position within a [lo, hi] range. */
function RangeMeter({
  value,
  lo,
  hi,
  labelLeft,
  labelRight,
  labelValue,
}: {
  value: number;
  lo: number;
  hi: number;
  labelLeft: string;
  labelRight: string;
  labelValue: string;
}) {
  const at = clamp(((value - lo) / (hi - lo || 1)) * 100, 0, 100);
  return (
    <div>
      <div className="relative h-2 rounded-full bg-[var(--surface-secondary)]">
        <div
          className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]"
          style={{ left: `${at}%` }}
          title={labelValue}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-[var(--muted)]">
        <span className="font-figures font-mono">{labelLeft}</span>
        <span className="font-figures font-mono font-medium text-[var(--foreground)]">{labelValue}</span>
        <span className="font-figures font-mono">{labelRight}</span>
      </div>
    </div>
  );
}

/** RSI gauge: oversold / neutral / overbought zones with a marker at the current value. */
function RsiGauge({ value }: { value: number }) {
  const at = clamp(value, 0, 100);
  return (
    <div>
      <div className="relative flex h-2 overflow-hidden rounded-full">
        <div className="h-full" style={{ width: "30%", background: "color-mix(in oklab, var(--success) 35%, var(--surface-secondary))" }} />
        <div className="h-full flex-1 bg-[var(--surface-secondary)]" />
        <div className="h-full" style={{ width: "30%", background: "color-mix(in oklab, var(--danger) 35%, var(--surface-secondary))" }} />
        <div
          className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--foreground)] ring-2 ring-[var(--surface)]"
          style={{ left: `${at}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-[var(--muted)]">
        <span>Oversold</span>
        <span className="font-figures font-mono font-medium text-[var(--foreground)]">{value.toFixed(1)}</span>
        <span>Overbought</span>
      </div>
    </div>
  );
}

/** Stacked buy/hold/sell bar, same visual language as the allocation chart. */
function RatingsBar({ ratings, price }: { ratings: NonNullable<SymbolDetails["analystRatings"]>; price: number }) {
  const total = ratings.buy + ratings.hold + ratings.sell || 1;
  const segments = [
    { label: "Buy", value: ratings.buy, color: "var(--success)" },
    { label: "Hold", value: ratings.hold, color: "var(--muted)" },
    { label: "Sell", value: ratings.sell, color: "var(--danger)" },
  ].filter((s) => s.value > 0);
  const upside = ratings.priceTarget ? ((ratings.priceTarget - price) / price) * 100 : null;

  return (
    <div>
      <div className="flex h-2 w-full gap-0.5">
        {segments.map((s) => (
          <div
            key={s.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[var(--muted)]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
            {s.value} {s.label}
          </span>
        ))}
        {ratings.priceTarget && (
          <span className="font-figures ml-auto font-mono">
            Target {money(ratings.priceTarget)}
            {upside !== null && (
              <span className={upside >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}> {pct(upside)}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)] uppercase">{label}</p>
      <p className="font-figures font-mono">{value}</p>
    </div>
  );
}

function SymbolModal({ position, onClose }: { position: Position | null; onClose: () => void }) {
  const [details, setDetails] = useState<SymbolDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const symbol = position?.symbol ?? null;

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    // Textbook fetch-on-mount pattern; not worth a data-fetching library for one on-click call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/symbol/${symbol}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setDetails(d))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <Modal.Root isOpen={!!symbol} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{symbol}</Modal.Heading>
              {details?.sector && <p className="text-xs text-[var(--muted)]">{details.sector}</p>}
            </Modal.Header>
            <Modal.Body>
              {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
              {!loading && details && position && (
                <div className="flex flex-col gap-5">
                  {details.low52w && details.high52w && (
                    <div>
                      <p className="mb-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                        52-week range
                      </p>
                      <RangeMeter
                        value={position.price}
                        lo={details.low52w}
                        hi={details.high52w}
                        labelLeft={money(details.low52w)}
                        labelRight={money(details.high52w)}
                        labelValue={money(position.price)}
                      />
                    </div>
                  )}

                  {details.rsi !== null && (
                    <div>
                      <p className="mb-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                        RSI (14d)
                      </p>
                      <RsiGauge value={details.rsi} />
                    </div>
                  )}

                  {details.analystRatings && (
                    <div>
                      <p className="mb-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                        Analyst ratings
                      </p>
                      <RatingsBar ratings={details.analystRatings} price={position.price} />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
                    <StatChip label="Market cap" value={details.marketCap ? `$${compact(details.marketCap)}` : "—"} />
                    <StatChip label="P/E ratio" value={details.peRatio ? details.peRatio.toFixed(1) : "—"} />
                    <StatChip
                      label="Dividend yield"
                      value={details.dividendYield ? pct(details.dividendYield * 100) : "—"}
                    />
                    <StatChip label="Next earnings" value={details.nextEarningsDate ?? "—"} />
                  </div>
                </div>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y"] as const;
type Period = (typeof PERIODS)[number];
type References = Record<string, Partial<Record<Exclude<Period, "1D">, number>>>;
const PERIOD_DAYS: Record<Exclude<Period, "1D" | "YTD">, number> = { "1W": 7, "1M": 30, "3M": 91, "1Y": 365 };
const PERIOD_LABEL: Record<Period, string> = {
  "1D": "Today",
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  YTD: "Year to date",
  "1Y": "1 year",
};

type SortKey = "symbol" | "price" | "today" | "value" | "gain";

const signedMoney = (n: number) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;
const tone = (n: number | null) =>
  n == null ? "text-[var(--muted)]" : n >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]";
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="block text-right text-xs text-[var(--muted)]">—</span>;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${26 - ((v - min) / span) * 24}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="ml-auto h-7 w-24" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "var(--success)" : "var(--danger)"}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Th({
  label,
  k,
  sort,
  onSort,
  align = "right",
}: {
  label: string;
  k?: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = k && sort.key === k;
  return (
    <th
      className={`px-3 py-2.5 text-xs font-medium tracking-wide whitespace-nowrap text-[var(--muted)] uppercase first:pl-0 last:pr-0 ${
        align === "left" ? "text-left" : "text-right"
      }`}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
    >
      {k ? (
        <button
          type="button"
          onClick={() => onSort(k)}
          className={`uppercase hover:text-[var(--foreground)] ${active ? "text-[var(--foreground)]" : ""}`}
        >
          {label}
          <span className="ml-1 inline-block w-2">{active ? (sort.desc ? "↓" : "↑") : ""}</span>
        </button>
      ) : (
        label
      )}
    </th>
  );
}

export function PositionsTable({
  rows,
  enrichable,
  history,
  references,
  tz,
}: {
  rows: Position[];
  enrichable?: boolean;
  history?: Hist;
  /** Viewer's IANA zone: crypto's "today" starts at their midnight. */
  tz: string;
  /** Equity closes 1W/1M/3M/YTD/1Y ago, from the backend (daily bars). */
  references?: References;
}) {
  const [period, setPeriod] = useState<Period>("1D");
  const [openPosition, setOpenPosition] = useState<Position | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "value", desc: true });
  if (!rows.length) return null;

  const total = rows.reduce((s, p) => s + p.value, 0) || 1;
  const data = rows.map((p) => {
    const { week } = priceContext(history, p.symbol);
    const prevClose = prevCloseFor(history, p, tz);
    // 1D: previous session close. Longer: Robinhood daily closes, else (crypto) the snapshot history.
    const ref =
      period === "1D"
        ? prevClose
        : (references?.[p.symbol]?.[period] ?? (period === "YTD" ? null : priceAgo(history, p.symbol, PERIOD_DAYS[period] * 864e5)));
    const cost = p.avgCost ? p.avgCost * p.quantity : null;
    const gain = cost != null ? p.value - cost : null;
    return {
      p,
      week,
      today: ref ? ((p.price - ref) / ref) * 100 : null,
      todayUsd: ref ? (p.price - ref) * p.quantity : null,
      refValue: ref ? ref * p.quantity : null,
      cost,
      gain,
      gainPct: cost ? (gain! / cost) * 100 : null,
      weight: (p.value / total) * 100,
    };
  });
  type Row = (typeof data)[number];
  const val = (r: Row): number | string =>
    sort.key === "symbol"
      ? r.p.symbol
      : sort.key === "price"
        ? r.p.price
        : sort.key === "value"
          ? r.p.value
          : (r[sort.key] ?? -Infinity);
  data.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return sort.desc ? -c : c;
  });
  const onSort = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "symbol" }));

  const sum = (f: (r: Row) => number | null) => data.reduce((s, r) => s + (f(r) ?? 0), 0);
  const totalCost = sum((r) => r.cost);
  const totalGain = sum((r) => r.gain);
  const totalToday = sum((r) => r.todayUsd);
  const totalRef = sum((r) => (r.todayUsd != null ? r.refValue : null));
  const movers = data.filter((r) => r.today != null).sort((a, b) => b.today! - a.today!);
  const [top, bottom] = [movers[0], movers[movers.length - 1]];
  const th = { sort, onSort };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
        <div role="tablist" className="flex rounded-lg border border-[var(--border)] p-0.5">
          {PERIODS.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={period === k}
              onClick={() => setPeriod(k)}
              className={`rounded-md px-2.5 py-0.5 font-medium ${
                period === k ? "bg-[var(--surface-hover)] text-[var(--foreground)]" : "hover:text-[var(--foreground)]"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <span>
          {PERIOD_LABEL[period]}{" "}
          <span className={`font-figures font-mono text-sm font-semibold ${tone(totalToday)}`}>{signedMoney(totalToday)}</span>
          {totalRef > 0 && (
            <span className={`font-figures ml-1 font-mono ${tone(totalToday)}`}>{pct((totalToday / totalRef) * 100)}</span>
          )}
        </span>
        {top && (
          <span>
            Best <span className="font-medium text-[var(--foreground)]">{top.p.symbol}</span>{" "}
            <span className={`font-figures font-mono ${tone(top.today)}`}>{pct(top.today!)}</span>
          </span>
        )}
        {bottom && bottom !== top && (
          <span>
            Worst <span className="font-medium text-[var(--foreground)]">{bottom.p.symbol}</span>{" "}
            <span className={`font-figures font-mono ${tone(bottom.today)}`}>{pct(bottom.today!)}</span>
          </span>
        )}
        <span>
          Up <span className="font-figures font-mono text-[var(--foreground)]">{movers.filter((r) => r.today! >= 0).length}</span>
          {" · "}Down <span className="font-figures font-mono text-[var(--foreground)]">{movers.filter((r) => r.today! < 0).length}</span>
        </span>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <Th label="Name" k="symbol" align="left" {...th} />
              <Th label="Price" k="price" {...th} />
              <Th label={PERIOD_LABEL[period]} k="today" {...th} />
              <Th label="7D" {...th} />
              <Th label="Shares · Avg cost" {...th} />
              <Th label="Market value" k="value" {...th} />
              <Th label="Total return" k="gain" {...th} />
            </tr>
          </thead>
          <tbody>
            {data.map(({ p, week, today, todayUsd, gain, gainPct, weight }) => (
              <tr
                key={p.symbol}
                onClick={enrichable ? () => setOpenPosition(p) : undefined}
                className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] ${enrichable ? "cursor-pointer" : ""}`}
              >
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
                      style={{ background: `oklch(0.55 0.12 ${tickerHue(p.symbol)})` }}
                    >
                      {p.symbol.slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{p.symbol}</p>
                      {p.name && <p className="max-w-[180px] truncate text-xs text-[var(--muted)]">{p.name}</p>}
                    </div>
                  </div>
                </td>
                <td className="font-figures px-3 py-2.5 text-right font-mono">{money(p.price)}</td>
                <td className={`font-figures px-3 py-2.5 text-right font-mono ${tone(today)}`}>
                  {today == null ? (
                    "—"
                  ) : (
                    <>
                      <p>{pct(today)}</p>
                      <p className="text-xs opacity-80">{signedMoney(todayUsd!)}</p>
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Spark values={week} />
                </td>
                <td className="font-figures px-3 py-2.5 text-right font-mono">
                  <p>{p.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}</p>
                  <p className="text-xs text-[var(--muted)]">{p.avgCost ? money(p.avgCost) : "—"}</p>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <p className="font-figures font-mono font-medium">{money(p.value)}</p>
                  <div className="mt-1 ml-auto flex w-28 items-center gap-1.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${weight}%` }} />
                    </div>
                    <span className="font-figures w-10 text-right font-mono text-[11px] text-[var(--muted)]">
                      {weight.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className={`font-figures py-2.5 pl-3 text-right font-mono ${tone(gain)}`}>
                  {gain == null ? (
                    "—"
                  ) : (
                    <>
                      <p>{signedMoney(gain)}</p>
                      <p className="text-xs opacity-80">{pct(gainPct!)}</p>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border)] text-xs">
              <td className="py-2.5 pr-3 font-medium text-[var(--muted)] uppercase">
                Total · {data.length} positions
              </td>
              <td />
              <td className={`font-figures px-3 py-2.5 text-right font-mono ${tone(totalToday)}`}>
                {signedMoney(totalToday)}
                {totalRef > 0 && <p className="opacity-80">{pct((totalToday / totalRef) * 100)}</p>}
              </td>
              <td />
              <td className="font-figures px-3 py-2.5 text-right font-mono text-[var(--muted)]">
                Cost {money(totalCost)}
              </td>
              <td className="font-figures px-3 py-2.5 text-right font-mono text-sm font-medium">{money(total)}</td>
              <td className={`font-figures py-2.5 pl-3 text-right font-mono text-sm ${tone(totalGain)}`}>
                {signedMoney(totalGain)}
                {totalCost > 0 && <span className="ml-1 text-xs opacity-80">{pct((totalGain / totalCost) * 100)}</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {enrichable && <SymbolModal position={openPosition} onClose={() => setOpenPosition(null)} />}
    </>
  );
}
