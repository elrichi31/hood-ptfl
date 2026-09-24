"use client";

import { useRef, useState } from "react";

type Snapshot = { totalValue: number; cash: number; at: string };

const W = 680;
const H = 180;
const PAD = 24;

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function PortfolioChart({ data }: { data: Snapshot[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Collecting data — a point is saved every 5 minutes. Check back soon.
      </p>
    );
  }

  const values = data.map((d) => d.totalValue);
  const times = data.map((d) => new Date(d.at).getTime());
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanV = maxV - minV || 1;
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const spanT = maxT - minT || 1;

  const x = (t: number) => PAD + ((t - minT) / spanT) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - minV) / spanV) * (H - PAD * 2);

  const points = data.map((d, i) => ({ x: x(times[i]), y: y(d.totalValue), d }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - px);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {/* recessive reference lines at min/max */}
          <line x1={PAD} y1={y(maxV)} x2={W - PAD} y2={y(maxV)} stroke="var(--border)" strokeWidth="1" />
          <line x1={PAD} y1={y(minV)} x2={W - PAD} y2={y(minV)} stroke="var(--border)" strokeWidth="1" />
          <text x={PAD} y={y(maxV) - 6} className="fill-[var(--muted)]" fontSize="10">
            {money(maxV)}
          </text>
          <text x={PAD} y={y(minV) + 14} className="fill-[var(--muted)]" fontSize="10">
            {money(minV)}
          </text>

          <path d={areaPath} fill="var(--accent)" opacity="0.1" />
          <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {hovered && (
            <line x1={hovered.x} y1={PAD} x2={hovered.x} y2={H - PAD} stroke="var(--muted)" strokeWidth="1" />
          )}

          {/* end marker: value at the end, per dataviz mark spec */}
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" fill="var(--accent)" stroke="var(--background)" strokeWidth="2" />
          {hovered && (
            <circle cx={hovered.x} cy={hovered.y} r="4" fill="var(--accent)" stroke="var(--background)" strokeWidth="2" />
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${(hovered.x / W) * 100}%` }}
          >
            <p className="font-figures font-mono font-semibold">{money(hovered.d.totalValue)}</p>
            <p className="text-[var(--muted)]">
              {new Date(hovered.d.at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
