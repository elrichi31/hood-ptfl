"use client";

import { useRef, useState } from "react";
import { useWidth } from "@/lib/useWidth";

export type DailyPnl = { day: string; pnl: number; pct: number | null; startValue: number; endValue: number };

const T = 12;
const B = 24;

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;
const tone = (n: number) => (n >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]");
const label = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "1Y", days: 366 },
  { key: "All", days: Infinity },
] as const;

/** Market P&L per day as diverging bars, with the running total as a line. */
export function DailyPnlChart({ days: all }: { days: DailyPnl[] }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("1M");

  if (all.length < 1) return <p className="text-sm text-[var(--muted)]">No daily data yet.</p>;

  const span = RANGES.find((r) => r.key === range)!.days;
  // Relative to the newest day (pure, and 'All' never builds an invalid Date).
  const cutoff =
    span === Infinity ? "" : new Date(new Date(`${all[all.length - 1].day}T12:00:00Z`).getTime() - span * 864e5).toISOString().slice(0, 10);
  const days = all.filter((d) => d.day >= cutoff);

  const cum: number[] = [];
  for (const d of days) cum.push((cum[cum.length - 1] ?? 0) + d.pnl);
  const total = cum[cum.length - 1] ?? 0;
  const wins = days.filter((d) => d.pnl > 0).length;
  const best = days.reduce((a, d) => (d.pnl > a.pnl ? d : a), days[0]);
  const worst = days.reduce((a, d) => (d.pnl < a.pnl ? d : a), days[0]);
  const avg = total / (days.length || 1);

  const narrow = W < 520;
  const H = narrow ? 200 : 240;
  const R = narrow ? 56 : 68;
  const hi = Math.max(0, ...days.map((d) => d.pnl), ...cum);
  const lo = Math.min(0, ...days.map((d) => d.pnl), ...cum);
  const y = (v: number) => T + ((hi - v) / (hi - lo || 1)) * (H - T - B);
  const slot = (W - R) / days.length;
  const bw = Math.max(2, Math.min(28, slot * 0.7));
  const cx = (i: number) => slot * i + slot / 2;
  const cumPath = cum.map((v, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(days.length / Math.max(2, Math.floor((W - R) / 80)));

  const h = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
        <span>
          Net <span className={`font-figures font-mono text-sm font-semibold ${tone(total)}`}>{signed(total)}</span>
        </span>
        <span>
          Avg/day <span className={`font-figures font-mono ${tone(avg)}`}>{signed(avg)}</span>
        </span>
        <span>
          Green days{" "}
          <span className="font-figures font-mono text-[var(--foreground)]">
            {wins}/{days.length} ({Math.round((wins / (days.length || 1)) * 100)}%)
          </span>
        </span>
        <span>
          Best <span className="font-figures font-mono text-[var(--success)]">{signed(best.pnl)}</span>{" "}
          {label(best.day, { month: "short", day: "numeric" })}
        </span>
        <span>
          Worst <span className="font-figures font-mono text-[var(--danger)]">{signed(worst.pnl)}</span>{" "}
          {label(worst.day, { month: "short", day: "numeric" })}
        </span>
        <div role="tablist" className="ml-auto flex rounded-lg border border-[var(--border)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2.5 py-0.5 font-medium ${
                range === r.key ? "bg-[var(--surface-hover)] text-[var(--foreground)]" : "hover:text-[var(--foreground)]"
              }`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block max-w-full touch-pan-y select-none"
          onPointerMove={(e) => {
            const rect = svgRef.current!.getBoundingClientRect();
            const px = e.clientX - rect.left;
            setHover(Math.max(0, Math.min(days.length - 1, Math.floor(px / slot))));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <line x1={0} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
          {[hi, lo].map((v) =>
            v ? (
              <text key={v} x={W - R + 6} y={y(v) + 3.5} fontSize={11} className="font-figures fill-[var(--muted)]">
                {signed(v)}
              </text>
            ) : null
          )}
          <text x={W - R + 6} y={y(0) + 3.5} fontSize={11} className="fill-[var(--muted)]">
            $0
          </text>

          {days.map((d, i) => (
            <rect
              key={d.day}
              x={cx(i) - bw / 2}
              width={bw}
              y={Math.min(y(d.pnl), y(0))}
              height={Math.max(1, Math.abs(y(d.pnl) - y(0)))}
              rx={Math.min(3, bw / 3)}
              fill={d.pnl >= 0 ? "var(--success)" : "var(--danger)"}
              opacity={hover === null || hover === i ? 0.9 : 0.4}
            />
          ))}
          <path d={cumPath} fill="none" stroke="var(--accent)" strokeWidth={1.75} strokeLinejoin="round" />

          {days.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.day} x={cx(i)} y={H - 8} fontSize={11} textAnchor="middle" className="fill-[var(--muted)]">
                {label(d.day, { month: "short", day: "numeric" })}
              </text>
            ) : null
          )}
        </svg>

        {h && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[160px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: cx(hover!),
              transform: `translateX(${cx(hover!) > W / 2 ? "calc(-100% - 10px)" : "10px"})`,
            }}
          >
            <p className="text-[var(--muted)]">{label(h.day, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>
            <p className={`font-figures font-mono text-sm font-semibold ${tone(h.pnl)}`}>
              {signed(h.pnl)} {h.pct != null && <span className="text-xs">({h.pct >= 0 ? "+" : ""}{h.pct.toFixed(2)}%)</span>}
            </p>
            <p className="font-figures font-mono text-[var(--muted)]">Running {signed(cum[hover!])}</p>
            <p className="font-figures font-mono text-[var(--muted)]">Close {money(h.endValue)}</p>
          </div>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-[var(--success)]" /> Gain
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-[var(--danger)]" /> Loss
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-[var(--accent)]" /> Running total
        </span>
        <span className="ml-auto">Market moves only — deposits, buys and sells don&apos;t count.</span>
      </p>
    </div>
  );
}
