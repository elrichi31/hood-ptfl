type Position = { symbol: string; quantity: number; avgCost: number | null; price: number; value: number };

const pct = (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

function MoversList({
  title,
  rows,
  color,
}: {
  title: string;
  rows: { symbol: string; returnPct: number }[];
  color: string;
}) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.returnPct)), 1);
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">{title}</h3>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.symbol} className="flex items-center gap-3">
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
        ))}
      </div>
    </div>
  );
}

/** Single segmented bar, Stocks/Crypto/Cash as % of the total portfolio. */
export function AllocationChart({
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
  const segments = [
    { label: "Stocks & ETFs", value: equityValue, color: "var(--accent)" },
    { label: "Crypto", value: cryptoValue, color: "var(--crypto)" },
    { label: "Cash", value: cash, color: "var(--muted)" },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex h-7 w-full gap-0.5">
        {segments.map((s) => (
          <div
            key={s.label}
            className="h-full first:rounded-l-[var(--radius)] last:rounded-r-[var(--radius)]"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: s.color }} />
            <span className="text-[var(--muted)]">{s.label}</span>
            <span className="font-figures ml-auto font-mono font-medium">
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Two columns, top 5 gainers / top 5 losers by return %. */
export function TopMoversChart({ equities, crypto }: { equities: Position[]; crypto: Position[] }) {
  const withReturn = [...equities, ...crypto]
    .filter((p) => p.avgCost && p.avgCost > 0)
    .map((p) => ({ symbol: p.symbol, returnPct: ((p.price - p.avgCost!) / p.avgCost!) * 100 }))
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
