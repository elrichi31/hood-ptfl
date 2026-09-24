"use client";

import { useEffect, useState } from "react";
import { Modal } from "@heroui/react";

type Position = {
  symbol: string;
  name?: string;
  quantity: number;
  avgCost: number | null;
  price: number;
  value: number;
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

export function PositionsTable({
  rows,
  enrichable,
}: {
  rows: Position[];
  enrichable?: boolean;
}) {
  const [openPosition, setOpenPosition] = useState<Position | null>(null);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.value - a.value);

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="py-2 pr-3 text-left text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                Name
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                Qty
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                Avg cost
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                Price
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                Value
              </th>
              <th className="py-2 pl-3 text-right text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                Return
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const returnPct =
                p.avgCost && p.avgCost > 0 ? ((p.price - p.avgCost) / p.avgCost) * 100 : null;
              return (
                <tr
                  key={p.symbol}
                  onClick={enrichable ? () => setOpenPosition(p) : undefined}
                  className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] ${enrichable ? "cursor-pointer" : ""}`}
                >
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white"
                        style={{ background: `oklch(0.55 0.12 ${tickerHue(p.symbol)})` }}
                      >
                        {p.symbol.charAt(0)}
                      </span>
                      <div>
                        <p className="font-medium">{p.symbol}</p>
                        {p.name && <p className="text-xs text-[var(--muted)]">{p.name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="font-figures py-2 px-3 text-right font-mono text-[var(--muted)]">
                    {p.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </td>
                  <td className="font-figures py-2 px-3 text-right font-mono text-[var(--muted)]">
                    {p.avgCost ? money(p.avgCost) : "—"}
                  </td>
                  <td className="font-figures py-2 px-3 text-right font-mono text-[var(--muted)]">
                    {money(p.price)}
                  </td>
                  <td className="font-figures py-2 px-3 text-right font-mono font-medium">
                    {money(p.value)}
                  </td>
                  <td
                    className={`font-figures py-2 pl-3 text-right font-mono ${
                      returnPct === null
                        ? "text-[var(--muted)]"
                        : returnPct >= 0
                          ? "text-[var(--success)]"
                          : "text-[var(--danger)]"
                    }`}
                  >
                    {returnPct === null ? "—" : pct(returnPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {enrichable && <SymbolModal position={openPosition} onClose={() => setOpenPosition(null)} />}
    </>
  );
}
