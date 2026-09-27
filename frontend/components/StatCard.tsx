import type { ReactNode } from "react";
import { Card } from "@/components/Card";

// Plain (no hooks), so it renders as a server component on the overview and inside client ones
// like the live Today card.
function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / range) * 26}`);
  const color = up ? "var(--success)" : "var(--danger)";
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-10 w-24 shrink-0" aria-hidden>
      <polygon points={`0,30 ${pts.join(" ")} 100,30`} fill={color} opacity={0.1} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  color,
  icon,
  trend,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  icon?: ReactNode;
  trend?: { series: number[]; pct: number | null; caption?: string };
}) {
  const up = (trend?.pct ?? 0) >= 0;
  return (
    <Card title={label} icon={icon}>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className={`font-figures truncate font-mono text-2xl font-semibold ${color ?? ""}`}>{value}</p>
          {trend?.pct != null && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              <span className={up ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                {up ? "+" : ""}
                {trend.pct.toFixed(1)}%
              </span>{" "}
              {trend.caption ?? "vs last week"}
            </p>
          )}
        </div>
        {trend && <Sparkline values={trend.series} up={up} />}
      </div>
    </Card>
  );
}
