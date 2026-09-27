"use client";

import { useState } from "react";

export type Band = { day: number; p5: number; p25: number; p50: number; p75: number; p95: number };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const W = 640;
const H = 240;
const PAD = { top: 12, right: 118, bottom: 24, left: 8 };

/**
 * Fan chart of simulated portfolio value over the next trading year: outer band = 5th–95th percentile,
 * inner = 25th–75th, line = median. One series in one hue (bands are opacity steps of it), so the end
 * labels name each edge and no legend box is needed. Hover shows the percentiles at that point.
 */
export function ProjectionChart({ bands, start }: { bands: Band[]; start: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const lastDay = bands[bands.length - 1].day;
  const lo = Math.min(start, ...bands.map((b) => b.p5));
  const hi = Math.max(start, ...bands.map((b) => b.p95));
  const x = (day: number) => PAD.left + (day / lastDay) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
  const area = (a: keyof Band, b: keyof Band) =>
    `M${bands.map((p) => `${x(p.day)},${y(p[a])}`).join("L")}L${[...bands].reverse().map((p) => `${x(p.day)},${y(p[b])}`).join("L")}Z`;
  const line = (k: keyof Band) => `M${bands.map((p) => `${x(p.day)},${y(p[k])}`).join("L")}`;
  const end = bands[bands.length - 1];
  const months = [0, 3, 6, 9, 12];
  const h = hover === null ? null : bands[hover];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const day = ((svgX - PAD.left) / (W - PAD.left - PAD.right)) * lastDay;
    const i = Math.round(Math.max(0, Math.min(lastDay, day)) / (bands[1].day - bands[0].day));
    setHover(Math.min(bands.length - 1, i));
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Simulated value in one year: median ${money(end.p50)}, 5th percentile ${money(end.p5)}, 95th percentile ${money(end.p95)}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Today's value as a recessive reference line */}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(start)} y2={y(start)} stroke="var(--border)" strokeDasharray="3 3" />
        <text x={PAD.left} y={y(start) - 4} fontSize="10" fill="var(--muted)">
          Today {money(start)}
        </text>

        <path d={area("p95", "p5")} fill="var(--accent)" opacity={0.12} />
        <path d={area("p75", "p25")} fill="var(--accent)" opacity={0.22} />
        <path d={line("p50")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />

        {/* Direct labels at the end of each edge */}
        {(
          [
            ["p95", "95th percentile"],
            ["p50", "Median"],
            ["p5", "5th percentile"],
          ] as const
        ).map(([k, label]) => (
          <g key={k}>
            <text x={W - PAD.right + 8} y={y(end[k]) - 2} fontSize="10" fill="var(--muted)">
              {label}
            </text>
            <text x={W - PAD.right + 8} y={y(end[k]) + 10} fontSize="11" fontWeight={600} fill="var(--foreground)" className="font-figures">
              {money(end[k])}
            </text>
          </g>
        ))}

        {months.map((m) => (
          <text key={m} x={x((m / 12) * lastDay)} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor={m === 0 ? "start" : "middle"}>
            {m === 0 ? "Now" : `${m}M`}
          </text>
        ))}

        {h && (
          <g>
            <line x1={x(h.day)} x2={x(h.day)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={x(h.day)} cy={y(h.p50)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {h && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${Math.min(62, (x(h.day) / W) * 100)}%` }}
        >
          <p className="text-[var(--muted)]">In {Math.round(h.day / 21)} months ({h.day} trading days)</p>
          <p className="font-figures font-mono">95th {money(h.p95)}</p>
          <p className="font-figures font-mono font-semibold">Median {money(h.p50)}</p>
          <p className="font-figures font-mono">5th {money(h.p5)}</p>
        </div>
      )}
    </div>
  );
}
