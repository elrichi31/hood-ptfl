import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Activity, Gauge, ShieldAlert, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { Card } from "@/components/Card";

type Risk = {
  totalValue: number;
  cash: number;
  window: { from: string | null; to: string | null; days: number };
  concentration: {
    holdings: number;
    top1: { symbol: string; pct: number } | null;
    top3Pct: number;
    effectivePositions: number;
  };
  sectors: { sector: string; value: number; pct: number }[];
  beta: number;
  volatilityPct: number | null;
  var95: number | null;
  maxDrawdownPct: number;
  worstDay: { day: string; pct: number; loss: number } | null;
  scenarios: { marketPct: number; loss: number }[];
  positions: {
    symbol: string;
    type: "equity" | "crypto";
    sector: string | null;
    value: number;
    weightPct: number;
    beta: number | null;
    betaAssumed: number | null;
    volatilityPct: number | null;
    days: number;
  }[];
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Stat({ label, icon, value, note }: { label: string; icon: ReactNode; value: string; note: string }) {
  return (
    <Card title={label} icon={icon}>
      <p className="font-figures truncate font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
    </Card>
  );
}

/** One labeled magnitude bar in the AnalysisCharts language: 2px-radius track, direct label at the end. */
function Bar({ label, pct, right, color = "var(--accent)" }: { label: string; pct: number; right: string; color?: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_auto]">
      <span className="truncate text-[var(--secondary-foreground)]">{label}</span>
      <span className="h-2 overflow-hidden rounded-sm bg-[var(--surface-secondary)]">
        <span className="block h-full rounded-sm" style={{ width: `${Math.max(1, Math.min(100, pct))}%`, background: color }} />
      </span>
      <span className="font-figures text-right font-mono text-xs tabular-nums">{right}</span>
    </div>
  );
}

const betaWord = (b: number) =>
  b >= 1.15 ? "swings harder than the market" : b <= 0.85 ? "calmer than the market" : "moves about with the market";

export default async function RiskPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const res = await backend("/api/v1/risk");
  if (!res.ok) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-[var(--danger)]">Could not load risk (backend returned {res.status}).</p>
      </main>
    );
  }
  const r: Risk = await res.json();
  const worstScenario = Math.max(...r.scenarios.map((s) => Math.abs(s.loss)), 1);
  const assumed = r.positions.filter((p) => p.betaAssumed !== null && p.betaAssumed !== 0);

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24">
      <h1 className="text-2xl font-semibold tracking-tight">Risk</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        How your current mix would have behaved over the last year
        {r.window.from && ` (${shortDate(r.window.from)} – ${shortDate(r.window.to!)}, ${r.window.days} trading days)`}, measured
        against SPY.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Beta" icon={<Activity size={15} />} value={r.beta.toFixed(2)} note={`Your portfolio ${betaWord(r.beta)}`} />
        <Stat
          label="Volatility"
          icon={<Gauge size={15} />}
          value={r.volatilityPct === null ? "—" : `${r.volatilityPct}%`}
          note="Annualized · SPY runs ~13–15%"
        />
        <Stat
          label="1-day VaR (95%)"
          icon={<ShieldAlert size={15} />}
          value={r.var95 === null ? "—" : money(r.var95)}
          note="A normal day loses less than this, 19 days out of 20"
        />
        <Stat
          label="Max drawdown"
          icon={<TrendingDown size={15} />}
          value={`${r.maxDrawdownPct}%`}
          note={r.worstDay ? `Worst day ${r.worstDay.pct}% (${money(r.worstDay.loss)}) on ${shortDate(r.worstDay.day)}` : "Peak-to-trough, last year"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="If the market drops" className="lg:col-span-5">
          <div className="flex flex-col gap-3">
            {r.scenarios.map((s) => (
              <Bar
                key={s.marketPct}
                label={`SPY ${s.marketPct}%`}
                pct={(Math.abs(s.loss) / worstScenario) * 100}
                right={`${money(s.loss)} (${((s.loss / r.totalValue) * 100).toFixed(1)}%)`}
                color="var(--danger)"
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Each holding&apos;s value × its beta. Beta explains typical days, not crashes, when correlations jump.
            {assumed.length > 0 && ` ${assumed.map((p) => p.symbol).join(", ")}: not enough history yet, assumed β ${assumed[0].betaAssumed}.`}
          </p>
        </Card>

        <Card title="Concentration" className="lg:col-span-7">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">Largest</p>
              <p className="font-figures font-mono text-lg font-semibold">{r.concentration.top1?.pct ?? 0}%</p>
              <p className="text-xs text-[var(--muted)]">{r.concentration.top1?.symbol ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Top 3</p>
              <p className="font-figures font-mono text-lg font-semibold">{r.concentration.top3Pct}%</p>
              <p className="text-xs text-[var(--muted)]">of the portfolio</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Effective positions</p>
              <p className="font-figures font-mono text-lg font-semibold">{r.concentration.effectivePositions}</p>
              <p className="text-xs text-[var(--muted)]">of {r.concentration.holdings} held</p>
            </div>
          </div>
          <p className="mt-4 mb-2 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase">Sector exposure</p>
          <div className="flex flex-col gap-2">
            {r.sectors.map((s) => (
              <Bar
                key={s.sector}
                label={s.sector}
                pct={(s.pct / r.sectors[0].pct) * 100}
                right={`${s.pct}%`}
                color={s.sector === "Crypto" ? "var(--crypto)" : "var(--accent)"}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="By position">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="pb-2 font-normal">Symbol</th>
                  <th className="pb-2 font-normal">Sector</th>
                  <th className="pb-2 text-right font-normal">Weight</th>
                  <th className="pb-2 text-right font-normal">Beta</th>
                  <th className="pb-2 text-right font-normal">Volatility</th>
                  <th className="pb-2 text-right font-normal">Hit if SPY −10%</th>
                </tr>
              </thead>
              <tbody>
                {r.positions.map((p) => {
                  const beta = p.beta ?? p.betaAssumed ?? 0;
                  return (
                    <tr key={p.symbol} className="border-t border-[var(--border)]">
                      <td className="py-2 font-medium">{p.symbol}</td>
                      <td className="py-2 text-[var(--muted)]">{p.sector ?? "—"}</td>
                      <td className="font-figures py-2 text-right font-mono">{p.weightPct}%</td>
                      <td
                        className={`font-figures py-2 text-right font-mono ${p.beta === null ? "text-[var(--muted)]" : ""}`}
                        title={p.beta === null ? `Only ${p.days} days of history, assumed` : undefined}
                      >
                        {p.beta === null ? `~${beta}` : beta.toFixed(2)}
                      </td>
                      <td className="font-figures py-2 text-right font-mono">
                        {p.volatilityPct === null ? "—" : `${p.volatilityPct}%`}
                      </td>
                      <td className="font-figures py-2 text-right font-mono text-[var(--danger)]">
                        {beta > 0 ? money(-p.value * beta * 0.1) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}
