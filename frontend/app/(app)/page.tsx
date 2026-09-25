import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Wallet, TrendingUp, CalendarClock, CalendarDays, PiggyBank } from "lucide-react";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { PortfolioExplorer, type PositionHistory } from "@/components/PortfolioExplorer";
import { PositionsTable } from "@/components/PositionsTable";
import { DailyPnlChart, type DailyPnl } from "@/components/DailyPnlChart";
import { AllocationChart, TopMoversChart, ConcentrationChart } from "@/components/AnalysisCharts";
import { auth } from "@/lib/auth";
import { flowAdjustedPnl, prevCloseIndex } from "@/lib/history";
import { backend } from "@/lib/backend";


type Balance = {
  total: number;
  accounts: { type: string; nickname: string | null; totalValue: number; cash: number }[];
};
type Position = {
  symbol: string;
  name?: string;
  quantity: number;
  avgCost: number | null;
  price: number;
  value: number;
};
type Positions = { equities: Position[]; crypto: Position[] };
type Snapshot = { totalValue: number; cash: number; at: string };
type Pnl = { total: number; span: string };
type Latest = { at: string; balance: Balance; positions: Positions; pnl: Pnl | null };

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
// "3 minutes ago" — relative, so it's right regardless of the server's timezone.
function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return min < 60 ? rtf.format(-min, "minute") : rtf.format(-Math.round(min / 60), "hour");
}
const signed = (n: number) => (n >= 0 ? `+${money(n)}` : `-${money(Math.abs(n))}`);

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

// Change vs. the first snapshot of the last 7 days.
function weekly(history: Snapshot[], key: "totalValue" | "cash") {
  const since = Date.now() - 7 * 864e5;
  const week = history.filter((h) => new Date(h.at).getTime() >= since).map((h) => h[key]);
  const series = week.length >= 2 ? week : history.map((h) => h[key]);
  const first = series[0];
  const last = series[series.length - 1];
  const pct = first ? ((last - first) / Math.abs(first)) * 100 : null;
  return { series, pct };
}

/**
 * P&L of the latest session (ET): qty held at each snapshot × price move to the next, from the
 * last snapshot before today onward — so buys/sells/deposits don't count as gains, but the
 * overnight gap at the open does.
 */
function today(h: PositionHistory) {
  const n = h.at.length;
  if (n < 2) return null;
  const from = prevCloseIndex(h.at);
  const pnl = flowAdjustedPnl(h, from);
  const base = h.total[from];
  const series = h.total.slice(from);
  return { pnl, pct: base ? (pnl / base) * 100 : null, series };
}

const tone = (n: number) => (n >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]");

/** Sum of this calendar month's daily P&L (ET dates), with its running total for the sparkline. */
function thisMonth(daily: DailyPnl[]) {
  const last = daily[daily.length - 1]?.day ?? "";
  const days = daily.filter((d) => d.day.slice(0, 7) === last.slice(0, 7));
  const series: number[] = [];
  for (const d of days) series.push((series[series.length - 1] ?? 0) + d.pnl);
  const total = series[series.length - 1] ?? 0;
  const base = days[0]?.startValue;
  return {
    total,
    series: [0, ...series],
    pct: base ? (total / base) * 100 : null,
    green: days.filter((d) => d.pnl > 0).length,
    days: days.length,
  };
}

function StatCard({
  label,
  value,
  color,
  icon,
  trend,
}: {
  label: string;
  value: string;
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

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [latestRes, historyRes, posHistoryRes, dailyRes, refsRes] = await Promise.all([
    backend("/api/v1/latest"),
    backend("/api/v1/history"),
    backend("/api/v1/history/positions"),
    backend("/api/v1/history/daily"),
    backend("/api/v1/history/references"),
  ]);
  if (!latestRes.ok) {
    return (
      <>
        <main className="flex flex-1 items-center justify-center">
          <p className="text-[var(--danger)]">
            Could not load portfolio (backend returned {latestRes.status}).
          </p>
        </main>
      </>
    );
  }
  const { at, balance, positions, pnl }: Latest = await latestRes.json();
  const history: Snapshot[] = historyRes.ok ? await historyRes.json() : [];
  const posHistory: PositionHistory = posHistoryRes.ok
    ? await posHistoryRes.json()
    : { at: [], total: [], cash: [], symbols: {} };
  const day = today(posHistory);
  const daily: DailyPnl[] = dailyRes.ok ? await dailyRes.json() : [];
  const month = thisMonth(daily);
  // Unrealized: current value minus cost basis, for every position with a known avg cost.
  const all = [...positions.equities, ...positions.crypto].filter((p) => p.avgCost);
  const invested = all.reduce((s, p) => s + p.avgCost! * p.quantity, 0);
  const unrealized = all.reduce((s, p) => s + p.value, 0) - invested;
  const references = refsRes.ok ? await refsRes.json() : undefined;
  const totalCash = balance.accounts.reduce((s, a) => s + a.cash, 0);

  return (
    <>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi, {session.user.name.split(" ")[0] || "there"} 👋
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Here&apos;s your portfolio today · Last pull {ago(at)}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total value" value={money(balance.total)} icon={<Wallet size={15} />} trend={weekly(history, "totalValue")} />
          <StatCard
            label="Total return"
            value={signed(unrealized)}
            color={tone(unrealized)}
            icon={<TrendingUp size={15} />}
            trend={{ series: [], pct: invested ? (unrealized / invested) * 100 : null, caption: "on what you put in" }}
          />
          <StatCard
            label="This month"
            value={signed(month.total)}
            color={tone(month.total)}
            icon={<CalendarDays size={15} />}
            trend={{ series: month.series, pct: month.pct, caption: `${month.green}/${month.days} green days` }}
          />
          <StatCard label="Invested" value={money(invested)} icon={<PiggyBank size={15} />} />
        </div>

        <div className="mt-4">
          <PortfolioExplorer
            history={posHistory}
            aside={
              <div className="flex h-full flex-col gap-4">
                <Card title="Allocation" className="flex-1">
                  <AllocationChart equities={positions.equities} crypto={positions.crypto} cash={totalCash} />
                </Card>
              {day && (
                <StatCard
                  label="Today"
                  value={signed(day.pnl)}
                  color={day.pnl >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}
                  icon={<CalendarClock size={15} />}
                  trend={{ series: day.series, pct: day.pct, caption: "since last close" }}
                />
              )}
              </div>
            }
          />
        </div>

        <div className="mt-4">
          <Card title="Daily P&L">
            <DailyPnlChart days={daily} />
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card title="Accounts" className="lg:col-span-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm">
                <span className="text-[var(--muted)]">Cash</span>
                <span className="font-figures font-mono">{money(totalCash)}</span>
              </div>
              {pnl && (
                <div className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm">
                  <span className="text-[var(--muted)]">Realized P&amp;L (1y)</span>
                  <span className={`font-figures font-mono ${tone(pnl.total)}`}>{signed(pnl.total)}</span>
                </div>
              )}
              {balance.accounts.map((acc, i) => (
                <div key={i} className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm last:border-0">
                  <span className="text-[var(--muted)]">{acc.nickname ?? acc.type}</span>
                  <span className="font-figures font-mono">{money(acc.totalValue)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Top movers" className="lg:col-span-8">
            <TopMoversChart equities={positions.equities} crypto={positions.crypto} />
          </Card>
        </div>

        <div className="mt-4">
          <Card title="Concentration">
            <ConcentrationChart equities={positions.equities} crypto={positions.crypto} cash={totalCash} />
          </Card>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <Card title="Stocks & ETFs">
            <PositionsTable rows={positions.equities} history={posHistory} references={references} enrichable />
          </Card>
          <Card title="Crypto">
            <PositionsTable rows={positions.crypto} history={posHistory} references={references} />
          </Card>
        </div>
      </main>
    </>
  );
}
