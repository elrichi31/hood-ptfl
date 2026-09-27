import { Card } from "@/components/Card";
import { compactUsd, edgarForm4, type InsiderActivity } from "@/lib/insiders";

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const msprLabel = (m: number | null) =>
  m === null ? "—" : m >= 20 ? "Net buying" : m <= -20 ? "Net selling" : "Mixed";

/** Insider activity in held stocks: a per-holding net bar, then the latest open-market trades. */
export function InsiderTrades({ data }: { data: InsiderActivity }) {
  const { trades, summary } = data;
  const maxFlow = Math.max(1, ...summary.map((s) => Math.max(s.bought, s.sold)));
  const buys = trades.filter((t) => t.side === "buy").length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--muted)]">
        Open-market buys and sales by executives and directors (SEC Form 4) over the last 90 days. Most sales are
        pre-planned or for taxes; <span className="text-[var(--foreground)]">buys are rarer and the stronger signal</span>
        {buys ? ` (${buys} in your holdings).` : ", and there were none in your holdings."}
      </p>

      <Card title="By holding">
        <div className="flex flex-col gap-2.5">
          {summary.map((s) => (
            <div key={s.symbol} className="grid grid-cols-[3.5rem_1fr_1fr_6.5rem] items-center gap-3 text-sm">
              <a href={edgarForm4(s.symbol)} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                {s.symbol}
              </a>
              {/* Mirrored bars: sold grows left, bought grows right, same $ scale across holdings. */}
              <span className="flex h-2 justify-end overflow-hidden rounded-sm bg-[var(--surface-secondary)]" title={`Sold ${compactUsd(s.sold)} · ${s.sellers} sellers`}>
                <span className="h-full rounded-sm bg-[var(--danger)]" style={{ width: `${(s.sold / maxFlow) * 100}%` }} />
              </span>
              <span className="flex h-2 overflow-hidden rounded-sm bg-[var(--surface-secondary)]" title={`Bought ${compactUsd(s.bought)} · ${s.buyers} buyers`}>
                <span className="h-full rounded-sm bg-[var(--success)]" style={{ width: `${(s.bought / maxFlow) * 100}%` }} />
              </span>
              <span className="text-right text-xs text-[var(--muted)]" title="Finnhub's monthly share purchase ratio, averaged">
                {msprLabel(s.mspr)}
              </span>
              <span />
              <span className="font-figures text-right font-mono text-xs text-[var(--muted)]">{s.sold ? `−${compactUsd(s.sold)}` : ""}</span>
              <span className="font-figures font-mono text-xs text-[var(--muted)]">{s.bought ? `+${compactUsd(s.bought)}` : ""}</span>
              <span />
            </div>
          ))}
          {!summary.length && <p className="text-sm text-[var(--muted)]">No insider filings for your holdings yet.</p>}
        </div>
      </Card>

      <Card title="Latest trades">
        <div className="flex flex-col">
          {trades.slice(0, 30).map((t, i) => (
            <a
              key={i}
              href={edgarForm4(t.symbol)}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-baseline gap-3 border-b border-[var(--border)] py-2.5 text-sm last:border-0 hover:text-[var(--accent)] ${t.side === "buy" ? "font-medium" : ""}`}
            >
              <span className="w-14 shrink-0 font-medium">{t.symbol}</span>
              <span className={`w-9 shrink-0 text-xs ${t.side === "buy" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                {t.side === "buy" ? "Buy" : "Sell"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {t.name}
                <span className="text-[var(--muted)]">
                  {" "}
                  · {t.shares.toLocaleString("en-US")} sh @ ${t.avgPrice.toFixed(2)}
                  {t.pctOfStake != null && ` · ${t.pctOfStake.toFixed(t.pctOfStake < 10 ? 1 : 0)}% of stake`}
                </span>
              </span>
              <span className="font-figures shrink-0 font-mono">{compactUsd(t.value)}</span>
              <span className="w-12 shrink-0 text-right text-xs text-[var(--muted)]">{shortDate(t.date)}</span>
            </a>
          ))}
          {!trades.length && <p className="text-sm text-[var(--muted)]">No open-market insider trades in the last 90 days.</p>}
        </div>
      </Card>
    </div>
  );
}
