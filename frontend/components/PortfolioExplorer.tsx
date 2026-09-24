"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/Card";
import { PortfolioChart } from "@/components/PortfolioChart";

export type PositionHistory = {
  at: string[];
  total: number[];
  cash: number[];
  symbols: Record<string, { type: string; qty: (number | null)[]; price: (number | null)[] }>;
};

const RANGES = [
  { key: "1D", label: "1D", ms: 864e5 },
  { key: "1W", label: "1S", ms: 7 * 864e5 },
  { key: "1M", label: "1M", ms: 31 * 864e5 },
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
  const from = Math.max(0, times.findIndex((t) => t >= cutoff));
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

export function PortfolioExplorer({ history, aside }: { history: PositionHistory; aside?: ReactNode }) {
  const [range, setRange] = useState<RangeKey>("1D");
  const data = useMemo(() => sliceRange(history, RANGES.find((r) => r.key === range)!.ms), [history, range]);
  const tabs = <RangeTabs value={range} onChange={setRange} />;

  const first = data.total[0] ?? 0;
  const last = data.total[data.total.length - 1] ?? 0;
  const change = last - first;

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
          Aún no hay suficientes datos. Corre <code>node ace portfolio:backfill</code> o espera al poller.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="Value over time" action={tabs} className="lg:col-span-8">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-figures font-mono text-2xl font-semibold">{money(last)}</span>
            <span className={`font-figures font-mono text-sm ${upDown(change)}`}>
              {signedMoney(change)} ({signedPct(first ? (change / first) * 100 : 0)})
            </span>
          </div>
          <PortfolioChart data={data.at.map((at, i) => ({ at, totalValue: data.total[i], cash: data.cash[i] }))} />
        </Card>
        <div className="lg:col-span-4">{aside}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="Aporte al P&L por acción" action={tabs} className="lg:col-span-5">
          <ContributionBars rows={contributions} />
        </Card>
        <Card title="Distribución en el tiempo" action={tabs} className="lg:col-span-7">
          <AllocationArea data={data} />
        </Card>
      </div>

      <Card title="Cada posición" action={tabs}>
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
  if (!rows.length) return <p className="text-sm text-[var(--muted)]">Sin movimiento en este rango.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.pnl)));
  const net = rows.reduce((s, r) => s + r.pnl, 0);
  return (
    <div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Neto: <span className={`font-figures font-mono ${upDown(net)}`}>{signedMoney(net)}</span>
      </p>
      <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto pr-1">
        {rows.map((r) => (
          <div key={r.symbol} className="flex items-center gap-2 text-sm" title={`${r.symbol}: ${signedMoney(r.pnl)}`}>
            <span className="w-12 shrink-0 font-medium">{r.symbol}</span>
            <div className="grid flex-1 grid-cols-2">
              <div className="flex justify-end border-r border-[var(--border)]">
                {r.pnl < 0 && (
                  <div
                    className="h-3 rounded-l bg-[var(--danger)]"
                    style={{ width: `${(Math.abs(r.pnl) / max) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex">
                {r.pnl > 0 && (
                  <div className="h-3 rounded-r bg-[var(--success)]" style={{ width: `${(r.pnl / max) * 100}%` }} />
                )}
              </div>
            </div>
            <span className="font-figures w-20 shrink-0 text-right font-mono text-xs">{signedMoney(r.pnl)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const W = 680;
const H = 200;
const PAD = 8;
const BANDS = [
  { key: "stocks", label: "Stocks & ETFs", color: "var(--accent)" },
  { key: "crypto", label: "Crypto", color: "var(--crypto)" },
  { key: "cash", label: "Cash", color: "var(--muted)" },
] as const;

/** 100%-stacked area of Stocks / Crypto / Cash share at each snapshot. */
function AllocationArea({ data }: { data: ReturnType<typeof sliceRange> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const shares = data.at.map((_, i) => {
    let stocks = 0;
    let crypto = 0;
    for (const s of Object.values(data.symbols)) {
      const q = s.qty[i];
      const p = s.price[i];
      if (q == null || p == null) continue;
      if (s.type === "crypto") crypto += q * p;
      else stocks += q * p;
    }
    const cash = data.cash[i];
    const total = stocks + crypto + cash || 1;
    return { stocks: stocks / total, crypto: crypto / total, cash: cash / total };
  });
  if (shares.length < 2) return <p className="text-sm text-[var(--muted)]">Sin datos en este rango.</p>;

  // Index spacing (not time) so overnight gaps don't stretch into flat plateaus.
  const x = (i: number) => (i / (shares.length - 1)) * W;
  const y = (f: number) => PAD + (1 - f) * (H - PAD * 2);
  const paths = BANDS.map((band, b) => {
    const lower = shares.map((s) => BANDS.slice(0, b).reduce((acc, bb) => acc + s[bb.key], 0));
    const upper = shares.map((s, i) => lower[i] + s[band.key]);
    const top = upper.map((u, i) => `${i ? "L" : "M"} ${x(i)} ${y(u)}`).join(" ");
    const bottom = lower.map((l, i) => `L ${x(i)} ${y(l)}`).reverse().join(" ");
    return { ...band, d: `${top} ${bottom} Z` };
  });

  const h = hover !== null ? shares[hover] : shares[shares.length - 1];
  const hAt = data.at[hover ?? shares.length - 1];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {BANDS.map((b) => (
          <span key={b.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />
            <span className="text-[var(--muted)]">{b.label}</span>
            <span className="font-figures font-mono">{(h[b.key] * 100).toFixed(1)}%</span>
          </span>
        ))}
        <span className="ml-auto text-[var(--muted)]">
          {new Date(hAt).toLocaleString("es", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[200px] w-full"
        onPointerMove={(e) => {
          const rect = svgRef.current!.getBoundingClientRect();
          const i = Math.round(((e.clientX - rect.left) / rect.width) * (shares.length - 1));
          setHover(Math.max(0, Math.min(shares.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill={p.color} opacity={0.85} stroke="var(--surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--foreground)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    </div>
  );
}
