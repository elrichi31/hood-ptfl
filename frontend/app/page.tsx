import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Wallet, Banknote, TrendingUp, Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import { PortfolioExplorer, type PositionHistory } from "@/components/PortfolioExplorer";
import { PositionsTable } from "@/components/PositionsTable";
import { AllocationChart, TopMoversChart, ConcentrationChart } from "@/components/AnalysisCharts";
import { auth } from "@/lib/auth";
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
type Order = {
  type: "equity" | "crypto";
  symbol: string;
  side: string;
  quantity: number;
  price: number | null;
  state: string;
  createdAt: string;
};
type Latest = { at: string; balance: Balance; positions: Positions; pnl: Pnl | null; orders: Order[] };

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
// "hace 3 minutos" — relative, so it's right regardless of the server's timezone.
function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
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
  trend?: { series: number[]; pct: number | null };
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
              vs last week
            </p>
          )}
        </div>
        {trend && <Sparkline values={trend.series} up={up} />}
      </div>
    </Card>
  );
}

function OrdersTable({ orders }: { orders: Order[] }) {
  if (!orders.length) return null;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="py-2 pr-3 text-left text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              Date
            </th>
            <th className="py-2 px-3 text-left text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              Symbol
            </th>
            <th className="py-2 px-3 text-left text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              Side
            </th>
            <th className="py-2 px-3 text-right text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              Qty
            </th>
            <th className="py-2 px-3 text-right text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              Price
            </th>
            <th className="py-2 pl-3 text-left text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              State
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => (
            <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
              <td className="py-2 pr-3 text-[var(--muted)]">
                {new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
              <td className="py-2 px-3 font-medium">{o.symbol}</td>
              <td
                className={`py-2 px-3 capitalize ${o.side === "buy" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
              >
                {o.side}
              </td>
              <td className="font-figures py-2 px-3 text-right font-mono text-[var(--muted)]">
                {o.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}
              </td>
              <td className="font-figures py-2 px-3 text-right font-mono text-[var(--muted)]">
                {o.price ? money(o.price) : "—"}
              </td>
              <td className="py-2 pl-3 text-[var(--muted)] capitalize">{o.state.replace(/_/g, " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [latestRes, historyRes, posHistoryRes] = await Promise.all([
    backend("/api/v1/latest"),
    backend("/api/v1/history"),
    backend("/api/v1/history/positions"),
  ]);
  if (!latestRes.ok) {
    return (
      <AppShell name={session.user.name} email={session.user.email}>
        <main className="flex flex-1 items-center justify-center">
          <p className="text-[var(--danger)]">
            Could not load portfolio (backend returned {latestRes.status}).
          </p>
        </main>
      </AppShell>
    );
  }
  const { at, balance, positions, pnl, orders }: Latest = await latestRes.json();
  const history: Snapshot[] = historyRes.ok ? await historyRes.json() : [];
  const posHistory: PositionHistory = posHistoryRes.ok
    ? await posHistoryRes.json()
    : { at: [], total: [], cash: [], symbols: {} };
  const totalCash = balance.accounts.reduce((s, a) => s + a.cash, 0);

  return (
    <AppShell name={session.user.name} email={session.user.email}>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {session.user.name.split(" ")[0] || "de nuevo"} 👋
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Así va tu portafolio hoy · Último pull {ago(at)}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total value" value={money(balance.total)} icon={<Wallet size={15} />} trend={weekly(history, "totalValue")} />
          <StatCard label="Cash" value={money(totalCash)} icon={<Banknote size={15} />} trend={weekly(history, "cash")} />
          {pnl && (
            <StatCard
              label="Realized P&L (1y)"
              value={signed(pnl.total)}
              color={pnl.total >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}
              icon={<TrendingUp size={15} />}
            />
          )}
          <StatCard label="Accounts" value={`${balance.accounts.length} connected`} icon={<Building2 size={15} />} />
        </div>

        <div className="mt-4">
          <PortfolioExplorer
            history={posHistory}
            aside={
              <Card title="Allocation" className="h-full">
                <AllocationChart equities={positions.equities} crypto={positions.crypto} cash={totalCash} />
              </Card>
            }
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card title="Accounts" className="lg:col-span-4">
            <div className="flex flex-col gap-2">
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
            <PositionsTable rows={positions.equities} enrichable />
          </Card>
          <Card title="Crypto">
            <PositionsTable rows={positions.crypto} />
          </Card>
          <Card title="Recent orders">
            <OrdersTable orders={orders} />
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
