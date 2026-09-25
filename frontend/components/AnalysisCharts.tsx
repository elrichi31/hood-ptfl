type Position = { symbol: string; quantity: number; avgCost: number | null; price: number; value: number };

const pct = (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const signedMoney = (n: number) => `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;

/**
 * Stocks/Crypto/Cash split: one segmented bar, then per class its value, position count, unrealized
 * return and largest holdings, plus how concentrated the portfolio is.
 */
export function AllocationChart({
  equities,
  crypto,
  cash,
}: {
  equities: Position[];
  crypto: Position[];
  cash: number;
}) {
  const cls = (label: string, color: string, rows: Position[]) => {
    const value = rows.reduce((s, p) => s + p.value, 0);
    const withCost = rows.filter((p) => p.avgCost);
    const cost = withCost.reduce((s, p) => s + p.avgCost! * p.quantity, 0);
    const gain = withCost.reduce((s, p) => s + p.value, 0) - cost;
    const top = [...rows].sort((x, y) => y.value - x.value).slice(0, 3);
    return { label, color, value, count: rows.length, gain, gainPct: cost ? (gain / cost) * 100 : null, top };
  };
  const classes = [
    cls("Stocks & ETFs", "var(--accent)", equities),
    cls("Crypto", "var(--crypto)", crypto),
    { label: "Cash", color: "var(--muted)", value: cash, count: 0, gain: 0, gainPct: null, top: [] as Position[] },
  ].filter((c) => c.value > 0);
  const total = classes.reduce((s, c) => s + c.value, 0) || 1;

  const all = [...equities, ...crypto].sort((x, y) => y.value - x.value);
  const top5 = all.slice(0, 5).reduce((s, p) => s + p.value, 0);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex h-3 w-full gap-0.5">
        {classes.map((c) => (
          <div
            key={c.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(c.value / total) * 100}%`, background: c.color }}
          />
        ))}
      </div>

      {classes.map((c) => (
        <div key={c.label}>
          <div className="flex items-baseline gap-2">
            <span className="h-2.5 w-2.5 shrink-0 self-center rounded-[2px]" style={{ background: c.color }} />
            <span className="text-sm font-medium">{c.label}</span>
            {c.count > 0 && <span className="text-xs text-[var(--muted)]">{c.count} positions</span>}
            <span className="font-figures ml-auto font-mono text-lg font-semibold">
              {((c.value / total) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="font-figures mt-0.5 flex justify-between pl-[18px] font-mono text-xs text-[var(--muted)]">
            <span>{money(c.value)}</span>
            {c.gainPct != null && (
              <span className={c.gain >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                {signedMoney(c.gain)} ({pct(c.gainPct)})
              </span>
            )}
          </div>
          {c.top.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 pl-[18px]">
              {c.top.map((p) => (
                <span key={p.symbol} className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-xs">
                  {p.symbol}{" "}
                  <span className="font-figures font-mono text-[var(--muted)]">
                    {((p.value / total) * 100).toFixed(1)}%
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3 text-xs">
        <div>
          <p className="text-[var(--muted)]">Holdings</p>
          <p className="font-figures font-mono text-base font-semibold">{all.length}</p>
        </div>
        <div>
          <p className="text-[var(--muted)]">Top 5 weight</p>
          <p className="font-figures font-mono text-base font-semibold">{((top5 / total) * 100).toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}

type Mover = { symbol: string; returnPct: number; gain: number; avgCost: number; price: number };

function MoversList({ title, rows, color }: { title: string; rows: Mover[]; color: string }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.returnPct)), 1);
  const total = rows.reduce((s, r) => s + r.gain, 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">{title}</h3>
        <span className="font-figures font-mono text-xs" style={{ color }}>
          {signedMoney(total)}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.symbol}>
            <div className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-sm font-medium">{r.symbol}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(Math.abs(r.returnPct) / max) * 100}%`, background: color }}
                />
              </div>
              <span className="font-figures w-16 shrink-0 text-right font-mono text-sm" style={{ color }}>
                {pct(r.returnPct)}
              </span>
            </div>
            <div className="font-figures mt-0.5 flex justify-between pl-[68px] font-mono text-[11px] text-[var(--muted)]">
              <span>
                {money(r.avgCost)} → {money(r.price)}
              </span>
              <span style={{ color }}>{signedMoney(r.gain)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Best and worst positions by return on cost, with the $ behind each %. */
export function TopMoversChart({ equities, crypto }: { equities: Position[]; crypto: Position[] }) {
  const withReturn: Mover[] = [...equities, ...crypto]
    .filter((p) => p.avgCost && p.avgCost > 0)
    .map((p) => ({
      symbol: p.symbol,
      returnPct: ((p.price - p.avgCost!) / p.avgCost!) * 100,
      gain: (p.price - p.avgCost!) * p.quantity,
      avgCost: p.avgCost!,
      price: p.price,
    }))
    .sort((a, b) => b.returnPct - a.returnPct);
  const gainers = withReturn.filter((p) => p.returnPct > 0).slice(0, 5);
  const losers = withReturn
    .filter((p) => p.returnPct < 0)
    .slice(-5)
    .reverse();

  if (!gainers.length && !losers.length) return null;
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <MoversList title="Gainers" rows={gainers} color="var(--success)" />
      <MoversList title="Losers" rows={losers} color="var(--danger)" />
    </div>
  );
}

/** Top 8 positions by % of total portfolio value, rest folded into "Other". */
export function ConcentrationChart({
  equities,
  crypto,
  cash,
}: {
  equities: Position[];
  crypto: Position[];
  cash: number;
}) {
  const equityValue = equities.reduce((s, p) => s + p.value, 0);
  const cryptoValue = crypto.reduce((s, p) => s + p.value, 0);
  const total = equityValue + cryptoValue + cash || 1;

  const byValue = [...equities, ...crypto].sort((a, b) => b.value - a.value);
  const top = byValue.slice(0, 8).map((p) => ({ symbol: p.symbol, sharePct: (p.value / total) * 100 }));
  const restValue = byValue.slice(8).reduce((s, p) => s + p.value, 0);
  const rows = restValue > 0 ? [...top, { symbol: "Other", sharePct: (restValue / total) * 100 }] : top;
  if (!rows.length) return null;

  const max = Math.max(...rows.map((r) => r.sharePct), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.symbol} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-sm font-medium">{r.symbol}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${(r.sharePct / max) * 100}%` }}
            />
          </div>
          <span className="font-figures w-14 shrink-0 text-right font-mono text-sm text-[var(--muted)]">
            {r.sharePct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
