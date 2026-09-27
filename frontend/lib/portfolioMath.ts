/**
 * Client-side portfolio risk math for the Risk page's trade simulator. Mirrors the backend's
 * computeRisk on the same inputs (last year's aligned daily total returns per holding), so with no
 * trades it reproduces the page's numbers and every trade is a pure recomputation — no round trip.
 */

export type SimHolding = {
  symbol: string;
  type: "equity" | "crypto";
  sector: string | null;
  value: number;
  returns: number[];
};

export type Trade = { side: "buy" | "sell"; symbol: string; amount: number };

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const cov = (a: number[], b: number[]) => {
  const ma = mean(a);
  const mb = mean(b);
  return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (a.length - 1);
};

/**
 * Applies trades to the holdings. Sells go to cash; buys are paid from cash (existing + sale proceeds)
 * first and only the rest is new money. `extra` supplies returns/sector for symbols not held yet.
 */
export function applyTrades(
  holdings: SimHolding[],
  cash: number,
  trades: Trade[],
  extra: Record<string, { sector: string | null; returns: number[] }>
) {
  const next = new Map(holdings.map((h) => [h.symbol, { ...h }]));
  let proceeds = 0;
  let buys = 0;
  for (const t of trades) {
    const amount = Math.max(0, t.amount || 0);
    const h = next.get(t.symbol);
    if (t.side === "sell") {
      if (!h) continue;
      const sold = Math.min(amount, h.value);
      h.value -= sold;
      proceeds += sold;
    } else {
      if (h) h.value += amount;
      else if (extra[t.symbol]) next.set(t.symbol, { symbol: t.symbol, type: "equity", ...extra[t.symbol], value: amount });
      else continue;
      buys += amount;
    }
  }
  const available = cash + proceeds;
  return {
    holdings: [...next.values()].filter((h) => h.value > 0.5),
    cash: Math.max(0, available - buys),
    proceeds,
    newMoney: Math.max(0, buys - available),
  };
}

/** Everything the simulator compares: beta, volatility, historical VaR/CVaR, drawdown, concentration, risk shares. */
export function portfolioMetrics(holdings: SimHolding[], cash: number, market: number[]) {
  const total = holdings.reduce((s, h) => s + h.value, 0) + cash;
  const n = market.length;
  const w = holdings.map((h) => (total ? h.value / total : 0));
  const port = Array.from({ length: n }, (_, d) => holdings.reduce((s, h, i) => s + w[i] * (h.returns[d] ?? 0), 0));
  const varM = cov(market, market);
  const varP = cov(port, port);
  const sigma = Math.sqrt(varP);

  const sorted = [...port].sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(n * 0.05));
  let level = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const r of port) {
    level *= 1 + r;
    peak = Math.max(peak, level);
    maxDrawdown = Math.min(maxDrawdown, level / peak - 1);
  }

  const rows = holdings
    .map((h, i) => ({
      symbol: h.symbol,
      weightPct: w[i] * 100,
      riskPct: varP ? ((w[i] * cov(h.returns, port)) / varP) * 100 : 0,
    }))
    .sort((a, b) => b.riskPct - a.riskPct);
  const byWeight = [...rows].sort((a, b) => b.weightPct - a.weightPct);

  const sectors = new Map<string, number>();
  holdings.forEach((h) => {
    const key = h.type === "crypto" ? "Crypto" : (h.sector ?? "Other");
    sectors.set(key, (sectors.get(key) ?? 0) + h.value);
  });
  if (cash > 0) sectors.set("Cash", cash);

  return {
    total,
    beta: varM ? cov(port, market) / varM : 0,
    volatilityPct: sigma * Math.sqrt(252) * 100,
    var95: -sorted[k - 1] * total,
    cvar95: -mean(sorted.slice(0, k)) * total,
    maxDrawdownPct: maxDrawdown * 100,
    largest: byWeight[0] ?? null,
    effectivePositions: 1 / w.reduce((s, x) => s + x * x, 0) || 0,
    top2RiskPct: rows.slice(0, 2).reduce((s, r) => s + r.riskPct, 0),
    risk: rows,
    sectors: Object.fromEntries([...sectors].map(([k2, v]) => [k2, (v / total) * 100])),
  };
}
