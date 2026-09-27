"use client";

import { useState } from "react";

export type DiscoverItem = {
  symbol: string;
  name: string;
  logo: string | null;
  industry: string | null;
  newIndustry: boolean;
  peerOf: string[];
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  pe: number | null;
  revenueGrowth: number | null;
  netMargin: number | null;
  return52w: number | null;
  fromHigh: number | null;
  analysts: { total: number; buyPct: number; strongBuy: number; buy: number; hold: number; sell: number } | null;
  lastSurprisePct: number | null;
  score: number;
};

type Key = "score" | "analysts" | "revenueGrowth" | "netMargin" | "pe" | "return52w";
const COLUMNS: { key: Key; label: string; title: string }[] = [
  { key: "score", label: "Score", title: "Blend of analyst conviction, growth, margin and ties to your holdings" },
  { key: "analysts", label: "Analysts", title: "Share of analysts rating Buy or Strong buy" },
  { key: "revenueGrowth", label: "Rev. growth", title: "Revenue growth, trailing 12 months vs the year before" },
  { key: "netMargin", label: "Net margin", title: "Net profit margin, trailing 12 months" },
  { key: "pe", label: "P/E", title: "Price / earnings, trailing 12 months (lower is cheaper)" },
  { key: "return52w", label: "52w", title: "Price return over the last 52 weeks" },
];

const valueOf = (i: DiscoverItem, k: Key) => (k === "analysts" ? (i.analysts?.buyPct ?? null) : i[k]);
const pct = (n: number | null, signed = false) =>
  n === null ? "—" : `${signed && n > 0 ? "+" : ""}${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`;
const tone = (n: number | null) => (n === null ? "" : n >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]");
const cap = (m: number | null) => (m === null ? null : m >= 1e6 ? `$${(m / 1e6).toFixed(1)}T` : m >= 1e3 ? `$${(m / 1e3).toFixed(0)}B` : `$${m.toFixed(0)}M`);

/** Buy / hold / sell as one stacked bar, same language as the symbol modal's ratings bar. */
function AnalystBar({ a }: { a: NonNullable<DiscoverItem["analysts"]> }) {
  const parts = [
    { n: a.strongBuy + a.buy, color: "var(--success)" },
    { n: a.hold, color: "var(--muted)" },
    { n: a.sell, color: "var(--danger)" },
  ].filter((p) => p.n > 0);
  return (
    <div className="flex items-center justify-end gap-2" title={`${a.strongBuy + a.buy} buy · ${a.hold} hold · ${a.sell} sell`}>
      <span className="flex h-1.5 w-14 gap-px overflow-hidden rounded-sm">
        {parts.map((p, i) => (
          <span key={i} style={{ width: `${(p.n / a.total) * 100}%`, background: p.color }} />
        ))}
      </span>
      <span className="font-figures w-9 text-right font-mono">{Math.round(a.buyPct * 100)}%</span>
    </div>
  );
}

export function DiscoverTable({ items }: { items: DiscoverItem[] }) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "score", desc: true });
  const [onlyNew, setOnlyNew] = useState(false);

  const rows = items
    .filter((i) => !onlyNew || i.newIndustry)
    .sort((a, b) => {
      const x = valueOf(a, sort.key);
      const y = valueOf(b, sort.key);
      if (x === null) return 1; // missing data always sinks
      if (y === null) return -1;
      return sort.desc ? y - x : x - y;
    });

  return (
    <>
      <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--secondary-foreground)]">
        <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
        Only industries I don&apos;t hold yet
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)]">
              <th className="pb-2 font-normal">Company</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="pb-2 text-right font-normal" title={c.title}>
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.key !== "pe" }))}
                    className={`hover:text-[var(--foreground)] ${sort.key === c.key ? "text-[var(--foreground)]" : ""}`}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
              <th className="pb-2 text-right font-normal">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.symbol} className="border-t border-[var(--border)] align-middle">
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2.5">
                    {i.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- tiny third-party logos, not worth next/image remotePatterns
                      <img src={i.logo} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded bg-white object-contain" loading="lazy" />
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded bg-[var(--surface-secondary)]" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate">
                        <a
                          href={`https://robinhood.com/stocks/${i.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                        >
                          {i.symbol}
                        </a>{" "}
                        <span className="text-[var(--muted)]">{i.name}</span>
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        Peer of {i.peerOf.join(", ")}
                        {i.industry && ` · ${i.industry}`}
                        {cap(i.marketCap) && ` · ${cap(i.marketCap)}`}
                        {i.newIndustry && (
                          <span className="ml-1.5 rounded bg-[var(--accent-soft)] px-1 py-px text-[10px] text-[var(--accent)]">
                            New industry
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="font-figures py-2.5 text-right font-mono font-semibold">{i.score}</td>
                <td className="py-2.5 text-right text-xs">
                  {i.analysts ? <AnalystBar a={i.analysts} /> : <span className="text-[var(--muted)]">—</span>}
                </td>
                <td className={`font-figures py-2.5 text-right font-mono ${tone(i.revenueGrowth)}`}>{pct(i.revenueGrowth, true)}</td>
                <td className={`font-figures py-2.5 text-right font-mono ${tone(i.netMargin)}`}>{pct(i.netMargin)}</td>
                <td className="font-figures py-2.5 text-right font-mono">{i.pe === null || i.pe <= 0 ? "—" : i.pe.toFixed(1)}</td>
                <td className={`font-figures py-2.5 text-right font-mono ${tone(i.return52w)}`}>{pct(i.return52w, true)}</td>
                <td className="py-2.5 pl-3 text-right">
                  <p className="font-figures font-mono">{i.price === null ? "—" : `$${i.price.toFixed(2)}`}</p>
                  <p className={`font-figures font-mono text-xs ${tone(i.changePct)}`}>{pct(i.changePct, true)}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="mt-4 text-sm text-[var(--muted)]">Nothing matches.</p>}
    </>
  );
}
