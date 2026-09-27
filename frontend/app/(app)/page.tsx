import { headers } from "next/headers";
import { viewerTz } from "@/lib/tz";
import { Wallet, TrendingUp, CalendarDays, PiggyBank } from "lucide-react";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { PortfolioExplorer, type PositionHistory } from "@/components/PortfolioExplorer";
import { PositionsTable } from "@/components/PositionsTable";
import { DailyPnlChart, type DailyPnl } from "@/components/DailyPnlChart";
import { AllocationChart, TopMoversChart } from "@/components/AnalysisCharts";
import { auth } from "@/lib/auth";
import { prevCloseIndex, robinhoodToday } from "@/lib/history";
import { backend } from "@/lib/backend";
import { LivePricesProvider, LiveToday, LiveTotal } from "@/components/LivePrices";
import { StatCard } from "@/components/StatCard";


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

/**
 * Last 7 days' market gain from the stored daily P&L (so deposits don't count), as % of the
 * value at the start of the window. Sparkline = raw value, which is fine for shape.
 */
function weekly(history: Snapshot[], daily: DailyPnl[]) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const days = daily.filter((d) => d.day > since);
  const gain = days.reduce((s, d) => s + d.pnl, 0);
  const base = days[0]?.startValue;
  const cutoff = Date.now() - 7 * 864e5;
  const series = history.filter((h) => new Date(h.at).getTime() >= cutoff).map((h) => h.totalValue);
  return { series, pct: base ? (gain / base) * 100 : null };
}

/** Today's return per Robinhood's rules (see robinhoodToday), plus the value path since the last close. */
function today(h: PositionHistory, tz: string) {
  if (h.at.length < 2) return null;
  const from = prevCloseIndex(h.at);
  return { ...robinhoodToday(h, tz), series: h.total.slice(from) };
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
  const tz = await viewerTz();
  const day = today(posHistory, tz);
  const daily: DailyPnl[] = dailyRes.ok ? await dailyRes.json() : [];
  const month = thisMonth(daily);
  // Unrealized: current value minus cost basis, for every position with a known avg cost.
  const all = [...positions.equities, ...positions.crypto].filter((p) => p.avgCost);
  const invested = all.reduce((s, p) => s + p.avgCost! * p.quantity, 0);
  const unrealized = all.reduce((s, p) => s + p.value, 0) - invested;
  const references = refsRes.ok ? await refsRes.json() : undefined;
  const totalCash = balance.accounts.reduce((s, a) => s + a.cash, 0);

  return (
    <LivePricesProvider>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi, {session.user.name.split(" ")[0] || "there"} 👋
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Here&apos;s your portfolio today · Last pull {ago(at)}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total value"
            value={<LiveTotal total={balance.total} positions={[...positions.equities, ...positions.crypto]} />}
            icon={<Wallet size={15} />}
            trend={weekly(history, daily)}
          />
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
            tz={tz}
            aside={
              <div className="flex h-full flex-col gap-4">
                <Card title="Allocation" className="flex-1">
                  <AllocationChart equities={positions.equities} crypto={positions.crypto} cash={totalCash} />
                </Card>
              {day && (
                <LiveToday
                  day={day}
                  base={posHistory.total[prevCloseIndex(posHistory.at)]}
                  equities={positions.equities}
                  crypto={positions.crypto}
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


        <div className="mt-4 flex flex-col gap-4">
          <Card title="Stocks & ETFs">
            <PositionsTable rows={positions.equities} history={posHistory} references={references} tz={tz} enrichable />
          </Card>
          <Card title="Crypto">
            <PositionsTable rows={positions.crypto} history={posHistory} references={references} tz={tz} />
          </Card>
        </div>
      </main>
    </LivePricesProvider>
  );
}
