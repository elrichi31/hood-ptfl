"use client";

import { useMemo, useState } from "react";
import { applyTrades, portfolioMetrics, type SimHolding, type Trade } from "@/lib/portfolioMath";
import { TickerLogo } from "@/components/TickerLogo";

type Extra = Record<string, { sector: string | null; returns: number[] }>;

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const SYMBOL = /^[A-Z.]{1,6}$/;

/**
 * "Buy $100 of SPY / sell $175 of AMD" → how beta, volatility, VaR/CVaR, drawdown, concentration and
 * risk shares would change, recomputed in the browser from last year's daily returns (see portfolioMath).
 */
export function RiskSimulator({ holdings, cash, market }: { holdings: SimHolding[]; cash: number; market: number[] }) {
  const top = [...holdings].sort((a, b) => b.value - a.value);
  const [trades, setTrades] = useState<Trade[]>([{ side: "buy", symbol: "", amount: 100 }]);
  const [extra, setExtra] = useState<Extra>({});
  const [lookup, setLookup] = useState<Record<string, "loading" | string>>({});
  const held = new Set(holdings.map((h) => h.symbol));
  const cryptoSymbols = new Set(holdings.filter((h) => h.type === "crypto").map((h) => h.symbol));

  const before = useMemo(() => portfolioMetrics(holdings, cash, market), [holdings, cash, market]);
  const sim = useMemo(() => applyTrades(holdings, cash, trades, extra), [holdings, cash, trades, extra]);
  const after = useMemo(() => portfolioMetrics(sim.holdings, sim.cash, market), [sim, market]);
  const active = trades.some((t) => t.symbol && t.amount > 0 && (held.has(t.symbol) || extra[t.symbol]));

  const update = (i: number, patch: Partial<Trade>) => setTrades((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  // A symbol you don't hold needs its own year of returns — fetched once per symbol.
  async function resolve(symbol: string) {
    if (!SYMBOL.test(symbol) || held.has(symbol) || extra[symbol] || lookup[symbol] === "loading") return;
    setLookup((l) => ({ ...l, [symbol]: "loading" }));
    try {
      const res = await fetch(`/api/risk/returns/${symbol}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setExtra((e) => ({ ...e, [symbol]: { sector: body.sector, returns: body.returns } }));
      setLookup((l) => {
        const rest = { ...l };
        delete rest[symbol];
        return rest;
      });
    } catch (err) {
      setLookup((l) => ({ ...l, [symbol]: err instanceof Error ? err.message : "Lookup failed" }));
    }
  }

  const presets = [
    top.length && { label: `Trim ${before.risk[0]?.symbol} by half`, trades: [{ side: "sell" as const, symbol: before.risk[0].symbol, amount: Math.round((holdings.find((h) => h.symbol === before.risk[0].symbol)?.value ?? 0) / 2) }] },
    held.has("SPY") && { label: "Add $300 of SPY", trades: [{ side: "buy" as const, symbol: "SPY", amount: 300 }] },
    before.risk[0] &&
      held.has("SPY") && {
        label: `Swap $200 ${before.risk[0].symbol} → SPY`,
        trades: [
          { side: "sell" as const, symbol: before.risk[0].symbol, amount: 200 },
          { side: "buy" as const, symbol: "SPY", amount: 200 },
        ],
      },
  ].filter(Boolean) as { label: string; trades: Trade[] }[];

  const rows: [string, number, number, (n: number) => string, "lower" | "higher" | null][] = [
    ["Beta", before.beta, after.beta, (n) => n.toFixed(2), "lower"],
    ["Volatility (1y)", before.volatilityPct, after.volatilityPct, (n) => `${n.toFixed(1)}%`, "lower"],
    ["1-day VaR 95%", before.var95, after.var95, money, "lower"],
    ["CVaR (avg of worst 5% days)", before.cvar95, after.cvar95, money, "lower"],
    ["Max drawdown (1y)", before.maxDrawdownPct, after.maxDrawdownPct, (n) => `${n.toFixed(1)}%`, "higher"],
    ["Effective positions", before.effectivePositions, after.effectivePositions, (n) => n.toFixed(1), "higher"],
    ["Top-2 share of risk", before.top2RiskPct, after.top2RiskPct, (n) => `${n.toFixed(0)}%`, "lower"],
  ];
  const changedSectors = Object.keys({ ...before.sectors, ...after.sectors })
    .map((s) => ({ s, a: before.sectors[s] ?? 0, b: after.sectors[s] ?? 0 }))
    .filter((x) => Math.abs(x.b - x.a) >= 0.1)
    .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))
    .slice(0, 4);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setTrades(p.trades)}
            className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--secondary-foreground)] hover:bg-[var(--surface-hover)]"
          >
            {p.label}
          </button>
        ))}
      </div>

      <datalist id="sim-holdings">
        {top.map((h) => (
          <option key={h.symbol} value={h.symbol} />
        ))}
      </datalist>
      <div className="mt-3 flex flex-col gap-2">
        {trades.map((t, i) => {
          const status = t.symbol && !held.has(t.symbol) && !extra[t.symbol] ? lookup[t.symbol] : undefined;
          return (
            <div key={i}>
              <div className="flex items-center gap-2 text-sm">
                <select
                  value={t.side}
                  onChange={(e) => update(i, { side: e.target.value as Trade["side"] })}
                  aria-label="Buy or sell"
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1"
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
                <span className="flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2">
                  <span className="text-[var(--muted)]">$</span>
                  <input
                    type="number"
                    min={0}
                    step={25}
                    value={t.amount}
                    onChange={(e) => update(i, { amount: Number(e.target.value) })}
                    aria-label="Amount in dollars"
                    className="font-figures w-20 bg-transparent py-1 text-right font-mono outline-none"
                  />
                </span>
                <span className="text-[var(--muted)]">of</span>
                <input
                  list="sim-holdings"
                  value={t.symbol}
                  placeholder="SPY"
                  onChange={(e) => update(i, { symbol: e.target.value.toUpperCase().trim() })}
                  onBlur={(e) => resolve(e.target.value.toUpperCase().trim())}
                  onKeyDown={(e) => e.key === "Enter" && resolve(t.symbol)}
                  aria-label="Symbol"
                  className="w-20 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 uppercase outline-none"
                />
                {t.side === "sell" && held.has(t.symbol) && (
                  <button
                    type="button"
                    onClick={() => update(i, { amount: Math.round(holdings.find((h) => h.symbol === t.symbol)!.value) })}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    all
                  </button>
                )}
                {trades.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setTrades((ts) => ts.filter((_, j) => j !== i))}
                    aria-label="Remove trade"
                    className="ml-auto text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    ×
                  </button>
                )}
              </div>
              {status && (
                <p className={`mt-1 text-xs ${status === "loading" ? "text-[var(--muted)]" : "text-[var(--danger)]"}`}>
                  {status === "loading" ? `Loading ${t.symbol}'s last year…` : status}
                </p>
              )}
              {t.side === "sell" && t.symbol && !held.has(t.symbol) && (
                <p className="mt-1 text-xs text-[var(--danger)]">You don&apos;t hold {t.symbol}.</p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setTrades((ts) => [...ts, { side: "buy", symbol: "", amount: 100 }])}
          className="self-start text-xs text-[var(--accent)] hover:underline"
        >
          + Add trade
        </button>
      </div>

      {active && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {sim.proceeds > 0 && `Sales raise ${money(sim.proceeds)}. `}
          {sim.newMoney > 0 ? `Needs ${money(sim.newMoney)} of new money.` : "No new money needed."}
          {sim.cash > 0.5 && ` ${money(sim.cash)} stays in cash.`}
        </p>
      )}

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--muted)]">
            <th className="pb-1.5 font-normal" />
            <th className="pb-1.5 text-right font-normal">Now</th>
            <th className="pb-1.5 text-right font-normal">After</th>
          </tr>
        </thead>
        <tbody className="font-figures font-mono text-xs">
          {rows.map(([name, a, b, fmt, good]) => {
            const moved = active && Math.abs(b - a) > Math.abs(a) * 0.001;
            const better = good === null ? null : good === "lower" ? b < a : b > a;
            return (
              <tr key={name} className="border-t border-[var(--border)]">
                <td className="py-1.5 font-sans text-[var(--muted)]">{name}</td>
                <td className="py-1.5 text-right">{fmt(a)}</td>
                <td
                  className={`py-1.5 text-right ${moved && better !== null ? (better ? "text-[var(--success)]" : "text-[var(--danger)]") : ""}`}
                >
                  {active ? fmt(b) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {active && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase">Top risk sources after</p>
            {after.risk.slice(0, 5).map((r) => {
              const was = before.risk.find((x) => x.symbol === r.symbol)?.riskPct ?? 0;
              return (
                <p key={r.symbol} className="font-figures flex justify-between font-mono text-xs">
                  <span className="inline-flex items-center gap-1.5 font-sans">
                    <TickerLogo symbol={r.symbol} crypto={cryptoSymbols.has(r.symbol)} size={14} />
                    {r.symbol}
                  </span>
                  <span>
                    <span className="text-[var(--muted)]">{was.toFixed(1)}% →</span> {r.riskPct.toFixed(1)}%
                  </span>
                </p>
              );
            })}
          </div>
          {changedSectors.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase">Sector weights</p>
              {changedSectors.map(({ s, a, b }) => (
                <p key={s} className="font-figures flex justify-between gap-2 font-mono text-xs">
                  <span className="truncate font-sans">{s}</span>
                  <span className="shrink-0">
                    <span className="text-[var(--muted)]">{a.toFixed(1)}% →</span> {b.toFixed(1)}%
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-[var(--muted)]">
        Recomputed from last year&apos;s daily moves (dividends included). Buys use cash and sale proceeds first. Nothing is
        executed; this app is read-only.
      </p>
    </div>
  );
}
