"use client";

import { useRef, useState } from "react";
import { isRegular } from "@/lib/history";
import { useWidth } from "@/lib/useWidth";

type Snapshot = { totalValue: number; cash: number; at: string };

const L = 4;
const T = 12;
const B = 24; // room for x-axis labels
const REGULAR = "var(--accent)";
const EXTENDED = "var(--warning)"; // after-hours / overnight / pre-market

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const compact = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1e4 ? 0 : 2 });
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;

/** ~count round tick values covering [min, max]. */
function niceTicks(min: number, max: number, count = 5) {
  const raw = (max - min) / count || Math.abs(max) / 100 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const dayKey = (t: string) => new Date(t).toDateString();

export function PortfolioChart({ data }: { data: Snapshot[] }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Collecting data — a point is saved every 5 minutes. Check back soon.
      </p>
    );
  }

  const narrow = W < 520;
  const H = narrow ? 200 : 260;
  const R = narrow ? 58 : 72; // y-axis labels
  const values = data.map((d) => d.totalValue);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), narrow ? 4 : 5);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const start = values[0];
  const regular = data.map((d) => isRegular(d.at));

  // Index spacing (not time) so nights/weekends don't render as long flat plateaus.
  const x = (i: number) => L + (i / (data.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const pt = (i: number) => `${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`;

  // One path per run of same-session points; a segment takes the color of the point it ends on.
  const runs: { color: string; d: string }[] = [];
  for (let i = 1; i < data.length; i++) {
    const color = regular[i] ? REGULAR : EXTENDED;
    const last = runs[runs.length - 1];
    if (last?.color === color) last.d += ` L${pt(i)}`;
    else runs.push({ color, d: `M${pt(i - 1)} L${pt(i)}` });
  }
  const line = values.map((_, i) => `${i ? "L" : "M"}${pt(i)}`).join(" ");
  const area = `${line} L${x(data.length - 1)} ${H - B} L${x(0)} ${H - B} Z`;

  // Faint separator at each day change; axis labels are evenly spaced ticks instead, so they never
  // collide (a 1D range that crosses midnight used to stack two dates at the start).
  const dayBreaks = data.flatMap((d, i) => (i > 0 && dayKey(d.at) !== dayKey(data[i - 1].at) ? [i] : []));
  const spanMs = new Date(data[data.length - 1].at).getTime() - new Date(data[0].at).getTime();
  const short = spanMs <= 36 * 3600e3;
  const tickCount = Math.min(Math.max(2, Math.floor((W - R) / 110)), data.length);
  const xTicks = [
    ...new Set(Array.from({ length: tickCount }, (_, k) => Math.round((k / (tickCount - 1)) * (data.length - 1)))),
  ];
  const tickLabel = (at: string) =>
    short
      ? new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const h = hover !== null ? data[hover] : null;
  const hChange = h ? h.totalValue - start : 0;
  const lastColor = regular[data.length - 1] ? REGULAR : EXTENDED;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block max-w-full touch-pan-y select-none"
        onPointerMove={(e) => {
          const rect = svgRef.current!.getBoundingClientRect();
          const i = Math.round(((e.clientX - rect.left - L) / (W - L - R)) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={REGULAR} stopOpacity={0.16} />
            <stop offset="100%" stopColor={REGULAR} stopOpacity={0} />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={W - R + 6} y={y(t) + 3.5} fontSize={11} className="font-figures fill-[var(--muted)]">
              {compact(t)}
            </text>
          </g>
        ))}

        {dayBreaks.map((i) => (
          <line key={i} x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke="var(--border)" strokeDasharray="2 3" />
        ))}
        {xTicks.map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={H - 7}
            fontSize={11}
            textAnchor={k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle"}
            className="fill-[var(--muted)]"
          >
            {tickLabel(data[i].at)}
          </text>
        ))}

        {/* start-of-range baseline: above it = gain over the range */}
        <line x1={L} x2={W - R} y1={y(start)} y2={y(start)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />

        <path d={area} fill="url(#pc-fill)" />
        {runs.map((r, k) => (
          <path key={k} d={r.d} fill="none" stroke={r.color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(values[hover])} r={4} fill={regular[hover] ? REGULAR : EXTENDED} stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        <circle cx={x(data.length - 1)} cy={y(values[values.length - 1])} r={3.5} fill={lastColor} stroke="var(--surface)" strokeWidth={2} />
      </svg>

      <div className="mt-1 flex items-center gap-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded" style={{ background: REGULAR }} /> Market hours
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded" style={{ background: EXTENDED }} /> After-hours &amp; overnight
        </span>
      </div>

      {h && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[150px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: x(hover!),
            transform: `translateX(${x(hover!) > W / 2 ? "calc(-100% - 10px)" : "10px"})`,
          }}
        >
          <p className="font-figures font-mono text-sm font-semibold">{money(h.totalValue)}</p>
          <p className={`font-figures font-mono ${hChange >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
            {signed(hChange)} ({((hChange / start) * 100).toFixed(2)}%)
          </p>
          <p className="text-[var(--muted)]">
            {new Date(h.at).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {!regular[hover!] && <span style={{ color: EXTENDED }}> · extended</span>}
          </p>
        </div>
      )}
    </div>
  );
}
