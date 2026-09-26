"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/Card";
import { PortfolioChart } from "@/components/PortfolioChart";
import { flowAdjustedPnl, prevCloseIndex, robinhoodToday, splitPnl, stepPnl } from "@/lib/history";

export type PositionHistory = {
  at: string[];
  total: number[];
  cash: number[];
  symbols: Record<string, { type: string; qty: (number | null)[]; price: (number | null)[] }>;
};

const RANGES = [
  { key: "1D", label: "1D", ms: 864e5 },
  { key: "3D", label: "3D", ms: 3 * 864e5 },
  { key: "1W", label: "1W", ms: 7 * 864e5 },
  { key: "1M", label: "1M", ms: 31 * 864e5 },
  { key: "ALL", label: "All", ms: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const signedMoney = (n: number) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const upDown = (n: number) => (n >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]");

/** Slices every aligned array to the snapshots inside the range (relative to the latest one). */
function sliceRange(h: PositionHistory, ms: number) {
  const times = h.at.map((t) => new Date(t).getTime());
  const cutoff = times[times.length - 1] - ms;
  // 1D starts at the previous session's close (same base as the Today card), not a rolling 24h.
  const from = ms === 864e5 ? prevCloseIndex(h.at) : Math.max(0, times.findIndex((t) => t >= cutoff));
  const sl = <T,>(a: T[]) => a.slice(from);
  return {
    at: sl(h.at),
    total: sl(h.total),
    cash: sl(h.cash),
    symbols: Object.fromEntries(
      Object.entries(h.symbols).map(([s, v]) => [s, { type: v.type, qty: sl(v.qty), price: sl(v.price) }])
    ),
  };
}

function RangeTabs({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div role="tablist" className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={value === r.key}
          onClick={() => onChange(r.key)}
          className={`rounded-md px-2.5 py-0.5 text-xs font-medium ${
            value === r.key
              ? "bg-[var(--surface-hover)] text-[var(--foreground)]"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function PortfolioExplorer({
  history,
  aside,
  tz,
}: {
  history: PositionHistory;
  aside?: ReactNode;
  tz: string;
}) {
  const [range, setRange] = useState<RangeKey>("1D");
  const data = useMemo(() => sliceRange(history, RANGES.find((r) => r.key === range)!.ms), [history, range]);
  const tabs = <RangeTabs value={range} onChange={setRange} />;

  const first = data.total[0] ?? 0;
  const last = data.total[data.total.length - 1] ?? 0;
  // 1D headline = Robinhood's "today" (same number as the Today card); longer ranges = range P&L.
  const change = range === "1D" ? robinhoodToday(history, tz).pnl : flowAdjustedPnl(data, 0);
  const split = splitPnl(data, 0);
  const hi = Math.max(...data.total);
  const lo = Math.min(...data.total);
  // Max drawdown: worst peak-to-trough drop of the time-weighted index (compounded step returns),
  // so a withdrawal isn't a "drop" and a deposit isn't a new peak.
  let index = 1;
  let peak = 1;
  let drawdown = 0;
  for (let i = 1; i < data.total.length; i++) {
    if (data.total[i - 1]) index *= 1 + stepPnl(data, i) / data.total[i - 1];
    peak = Math.max(peak, index);
    drawdown = Math.min(drawdown, index / peak - 1);
  }

  // Per-symbol P&L over the range: qty held at the previous snapshot × price move since.
  // Unlike (value_end − value_start), buys/sells in between don't count as gains.
  const contributions = Object.entries(data.symbols)
    .map(([symbol, s]) => {
      let pnl = 0;
      for (let i = 1; i < s.price.length; i++) {
        const q = s.qty[i - 1];
        const p0 = s.price[i - 1];
        const p1 = s.price[i];
        if (q != null && p0 != null && p1 != null) pnl += q * (p1 - p0);
      }
      return { symbol, pnl };
    })
    .filter((c) => Math.abs(c.pnl) >= 0.01)
    .sort((a, b) => b.pnl - a.pnl);

  const perSymbol = Object.entries(data.symbols)
    .map(([symbol, s]) => {
      const values = s.qty.map((q, i) => (q != null && s.price[i] != null ? q * s.price[i]! : null));
      const prices = s.price.filter((p): p is number => p != null);
      const lastValue = [...values].reverse().find((v) => v != null) ?? 0;
      const pct = prices.length >= 2 ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100 : 0;
      return { symbol, values, lastValue, pct, prices };
    })
    .filter((s) => s.lastValue > 0)
    .sort((a, b) => b.lastValue - a.lastValue);

  if (history.at.length < 2) {
    return (
      <Card title="Value over time">
        <p className="text-sm text-[var(--muted)]">
          Not enough data yet. Run <code>node ace portfolio:backfill</code> or wait for the poller.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="Value over time" action={tabs} className="lg:col-span-8">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
            <span className="font-figures font-mono text-2xl font-semibold">{money(last)}</span>
            <span className={`font-figures font-mono text-sm ${upDown(change)}`}>
              {signedMoney(change)} ({signedPct(first ? (change / first) * 100 : 0)})
            </span>
          </div>
          <div className="font-figures mb-2 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs text-[var(--muted)]">
            <span>
              Market hours <span className={upDown(split.regular)}>{signedMoney(split.regular)}</span>
            </span>
            <span>
              <span className="text-[var(--warning)]">After-hours &amp; overnight</span>{" "}
              <span className={upDown(split.extended)}>{signedMoney(split.extended)}</span>
            </span>
          </div>
          <div className="font-figures mb-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-[var(--muted)] sm:grid-cols-4">
            <span>High <span className="text-[var(--foreground)]">{money(hi)}</span></span>
            <span>Low <span className="text-[var(--foreground)]">{money(lo)}</span></span>
            <span>Drawdown <span className="text-[var(--danger)]">{(drawdown * 100).toFixed(2)}%</span></span>
            <span>{data.at.length} points</span>
          </div>
          <PortfolioChart data={data.at.map((at, i) => ({ at, totalValue: data.total[i], cash: data.cash[i] }))} />
        </Card>
        <div className="lg:col-span-4">{aside}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="P&L contribution by stock" action={tabs} className="lg:col-span-5">
          <ContributionBars rows={contributions} />
        </Card>
        <Card title="Holdings breakdown" className="lg:col-span-7">
          <HoldingsPie rows={perSymbol} />
        </Card>
      </div>

      <Card title="Each position" action={tabs}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {perSymbol.map((s) => (
            <div key={s.symbol} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{s.symbol}</span>
                <span className={`font-figures font-mono text-xs ${upDown(s.pct)}`}>{signedPct(s.pct)}</span>
              </div>
              <p className="font-figures font-mono text-xs text-[var(--muted)]">{money(s.lastValue)}</p>
              <MiniLine values={s.prices} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Price path, not value — so a buy mid-range doesn't look like a rally. */
function MiniLine({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="mt-2 h-10" />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${38 - ((v - min) / span) * 36}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-10 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Diverging bars around a zero line: gains right, losses left. */
function ContributionBars({ rows }: { rows: { symbol: string; pnl: number }[] }) {
  if (!rows.length) return <p className="text-sm text-[var(--muted)]">No movement in this range.</p>;
  const net = rows.reduce((s, r) => s + r.pnl, 0);
  const up = rows.filter((r) => r.pnl > 0);
  const down = rows.filter((r) => r.pnl < 0);
  const upSum = up.reduce((s, r) => s + r.pnl, 0);
  const downSum = down.reduce((s, r) => s + r.pnl, 0);
  // Top 6 each way, the small middle folded into one line — no inner scroll, no dead space.
  const K = 6;
  const shown = [...up.slice(0, K), ...down.slice(-K)];
  const hidden = rows.filter((r) => !shown.includes(r));
  const hiddenSum = hidden.reduce((s, r) => s + r.pnl, 0);
  const max = Math.max(...shown.map((r) => Math.abs(r.pnl)));

  const Row = ({ r }: { r: { symbol: string; pnl: number } }) => (
    <div className="flex items-center gap-2 text-sm" title={`${r.symbol}: ${signedMoney(r.pnl)}`}>
      <span className="w-14 shrink-0 font-medium">{r.symbol}</span>
      <div className="grid flex-1 grid-cols-2">
        <div className="flex justify-end border-r border-[var(--border)]">
          {r.pnl < 0 && (
            <div className="h-3.5 rounded-l bg-[var(--danger)]" style={{ width: `${(Math.abs(r.pnl) / max) * 100}%` }} />
          )}
        </div>
        <div className="flex">
          {r.pnl > 0 && <div className="h-3.5 rounded-r bg-[var(--success)]" style={{ width: `${(r.pnl / max) * 100}%` }} />}
        </div>
      </div>
      <span className={`font-figures w-20 shrink-0 text-right font-mono text-xs ${upDown(r.pnl)}`}>{signedMoney(r.pnl)}</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[var(--muted)]">Net</p>
          <p className={`font-figures font-mono text-base font-semibold ${upDown(net)}`}>{signedMoney(net)}</p>
        </div>
        <div>
          <p className="text-[var(--muted)]">{up.length} up</p>
          <p className="font-figures font-mono text-base text-[var(--success)]">{signedMoney(upSum)}</p>
        </div>
        <div>
          <p className="text-[var(--muted)]">{down.length} down</p>
          <p className="font-figures font-mono text-base text-[var(--danger)]">{signedMoney(downSum)}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-1.5">
        {up.slice(0, K).map((r) => (
          <Row key={r.symbol} r={r} />
        ))}
        {hidden.length > 0 && (
          <p className="py-1 text-center text-xs text-[var(--muted)]">
            {hidden.length} more · <span className={`font-figures font-mono ${upDown(hiddenSum)}`}>{signedMoney(hiddenSum)}</span>
          </p>
        )}
        {down.slice(-K).map((r) => (
          <Row key={r.symbol} r={r} />
        ))}
      </div>
    </div>
  );
}

const SLICES = 11;
const sliceColor = (i: number) => `oklch(0.66 0.13 ${(i * 360) / SLICES + 230})`;

/** Donut of current value per position (top 8 + Other); hover a slice or row to read it. */
function HoldingsPie({ rows }: { rows: { symbol: string; lastValue: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = rows.reduce((s, r) => s + r.lastValue, 0);
  if (!total) return <p className="text-sm text-[var(--muted)]">No positions.</p>;

  const top = rows.slice(0, SLICES);
  const rest = rows.slice(SLICES).reduce((s, r) => s + r.lastValue, 0);
  const slices = [
    ...top.map((r, i) => ({ label: r.symbol, value: r.lastValue, color: sliceColor(i) })),
    ...(rest > 0 ? [{ label: `Other (${rows.length - SLICES})`, value: rest, color: "var(--muted)" }] : []),
  ];

  const R = 92;
  const r0 = 62;
  let angle = -Math.PI / 2;
  const arcs = slices.map((sl) => {
    const a0 = angle;
    const a1 = (angle += (sl.value / total) * Math.PI * 2);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${(100 + rad * Math.cos(a)).toFixed(2)} ${(100 + rad * Math.sin(a)).toFixed(2)}`;
    // Full circle would collapse to a zero-length arc; nudge it.
    const end = a1 - a0 >= Math.PI * 2 ? a1 - 1e-4 : a1;
    return `M${p(a0, R)} A${R} ${R} 0 ${large} 1 ${p(end, R)} L${p(end, r0)} A${r0} ${r0} 0 ${large} 0 ${p(a0, r0)} Z`;
  });
  const shown = active !== null ? slices[active] : null;
  const maxSlice = Math.max(...slices.map((sl) => sl.value));

  return (
    <div className="flex h-full flex-col items-center gap-6 sm:flex-row sm:items-center">
      <svg viewBox="0 0 200 200" className="h-[220px] w-[220px] shrink-0 sm:h-[240px] sm:w-[240px]" onPointerLeave={() => setActive(null)}>
        {arcs.map((d, i) => (
          <path
            key={slices[i].label}
            d={d}
            fill={slices[i].color}
            stroke="var(--surface)"
            strokeWidth={1.5}
            opacity={active === null || active === i ? 1 : 0.35}
            onPointerEnter={() => setActive(i)}
          />
        ))}
        <text x={100} y={88} textAnchor="middle" fontSize={11} className="fill-[var(--muted)]">
          {shown ? shown.label : `${rows.length} holdings`}
        </text>
        <text x={100} y={108} textAnchor="middle" fontSize={17} fontWeight={600} className="font-figures fill-[var(--foreground)]">
          {shown ? `${((shown.value / total) * 100).toFixed(1)}%` : money(total)}
        </text>
        <text x={100} y={124} textAnchor="middle" fontSize={11} className="font-figures fill-[var(--muted)]">
          {shown ? money(shown.value) : `top ${top.length}: ${(((total - rest) / total) * 100).toFixed(0)}%`}
        </text>
      </svg>
      <div className="flex w-full flex-col gap-1 text-sm">
        {slices.map((sl, i) => {
          const share = (sl.value / total) * 100;
          return (
            <div
              key={sl.label}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              className={`rounded px-1.5 py-1 ${active === i ? "bg-[var(--surface-hover)]" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: sl.color }} />
                <span className="truncate font-medium">{sl.label}</span>
                <span className="font-figures ml-auto font-mono text-xs text-[var(--muted)]">{share.toFixed(1)}%</span>
                <span className="font-figures w-20 text-right font-mono text-xs">{money(sl.value)}</span>
              </div>
              <div className="mt-1 ml-[18px] h-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(sl.value / maxSlice) * 100}%`, background: sl.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
