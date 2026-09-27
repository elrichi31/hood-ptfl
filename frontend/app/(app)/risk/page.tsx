import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Activity, Gauge, ShieldAlert, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { Card } from "@/components/Card";
import { ProjectionChart, type Band } from "@/components/ProjectionChart";

type Stats = { returnPct: number; volatilityPct: number; sharpe: number; sortino: number | null; maxDrawdownPct: number } | null;
type Risk = {
  totalValue: number;
  cash: number;
  window: { from: string | null; to: string | null; days: number };
  concentration: { holdings: number; top1: { symbol: string; pct: number } | null; top3Pct: number; effectivePositions: number };
  sectors: { sector: string; value: number; pct: number }[];
  beta: number;
  volatilityPct: number | null;
  var95: number | null;
  maxDrawdownPct: number;
  worstDay: { day: string; pct: number; loss: number } | null;
  scenarios: { marketPct: number; loss: number }[];
  vsMarket: { portfolio: Stats; spy: Stats; riskFreePct: number };
  projection: {
    horizons: { label: string; days: number; p5: number; p50: number; p95: number; probLossPct: number; probDown10Pct: number; probDown20Pct: number }[];
    bands: Band[];
    drawdownTypicalPct: number;
    drawdownBadPct: number;
    assumptions: { expectedReturnPct: number; riskFreePct: number; equityPremiumPct: number; volatilityPct: number; sampleDays: number; simulations: number };
  } | null;
  stress: { name: string; from: string; to: string; portfolioPct: number; spyPct: number; loss: number; estimatedPct: number }[];
  correlation: { topPairs: { a: string; b: string; corr: number }[]; diversificationRatio: number | null; riskReductionPct: number | null };
  earnings: { symbol: string; date: string; timing: "am" | "pm" | null; weightPct: number; avgMovePct: number; maxMovePct: number; atStake: number }[];
  positions: {
    symbol: string;
    type: "equity" | "crypto";
    sector: string | null;
    value: number;
    weightPct: number;
    riskPct: number | null;
    beta: number | null;
    betaAssumed: number | null;
    volatilityPct: number | null;
    days: number;
  }[];
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const signedPct = (n: number) => `${n > 0 ? "+" : ""}${n}%`;
const shortDate = (d: string, year = true) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
const label = "mb-2 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase";

function Stat({ label, icon, value, note }: { label: string; icon: ReactNode; value: string; note: string }) {
  return (
    <Card title={label} icon={icon}>
      <p className="font-figures truncate font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
    </Card>
  );
}

/** One labeled magnitude bar in the AnalysisCharts language: 2px-radius track, direct label at the end. */
function Bar({ label, pct, right, color = "var(--accent)", title }: { label: ReactNode; pct: number; right: string; color?: string; title?: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_auto]" title={title}>
      <span className="truncate text-[var(--secondary-foreground)]">{label}</span>
      <span className="h-2 overflow-hidden rounded-sm bg-[var(--surface-secondary)]">
        <span className="block h-full rounded-sm" style={{ width: `${Math.max(1, Math.min(100, pct))}%`, background: color }} />
      </span>
      <span className="font-figures text-right font-mono text-xs tabular-nums">{right}</span>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)]">
      {items.map(([name, color]) => (
        <span key={name} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
          {name}
        </span>
      ))}
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
  const worstStress = Math.max(1, ...r.stress.flatMap((s) => [Math.abs(s.portfolioPct), Math.abs(s.spyPct)]));
  const byRisk = [...r.positions].filter((p) => p.riskPct !== null).sort((a, b) => b.riskPct! - a.riskPct!).slice(0, 10);
  const maxShare = Math.max(1, ...byRisk.map((p) => Math.max(p.riskPct!, p.weightPct)));
  const heavy = byRisk.filter((p) => p.riskPct! >= 2 * p.weightPct && p.riskPct! >= 5);
  const year = r.projection?.horizons.at(-1);
  const earningsAtStake = r.earnings.reduce((s, e) => s + e.atStake, 0);

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24">
      <h1 className="text-2xl font-semibold tracking-tight">Risk</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        How your current mix behaves, measured against SPY over the last year
        {r.window.from && ` (${shortDate(r.window.from)} – ${shortDate(r.window.to!)})`}, and what the next one could look like.
        Estimates from past prices, not advice.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Beta" icon={<Activity size={15} />} value={r.beta.toFixed(2)} note={`Your portfolio ${betaWord(r.beta)}`} />
        <Stat
          label="Volatility"
          icon={<Gauge size={15} />}
          value={r.volatilityPct === null ? "—" : `${r.volatilityPct}%`}
          note={`Annualized · SPY ${r.vsMarket.spy?.volatilityPct ?? "—"}%`}
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

      {r.projection && year && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card title="Next 12 months (simulated)" className="lg:col-span-8">
            <ProjectionChart bands={r.projection.bands} start={r.totalValue} />
            <p className="mt-3 text-xs text-[var(--muted)]">
              {r.projection.assumptions.simulations.toLocaleString("en-US")} simulated years built from{" "}
              {Math.round(r.projection.assumptions.sampleDays / 252)} years of your mix&apos;s real daily moves (volatility{" "}
              {r.projection.assumptions.volatilityPct}%, crashes included). Growth is not last year&apos;s return: it assumes{" "}
              {r.projection.assumptions.expectedReturnPct}%/yr ({r.projection.assumptions.riskFreePct}% risk-free + β{r.beta} ×{" "}
              {r.projection.assumptions.equityPremiumPct}% equity premium). No new deposits.
            </p>
          </Card>

          <Card title="Odds" className="lg:col-span-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="pb-2 font-normal" />
                  {r.projection.horizons.map((h) => (
                    <th key={h.label} className="pb-2 text-right font-normal">
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-figures font-mono">
                {(
                  [
                    ["Median", (h) => money(h.p50)],
                    ["Bad (1 in 20)", (h) => money(h.p5)],
                    ["Good (1 in 20)", (h) => money(h.p95)],
                    ["Chance of a loss", (h) => `${h.probLossPct}%`],
                    ["Down 10%+", (h) => `${h.probDown10Pct}%`],
                    ["Down 20%+", (h) => `${h.probDown20Pct}%`],
                  ] as [string, (h: NonNullable<Risk["projection"]>["horizons"][number]) => string][]
                ).map(([name, fmt]) => (
                  <tr key={name} className="border-t border-[var(--border)]">
                    <td className="py-1.5 font-sans text-xs text-[var(--muted)]">{name}</td>
                    {r.projection!.horizons.map((h) => (
                      <td key={h.label} className="py-1.5 text-right text-xs">
                        {fmt(h)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Somewhere in a typical year expect a dip of about{" "}
              <span className="text-[var(--foreground)]">{r.projection.drawdownTypicalPct}%</span> from a high; in a bad one (1 in 20),{" "}
              <span className="text-[var(--danger)]">{r.projection.drawdownBadPct}%</span> (
              {money((r.projection.drawdownBadPct / 100) * r.totalValue)}).
            </p>
          </Card>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="Past crises, today's mix" className="lg:col-span-7">
          <Legend items={[["Your mix", "var(--accent)"], ["SPY", "var(--muted)"]]} />
          <div className="mt-3 flex flex-col gap-4">
            {r.stress.map((s) => (
              <div key={s.name}>
                <p className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span>
                    {s.name}{" "}
                    <span className="text-xs text-[var(--muted)]">
                      {shortDate(s.from, false)} – {shortDate(s.to)}
                    </span>
                  </span>
                  <span className="font-figures font-mono text-xs text-[var(--danger)]">{money(s.loss)} today</span>
                </p>
                <div className="flex flex-col gap-1">
                  <Bar label="Your mix" pct={(Math.abs(s.portfolioPct) / worstStress) * 100} right={signedPct(s.portfolioPct)} />
                  <Bar label="SPY" pct={(Math.abs(s.spyPct) / worstStress) * 100} right={signedPct(s.spyPct)} color="var(--muted)" />
                </div>
                {s.estimatedPct > 0 && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {s.estimatedPct}% of the mix had no price history yet and is estimated from its beta.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>

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
            Each holding&apos;s value × its beta. Beta explains typical days, not crashes, when correlations jump: see the replays for those.
            {assumed.length > 0 && ` ${assumed.map((p) => p.symbol).join(", ")}: not enough history yet, assumed β ${assumed[0].betaAssumed}.`}
          </p>

          {r.vsMarket.portfolio && r.vsMarket.spy && (
            <>
              <p className={`${label} mt-6`}>Last year: your mix vs SPY</p>
              <table className="w-full text-sm">
                <tbody className="font-figures font-mono text-xs">
                  {(
                    [
                      ["Return", "returnPct", "%"],
                      ["Volatility", "volatilityPct", "%"],
                      ["Sharpe", "sharpe", ""],
                      ["Sortino", "sortino", ""],
                      ["Max drawdown", "maxDrawdownPct", "%"],
                    ] as const
                  ).map(([name, k, unit]) => (
                    <tr key={k} className="border-t border-[var(--border)]">
                      <td className="py-1.5 font-sans text-[var(--muted)]">{name}</td>
                      <td className="py-1.5 text-right">
                        {r.vsMarket.portfolio![k] ?? "—"}
                        {unit}
                      </td>
                      <td className="py-1.5 text-right text-[var(--muted)]">
                        {r.vsMarket.spy![k] ?? "—"}
                        {unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Left: you. Right: SPY. Sharpe/Sortino = return above the {r.vsMarket.riskFreePct}% risk-free rate per unit of
                (downside) volatility. Higher is better paid risk.
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="Where your risk comes from" className="lg:col-span-7">
          <Legend items={[["Share of money", "var(--muted)"], ["Share of risk", "var(--accent)"]]} />
          <div className="mt-3 flex flex-col gap-2.5">
            {byRisk.map((p) => (
              <div key={p.symbol} className="flex flex-col gap-1">
                <Bar label={p.symbol} pct={(p.weightPct / maxShare) * 100} right={`${p.weightPct}%`} color="var(--muted)" title="Share of money" />
                <Bar label="" pct={(p.riskPct! / maxShare) * 100} right={`${p.riskPct}%`} title="Share of portfolio volatility it causes" />
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Share of risk = how much of the portfolio&apos;s daily swings each position causes, given how it moves with everything else.
            {heavy.length > 0 &&
              ` ${heavy.map((p) => `${p.symbol} carries ${(p.riskPct! / p.weightPct).toFixed(1)}× its weight`).join(", ")}.`}
          </p>
        </Card>

        <Card title="Moves together" className="lg:col-span-5">
          {r.correlation.riskReductionPct !== null && (
            <p className="text-sm">
              Diversification cuts your volatility by{" "}
              <span className="font-figures font-mono font-semibold">{r.correlation.riskReductionPct}%</span>
              <span className="text-[var(--muted)]"> versus holding the same positions if they all moved in lockstep.</span>
            </p>
          )}
          <p className={`${label} mt-4`}>Most correlated pairs (1y daily)</p>
          <div className="flex flex-col gap-2">
            {r.correlation.topPairs.map((p) => (
              <Bar key={`${p.a}-${p.b}`} label={`${p.a} + ${p.b}`} pct={p.corr * 100} right={p.corr.toFixed(2)} />
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            1.00 = move identically. Pairs above ~0.8 behave like one bigger bet. Positions under 2% of the portfolio are left out.
          </p>
        </Card>
      </div>

      {r.earnings.length > 0 && (
        <div className="mt-4">
          <Card title="Earnings in the next 60 days">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--muted)]">
                    <th className="pb-2 font-normal">Date</th>
                    <th className="pb-2 font-normal">Symbol</th>
                    <th className="pb-2 text-right font-normal">Weight</th>
                    <th className="pb-2 text-right font-normal" title="Average absolute move on the session that priced in each of the last reports">
                      Typical move
                    </th>
                    <th className="pb-2 text-right font-normal">Biggest</th>
                    <th className="pb-2 text-right font-normal">At stake</th>
                  </tr>
                </thead>
                <tbody>
                  {r.earnings.map((e) => (
                    <tr key={e.symbol} className="border-t border-[var(--border)]">
                      <td className="py-2">
                        {shortDate(e.date, false)}{" "}
                        <span className="text-xs text-[var(--muted)]">{e.timing === "pm" ? "after close" : e.timing === "am" ? "before open" : ""}</span>
                      </td>
                      <td className="py-2 font-medium">{e.symbol}</td>
                      <td className="font-figures py-2 text-right font-mono">{e.weightPct}%</td>
                      <td className="font-figures py-2 text-right font-mono">±{e.avgMovePct}%</td>
                      <td className="font-figures py-2 text-right font-mono text-[var(--muted)]">±{e.maxMovePct}%</td>
                      <td className="font-figures py-2 text-right font-mono">±{money(e.atStake)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Typical move = average absolute move on earnings day over the last ~2 years. Together these reports put about{" "}
              <span className="text-[var(--foreground)]">±{money(earningsAtStake)}</span> in play.
            </p>
          </Card>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="Concentration" className="lg:col-span-5">
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
          <p className={`${label} mt-4`}>Sector exposure</p>
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

        <Card title="By position" className="lg:col-span-7">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="pb-2 font-normal">Symbol</th>
                  <th className="pb-2 text-right font-normal">Weight</th>
                  <th className="pb-2 text-right font-normal">Risk</th>
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
                      <td className="py-2">
                        <span className="font-medium">{p.symbol}</span>{" "}
                        <span className="text-xs text-[var(--muted)]">{p.sector ?? ""}</span>
                      </td>
                      <td className="font-figures py-2 text-right font-mono">{p.weightPct}%</td>
                      <td
                        className={`font-figures py-2 text-right font-mono ${p.riskPct !== null && p.riskPct >= 2 * p.weightPct && p.riskPct >= 5 ? "text-[var(--danger)]" : ""}`}
                      >
                        {p.riskPct === null ? "—" : `${p.riskPct}%`}
                      </td>
                      <td
                        className={`font-figures py-2 text-right font-mono ${p.beta === null ? "text-[var(--muted)]" : ""}`}
                        title={p.beta === null ? `Only ${p.days} days of history, assumed` : undefined}
                      >
                        {p.beta === null ? `~${beta}` : beta.toFixed(2)}
                      </td>
                      <td className="font-figures py-2 text-right font-mono">{p.volatilityPct === null ? "—" : `${p.volatilityPct}%`}</td>
                      <td className="font-figures py-2 text-right font-mono text-[var(--danger)]">{beta > 0 ? money(-p.value * beta * 0.1) : "—"}</td>
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
