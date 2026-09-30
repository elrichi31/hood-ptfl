import { headers } from "next/headers";
import { viewerTz } from "@/lib/tz";
import { Wallet, TrendingUp, CalendarDays, PiggyBank } from "lucide-react";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import {
  PortfolioExplorer,
  type PositionHistory,
} from "@/components/PortfolioExplorer";
import { PositionsTable } from "@/components/PositionsTable";
import { DailyPnlChart, type DailyPnl } from "@/components/DailyPnlChart";
import { AllocationChart, TopMoversChart } from "@/components/AnalysisCharts";
import { auth } from "@/lib/auth";
import { prevCloseIndex, robinhoodToday } from "@/lib/history";
import { backend } from "@/lib/backend";
import {
  LivePricesProvider,
  LiveToday,
  LiveTotal,
  LiveQuoteStatus,
} from "@/components/LivePrices";
import { DashboardRetry } from "@/components/DashboardRetry";
import { StatCard } from "@/components/StatCard";

type Balance = {
  total: number;
  accounts: {
    type: string;
    nickname: string | null;
    totalValue: number;
    cash: number;
  }[];
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
type Latest = {
  at: string;
  balance: Balance;
  positions: Positions;
  pnl: Pnl | null;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
// "3 minutes ago" — relative, so it's right regardless of the server's timezone.
function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return min < 60
    ? rtf.format(-min, "minute")
    : rtf.format(-Math.round(min / 60), "hour");
}
const signed = (n: number) =>
  n >= 0 ? `+${money(n)}` : `-${money(Math.abs(n))}`;

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
  const series = history
    .filter((h) => new Date(h.at).getTime() >= cutoff)
    .map((h) => h.totalValue);
  return { series, pct: base ? (gain / base) * 100 : null };
}

/** Today's return per Robinhood's rules (see robinhoodToday), plus the value path since the last close. */
function today(h: PositionHistory, tz: string) {
  if (h.at.length < 2) return null;
  const from = prevCloseIndex(h.at);
  return { ...robinhoodToday(h, tz), series: h.total.slice(from) };
}

const tone = (n: number) =>
  n >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]";

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

type Result<T> = { data: T | null; error: string | null };
const validDate = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const nullableNumber = (value: unknown) =>
  value === null || Number.isFinite(value);
const validPositions = (rows: Position[]) =>
  Array.isArray(rows) &&
  rows.every(
    (p) =>
      typeof p.symbol === "string" &&
      Number.isFinite(p.quantity) &&
      Number.isFinite(p.price) &&
      Number.isFinite(p.value) &&
      nullableNumber(p.avgCost),
  );

// Each request handles HTTP, transport, timeout and JSON failures independently.
async function load<T>(
  path: string,
  valid: (data: T) => boolean,
): Promise<Result<T>> {
  try {
    const response = await backend(path);
    if (!response.ok)
      return { data: null, error: `Service returned HTTP ${response.status}.` };
    const data = await response.json();
    if (data == null || !valid(data))
      return {
        data: null,
        error: "Service returned invalid data. Please retry.",
      };
    return { data, error: null };
  } catch (error) {
    const timeout =
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name);
    return {
      data: null,
      error: timeout
        ? "The service took too long to respond."
        : "Could not load data. Please retry.",
    };
  }
}

function SectionError({ message }: { message: string }) {
  return (
    <p role="alert" className="py-3 text-sm text-[var(--danger)]">
      {message}
    </p>
  );
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [
    latestResult,
    historyResult,
    positionsResult,
    dailyResult,
    referencesResult,
  ] = await Promise.all([
    load<Latest>(
      "/api/v1/latest",
      (d) =>
        validDate(d.at) &&
        Number.isFinite(d.balance.total) &&
        Array.isArray(d.balance.accounts) &&
        d.balance.accounts.every(
          (a) =>
            typeof a.type === "string" &&
            (a.nickname === null || typeof a.nickname === "string") &&
            Number.isFinite(a.cash) &&
            Number.isFinite(a.totalValue),
        ) &&
        validPositions(d.positions.equities) &&
        validPositions(d.positions.crypto) &&
        (d.pnl == null || Number.isFinite(d.pnl.total)),
    ),
    load<Snapshot[]>(
      "/api/v1/history",
      (d) =>
        Array.isArray(d) &&
        d.every(
          (s) =>
            validDate(s.at) &&
            Number.isFinite(s.totalValue) &&
            Number.isFinite(s.cash),
        ),
    ),
    load<PositionHistory>(
      "/api/v1/history/positions",
      (d) =>
        Array.isArray(d.at) &&
        d.at.every(validDate) &&
        Array.isArray(d.total) &&
        d.total.length === d.at.length &&
        d.total.every(Number.isFinite) &&
        Array.isArray(d.cash) &&
        d.cash.length === d.at.length &&
        d.cash.every(Number.isFinite) &&
        !!d.symbols &&
        typeof d.symbols === "object" &&
        !Array.isArray(d.symbols) &&
        Object.values(d.symbols).every(
          (s) =>
            typeof s.type === "string" &&
            Array.isArray(s.qty) &&
            s.qty.length === d.at.length &&
            s.qty.every(nullableNumber) &&
            Array.isArray(s.price) &&
            s.price.length === d.at.length &&
            s.price.every(nullableNumber),
        ),
    ),
    load<DailyPnl[]>(
      "/api/v1/history/daily",
      (d) =>
        Array.isArray(d) &&
        d.every(
          (s) =>
            validDate(s.day) &&
            Number.isFinite(s.pnl) &&
            Number.isFinite(s.startValue) &&
            Number.isFinite(s.endValue) &&
            nullableNumber(s.pct),
        ),
    ),
    load<Record<string, Record<string, number>>>(
      "/api/v1/history/references",
      (d) =>
        typeof d === "object" &&
        !Array.isArray(d) &&
        Object.values(d).every(
          (s) =>
            s &&
            typeof s === "object" &&
            !Array.isArray(s) &&
            Object.values(s).every(Number.isFinite),
        ),
    ),
  ]);
  const latest = latestResult.data;
  const history = historyResult.data;
  const posHistory = positionsResult.data;
  const daily = dailyResult.data;
  const tz = await viewerTz();
  const day = posHistory ? today(posHistory, tz) : null;
  const month = daily ? thisMonth(daily) : null;
  const positions = latest?.positions;
  const balance = latest?.balance;
  const all = positions
    ? [...positions.equities, ...positions.crypto].filter((p) => p.avgCost)
    : [];
  const invested = all.reduce((s, p) => s + p.avgCost! * p.quantity, 0);
  const unrealized = all.reduce((s, p) => s + p.value, 0) - invested;
  const totalCash = balance?.accounts.reduce((s, a) => s + a.cash, 0);
  const failed = [
    latestResult,
    historyResult,
    positionsResult,
    dailyResult,
    referencesResult,
  ].some((r) => r.error);
  const portfolioError = latestResult.error ?? "Portfolio data unavailable.";
  const historyError =
    positionsResult.error ?? "Portfolio history unavailable.";
  const dailyError = dailyResult.error ?? "Daily returns unavailable.";

  const allocation = (
    <div className="flex h-full flex-col gap-4">
      <Card title="Allocation" className="flex-1">
        {positions && totalCash != null ? (
          <AllocationChart
            equities={positions.equities}
            crypto={positions.crypto}
            cash={totalCash}
          />
        ) : (
          <SectionError message={portfolioError} />
        )}
      </Card>
      {day && posHistory && positions && (
        <LiveToday
          day={day}
          base={posHistory.total[prevCloseIndex(posHistory.at)]}
          equities={positions.equities}
          crypto={positions.crypto}
        />
      )}
    </div>
  );

  return (
    <LivePricesProvider snapshotAt={latest?.at}>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi, {session.user.name.split(" ")[0] || "there"} 👋
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Here&apos;s your portfolio today
          {latest ? ` · Last pull ${ago(latest.at)}` : ""}
        </p>
        <LiveQuoteStatus />
        {failed && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3">
            <p className="text-sm text-[var(--muted)]">
              Some sections could not load. Available data is still shown.
            </p>
            <DashboardRetry />
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {balance && positions ? (
            <StatCard
              label="Total value"
              value={
                <LiveTotal
                  total={balance.total}
                  positions={[...positions.equities, ...positions.crypto]}
                />
              }
              icon={<Wallet size={15} />}
              trend={history && daily ? weekly(history, daily) : undefined}
            />
          ) : (
            <Card title="Total value">
              <SectionError message={portfolioError} />
            </Card>
          )}
          {positions ? (
            <StatCard
              label="Total return"
              value={signed(unrealized)}
              color={tone(unrealized)}
              icon={<TrendingUp size={15} />}
              trend={{
                series: [],
                pct: invested ? (unrealized / invested) * 100 : null,
                caption: "on what you put in",
              }}
            />
          ) : (
            <Card title="Total return">
              <SectionError message={portfolioError} />
            </Card>
          )}
          {month ? (
            <StatCard
              label="This month"
              value={signed(month.total)}
              color={tone(month.total)}
              icon={<CalendarDays size={15} />}
              trend={{
                series: month.series,
                pct: month.pct,
                caption: `${month.green}/${month.days} green days`,
              }}
            />
          ) : (
            <Card title="This month">
              <SectionError message={dailyError} />
            </Card>
          )}
          {positions ? (
            <StatCard
              label="Invested"
              value={money(invested)}
              icon={<PiggyBank size={15} />}
            />
          ) : (
            <Card title="Invested">
              <SectionError message={portfolioError} />
            </Card>
          )}
        </div>
        {(historyResult.error || dailyResult.error) && (
          <p role="alert" className="mt-2 text-xs text-[var(--muted)]">
            Weekly trend unavailable: {historyResult.error ?? dailyResult.error}
          </p>
        )}

        <div className="mt-4">
          {posHistory ? (
            <PortfolioExplorer
              history={posHistory}
              tz={tz}
              aside={allocation}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Portfolio" className="lg:col-span-2">
                <SectionError message={historyError} />
              </Card>
              {allocation}
            </div>
          )}
        </div>
        <div className="mt-4">
          <Card title="Daily P&L">
            {daily ? (
              <DailyPnlChart days={daily} />
            ) : (
              <SectionError message={dailyError} />
            )}
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card title="Accounts" className="lg:col-span-4">
            {balance && latest ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm">
                  <span className="text-[var(--muted)]">Cash</span>
                  <span className="font-figures font-mono">
                    {money(totalCash!)}
                  </span>
                </div>
                {latest.pnl && (
                  <div className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm">
                    <span className="text-[var(--muted)]">
                      Realized P&amp;L (1y)
                    </span>
                    <span
                      className={`font-figures font-mono ${tone(latest.pnl.total)}`}
                    >
                      {signed(latest.pnl.total)}
                    </span>
                  </div>
                )}
                {balance.accounts.map((acc, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm last:border-0"
                  >
                    <span className="text-[var(--muted)]">
                      {acc.nickname ?? acc.type}
                    </span>
                    <span className="font-figures font-mono">
                      {money(acc.totalValue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <SectionError message={portfolioError} />
            )}
          </Card>
          <Card title="Top movers" className="lg:col-span-8">
            {positions ? (
              <TopMoversChart
                equities={positions.equities}
                crypto={positions.crypto}
              />
            ) : (
              <SectionError message={portfolioError} />
            )}
          </Card>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {(positionsResult.error || referencesResult.error) && (
            <p role="alert" className="text-sm text-[var(--muted)]">
              Position returns are partially unavailable:{" "}
              {positionsResult.error ?? referencesResult.error}
            </p>
          )}
          <Card title="Stocks & ETFs">
            {positions ? (
              <PositionsTable
                rows={positions.equities}
                history={posHistory ?? undefined}
                references={referencesResult.data ?? undefined}
                tz={tz}
                enrichable
              />
            ) : (
              <SectionError message={portfolioError} />
            )}
          </Card>
          <Card title="Crypto">
            {positions ? (
              <PositionsTable
                rows={positions.crypto}
                history={posHistory ?? undefined}
                references={referencesResult.data ?? undefined}
                tz={tz}
                crypto
              />
            ) : (
              <SectionError message={portfolioError} />
            )}
          </Card>
        </div>
      </main>
    </LivePricesProvider>
  );
}
