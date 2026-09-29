"use client";

import { Fragment, useState } from "react";
import { TickerLogo } from "@/components/TickerLogo";

export type Source = "watchlist" | "peer" | "diversifier";

export type DiscoverItem = {
  symbol: string;
  name: string;
  description: string | null;
  logo: string | null;
  kind: "stock" | "fund";
  industry: string | null;
  sector: string | null;
  newIndustry: boolean;
  sources: Source[];
  watchlists: string[];
  peerOf: string[];
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  pe: number | null;
  dividendYield: number | null;
  revenueGrowth: number | null;
  netMargin: number | null;
  return52w: number | null;
  fromHigh: number | null;
  analysts: { total: number; buyPct: number; buy: number; hold: number; sell: number } | null;
  target: { low: number; mean: number; high: number; upsidePct: number } | null;
  earnings: { quarters: number; beats: number; avgSurprisePct: number } | null;
  mspr: number | null;
  fit: { corr: number; beta: number; volatilityPct: number; sigma: number; cov: number; deltaVolAt5: number } | null;
  sectorPct: number | null;
  nextEarnings: { date: string; timing: "am" | "pm" | null; avgMovePct: number; maxMovePct: number; reports: number } | null;
  spark: number[];
  opportunity: number;
  portfolioFit: number;
  score: number;
};

export type PortfolioContext = {
  total: number;
  beta: number;
  sigma: number;
  volatilityPct: number;
  sectors: { sector: string; pct: number }[];
  spark: number[];
};

type Key = "score" | "opportunity" | "portfolioFit" | "fit" | "analysts" | "upside" | "revenueGrowth" | "pe" | "return52w";
const COLUMNS: { key: Key; label: string; title: string; asc?: boolean }[] = [
  { key: "score", label: "Score", title: "55% Opportunity + 45% Portfolio fit" },
  { key: "opportunity", label: "Opportunity", title: "The stock on its own: analyst conviction and upside (discounted when few analysts cover it), revenue growth, margin, earnings beats" },
  { key: "portfolioFit", label: "Fit", title: "Next to what you hold: how much it lowers your volatility, how crowded its sector already is in your portfolio, and its beta" },
  { key: "fit", label: "Volatility at 5%", title: "Your portfolio's annual volatility now → if this became 5% of it", asc: true },
  { key: "analysts", label: "Analysts", title: "Share of analysts rating it Buy, and how many cover it" },
  { key: "upside", label: "Upside", title: "Distance to the analysts' mean price target" },
  { key: "revenueGrowth", label: "Rev. growth", title: "Revenue growth, trailing 12 months vs the year before" },
  { key: "pe", label: "P/E", title: "Price / earnings, trailing 12 months (lower is cheaper)", asc: true },
  { key: "return52w", label: "1Y return", title: "Price return over the last year. Not part of the score: big run-ups can mean momentum or expectations already priced in" },
];
const SOURCES: { key: Source | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "watchlist", label: "Your watchlists" },
  { key: "peer", label: "Peers" },
  { key: "diversifier", label: "Diversifiers" },
];

const valueOf = (i: DiscoverItem, k: Key): number | null =>
  k === "fit"
    ? (i.fit?.deltaVolAt5 ?? null)
    : k === "analysts"
      ? (i.analysts?.buyPct ?? null)
      : k === "upside"
        ? (i.target?.upsidePct ?? null)
        : k === "pe"
          ? i.pe !== null && i.pe > 0
            ? i.pe
            : null
          : i[k];
const pct = (n: number | null, signed = false, digits = 1) =>
  n === null ? "—" : `${signed && n > 0 ? "+" : ""}${n.toFixed(Math.abs(n) >= 100 ? 0 : digits)}%`;
const tone = (n: number | null) => (n === null ? "" : n >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]");
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cap = (m: number | null) =>
  m === null ? null : m >= 1e6 ? `$${(m / 1e6).toFixed(1)}T` : m >= 1e3 ? `$${(m / 1e3).toFixed(0)}B` : `$${m.toFixed(0)}M`;
const daysUntil = (date: string) => Math.round((new Date(date + "T12:00:00").getTime() - Date.now()) / 864e5);
const SOURCE_LABEL: Record<Source, string> = { watchlist: "Watchlist", peer: "Peer", diversifier: "Diversifier" };

/** Buy / hold / sell as one stacked bar, same language as the symbol modal's ratings bar. */
function AnalystBar({ a }: { a: NonNullable<DiscoverItem["analysts"]> }) {
  const parts = [
    { n: a.buy, color: "var(--success)" },
    { n: a.hold, color: "var(--muted)" },
    { n: a.sell, color: "var(--danger)" },
  ].filter((p) => p.n > 0);
  return (
    <div className="flex items-center justify-end gap-2" title={`${a.buy} buy · ${a.hold} hold · ${a.sell} sell`}>
      <span className="flex h-1.5 w-12 gap-px overflow-hidden rounded-sm">
        {parts.map((p, i) => (
          <span key={i} style={{ width: `${(p.n / a.total) * 100}%`, background: p.color }} />
        ))}
      </span>
      <span className="font-figures w-9 text-right font-mono">{Math.round(a.buyPct * 100)}%</span>
      <span className="font-figures w-8 text-left font-mono text-[10px] text-[var(--muted)]">n={a.total}</span>
    </div>
  );
}

/** Candidate vs your portfolio over the last year, both indexed to 100. Two series → legend + end labels. */
function VersusChart({ item, portfolio }: { item: number[]; portfolio: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.min(item.length, portfolio.length);
  if (n < 2) return <p className="text-xs text-[var(--muted)]">Not enough price history.</p>;
  const a = item.slice(-n);
  const b = portfolio.slice(-n);
  const W = 320;
  const H = 120;
  const lo = Math.min(...a, ...b);
  const hi = Math.max(...a, ...b);
  const x = (i: number) => (i / (n - 1)) * (W - 44);
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (H - 12);
  const path = (s: number[]) => s.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Last year: this ${(a[n - 1] - 100).toFixed(0)}%, your portfolio ${(b[n - 1] - 100).toFixed(0)}%`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round((((e.clientX - r.left) / r.width) * W * (n - 1)) / (W - 44));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={0} x2={W - 44} y1={y(100)} y2={y(100)} stroke="var(--border)" strokeDasharray="3 3" />
        <path d={path(b)} fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" />
        <path d={path(a)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />
        <text x={W - 40} y={y(a[n - 1]) + 4} fontSize="10" fill="var(--foreground)">
          {pct(a[n - 1] - 100, true, 0)}
        </text>
        <text x={W - 40} y={y(b[n - 1]) + 4} fontSize="10" fill="var(--muted)">
          {pct(b[n - 1] - 100, true, 0)}
        </text>
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--muted)" strokeWidth={1} />
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 right-12 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] shadow-sm">
          ~{Math.round(((n - 1 - hover) * 5) / 21)} months ago · this {pct(a[hover] - 100, true, 0)} · you {pct(b[hover] - 100, true, 0)}
        </div>
      )}
    </div>
  );
}

/** Low–mean–high analyst targets as a track with the current price marked. */
function TargetMeter({ t, price }: { t: NonNullable<DiscoverItem["target"]>; price: number }) {
  const lo = Math.min(t.low, price);
  const hi = Math.max(t.high, price);
  const at = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <div>
      <div className="relative h-1.5 rounded-sm bg-[var(--surface-secondary)]">
        <span className="absolute h-full rounded-sm bg-[var(--accent-soft)]" style={{ left: at(t.low), right: `calc(100% - ${at(t.high)})` }} />
        <span className="absolute -top-1 h-3.5 w-0.5 bg-[var(--accent)]" style={{ left: at(t.mean) }} title={`Mean target ${money(t.mean)}`} />
        <span className="absolute -top-1 h-3.5 w-0.5 bg-[var(--foreground)]" style={{ left: at(price) }} title={`Price ${money(price)}`} />
      </div>
      <p className="font-figures mt-1.5 flex justify-between font-mono text-[11px] text-[var(--muted)]">
        <span>{money(t.low)}</span>
        <span className="text-[var(--foreground)]">
          target {money(t.mean)} ({pct(t.upsidePct, true)})
        </span>
        <span>{money(t.high)}</span>
      </p>
    </div>
  );
}

/** What adding $X of this (new money) does to your portfolio's volatility, beta and sector mix. */
function WhatIf({ item, p }: { item: DiscoverItem; p: PortfolioContext }) {
  const [amount, setAmount] = useState(Math.max(50, Math.round((p.total * 0.05) / 50) * 50));
  const x = Math.max(0, amount || 0);
  const w = x / (p.total + x);
  const f = item.fit;
  const volAfter = f ? Math.sqrt((1 - w) ** 2 * p.sigma ** 2 + w ** 2 * f.sigma ** 2 + 2 * w * (1 - w) * f.cov) * Math.sqrt(252) * 100 : null;
  const betaAfter = f ? (1 - w) * p.beta + w * f.beta : null;
  const sectorBefore = p.sectors.find((s) => s.sector === item.sector)?.pct ?? 0;
  const sectorAfter = ((sectorBefore / 100) * p.total + x) / (p.total + x) * 100;
  const row = (label: string, before: string, after: string, better: boolean | null) => (
    <div className="flex items-baseline justify-between gap-2 border-t border-[var(--border)] py-1.5 text-xs">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-figures font-mono">
        {before} →{" "}
        <span className={better === null ? "" : better ? "text-[var(--success)]" : "text-[var(--danger)]"}>{after}</span>
      </span>
    </div>
  );
  return (
    <div>
      <label className="flex items-center justify-between gap-2 text-sm">
        <span>If I add</span>
        <span className="flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2">
          <span className="text-[var(--muted)]">$</span>
          <input
            type="number"
            min={0}
            step={50}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="font-figures w-20 bg-transparent py-1 text-right font-mono outline-none"
            aria-label={`Amount of ${item.symbol} to add`}
          />
        </span>
      </label>
      <div className="mt-2">
        {row("Weight in portfolio", "0%", `${(w * 100).toFixed(1)}%`, null)}
        {volAfter !== null && row("Volatility", `${p.volatilityPct}%`, `${volAfter.toFixed(1)}%`, volAfter <= p.volatilityPct)}
        {betaAfter !== null && row("Beta", p.beta.toFixed(2), betaAfter.toFixed(2), betaAfter <= p.beta)}
        {item.sector && row(item.sector, `${sectorBefore.toFixed(1)}%`, `${sectorAfter.toFixed(1)}%`, null)}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">New money, nothing sold. Based on the last year of daily moves.</p>
    </div>
  );
}

function Detail({ i, p }: { i: DiscoverItem; p: PortfolioContext | null }) {
  const msprText = i.mspr === null ? null : i.mspr >= 20 ? "insiders net buying" : i.mspr <= -20 ? "insiders net selling" : "insider activity mixed";
  return (
    <div className="grid grid-cols-1 gap-5 py-3 lg:grid-cols-3">
      <div>
        <p className="mb-1.5 flex gap-3 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--accent)]" /> {i.symbol}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--muted)]" /> Your portfolio
          </span>
          <span className="ml-auto">last 12 months</span>
        </p>
        {p && <VersusChart item={i.spark} portfolio={p.spark} />}
        {i.fit && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Correlation with your portfolio <span className="font-figures font-mono text-[var(--foreground)]">{i.fit.corr.toFixed(2)}</span> · β{" "}
            {i.fit.beta.toFixed(2)} · volatility {i.fit.volatilityPct}%
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 text-sm">
        {i.description && <p className="line-clamp-3 text-xs text-[var(--secondary-foreground)]">{i.description}</p>}
        {i.target && i.price !== null && <TargetMeter t={i.target} price={i.price} />}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {i.earnings && (
            <span className="col-span-2 flex items-center gap-2">
              <span className="text-[var(--muted)]">Last {i.earnings.quarters} quarters</span>
              <span className="flex gap-1" aria-label={`${i.earnings.beats} of ${i.earnings.quarters} beat estimates`}>
                {Array.from({ length: i.earnings.quarters }, (_, k) => (
                  <span key={k} className={`h-2 w-2 rounded-full ${k < i.earnings!.beats ? "bg-[var(--success)]" : "bg-[var(--danger)]"}`} />
                ))}
              </span>
              <span>
                {i.earnings.beats}/{i.earnings.quarters} beats, avg {pct(i.earnings.avgSurprisePct, true)}
              </span>
            </span>
          )}
          {i.nextEarnings && (
            <span className="col-span-2 text-[var(--danger)]">
              Reports {i.nextEarnings.date}
              {i.nextEarnings.timing === "am" ? " before open" : i.nextEarnings.timing === "pm" ? " after close" : ""} · typically moves ±
              {i.nextEarnings.avgMovePct}% (worst {i.nextEarnings.maxMovePct}%)
            </span>
          )}
          {msprText && <span className="col-span-2 text-[var(--muted)]">Last 3 months: {msprText}</span>}
          <span className="text-[var(--muted)]">Market cap</span>
          <span className="font-figures text-right font-mono">{cap(i.marketCap) ?? "—"}</span>
          <span className="text-[var(--muted)]">Net margin</span>
          <span className="font-figures text-right font-mono">{pct(i.netMargin)}</span>
          <span className="text-[var(--muted)]">Dividend yield</span>
          <span className="font-figures text-right font-mono">{i.dividendYield ? pct(i.dividendYield) : "—"}</span>
          <span className="text-[var(--muted)]">From 52w high</span>
          <span className="font-figures text-right font-mono">{pct(i.fromHigh)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
        {p ? <WhatIf item={i} p={p} /> : <p className="text-xs text-[var(--muted)]">Portfolio data not ready.</p>}
      </div>
    </div>
  );
}

export function DiscoverTable({ items, portfolio }: { items: DiscoverItem[]; portfolio: PortfolioContext | null }) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "score", desc: true });
  const [source, setSource] = useState<Source | "all">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const rows = items
    .filter((i) => (source === "all" || i.sources.includes(source)) && (!onlyNew || i.newIndustry || i.kind === "fund"))
    .sort((a, b) => {
      const x = valueOf(a, sort.key);
      const y = valueOf(b, sort.key);
      if (x === null) return 1; // missing data always sinks
      if (y === null) return -1;
      return sort.desc ? y - x : x - y;
    });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {SOURCES.map((s) => {
          const count = s.key === "all" ? items.length : items.filter((i) => i.sources.includes(s.key as Source)).length;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSource(s.key)}
              aria-pressed={source === s.key}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                source === s.key
                  ? "border-[var(--border)] bg-[var(--surface-hover)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {s.label} <span className="text-[var(--muted)]">{count}</span>
            </button>
          );
        })}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--secondary-foreground)]">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          Only what I don&apos;t have exposure to
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)]">
              <th className="pb-2 font-normal">Company</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="pb-2 text-right font-normal" title={c.title}>
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : !c.asc }))}
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
              <Fragment key={i.symbol}>
                <tr
                  className={`cursor-pointer border-t border-[var(--border)] align-middle hover:bg-[var(--surface-hover)] ${open === i.symbol ? "bg-[var(--surface-hover)]" : ""}`}
                  onClick={() => setOpen(open === i.symbol ? null : i.symbol)}
                  aria-expanded={open === i.symbol}
                >
                  <td className="py-2.5 pr-3 pl-1">
                    <div className="flex items-center gap-2.5">
                      <TickerLogo symbol={i.symbol} size={28} />
                      <div className="min-w-0">
                        <p className="truncate">
                          <a
                            href={`https://robinhood.com/stocks/${i.symbol}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium hover:underline"
                          >
                            {i.symbol}
                          </a>{" "}
                          <span className="text-[var(--muted)]">{i.name !== i.symbol ? i.name : (i.industry ?? "")}</span>
                        </p>
                        <p className="flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]">
                          {i.sources.map((s) => (
                            <span key={s} className="rounded bg-[var(--surface-secondary)] px-1 py-px text-[10px]">
                              {s === "watchlist" && i.watchlists.length ? `On ${i.watchlists[0]}` : SOURCE_LABEL[s]}
                            </span>
                          ))}
                          {i.nextEarnings && daysUntil(i.nextEarnings.date) <= 14 && (
                            <span
                              className="rounded bg-[var(--surface-secondary)] px-1 py-px text-[10px] text-[var(--danger)]"
                              title={`Typical earnings-day move ±${i.nextEarnings.avgMovePct}%, worst ${i.nextEarnings.maxMovePct}% (last ${i.nextEarnings.reports} reports)`}
                            >
                              ⚠ Earnings {daysUntil(i.nextEarnings.date) <= 0 ? "today" : `in ${daysUntil(i.nextEarnings.date)}d`} · ±{i.nextEarnings.avgMovePct}%
                            </span>
                          )}
                          {i.newIndustry && (
                            <span className="rounded bg-[var(--accent-soft)] px-1 py-px text-[10px] text-[var(--accent)]">New industry</span>
                          )}
                          <span className="truncate">
                            {i.peerOf.length > 0 && `Peer of ${i.peerOf.join(", ")}`}
                            {i.peerOf.length > 0 && i.industry && " · "}
                            {i.industry}
                          </span>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="font-figures py-2.5 text-right font-mono font-semibold">{i.score}</td>
                  <td className="font-figures py-2.5 text-right font-mono">{i.opportunity}</td>
                  <td
                    className="font-figures py-2.5 text-right font-mono"
                    title={i.sectorPct !== null && i.sector ? `You already have ${i.sectorPct.toFixed(1)}% in ${i.sector}` : undefined}
                  >
                    {i.portfolioFit}
                  </td>
                  <td
                    className={`font-figures py-2.5 text-right font-mono text-xs ${i.fit ? (i.fit.deltaVolAt5 <= 0 ? "text-[var(--success)]" : "text-[var(--danger)]") : "text-[var(--muted)]"}`}
                    title={i.fit ? `Correlation with your portfolio ${i.fit.corr.toFixed(2)}` : "Not enough history"}
                  >
                    {i.fit && portfolio
                      ? `${portfolio.volatilityPct.toFixed(1)} → ${(portfolio.volatilityPct + i.fit.deltaVolAt5).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="py-2.5 text-right text-xs">
                    {i.analysts ? <AnalystBar a={i.analysts} /> : <span className="text-[var(--muted)]">—</span>}
                  </td>
                  <td className={`font-figures py-2.5 text-right font-mono ${tone(i.target?.upsidePct ?? null)}`}>{pct(i.target?.upsidePct ?? null, true)}</td>
                  <td className={`font-figures py-2.5 text-right font-mono ${tone(i.revenueGrowth)}`}>{pct(i.revenueGrowth, true)}</td>
                  <td className="font-figures py-2.5 text-right font-mono">{i.pe === null || i.pe <= 0 ? "—" : i.pe.toFixed(1)}</td>
                  <td className={`font-figures py-2.5 text-right font-mono ${tone(i.return52w)}`}>{pct(i.return52w, true)}</td>
                  <td className="py-2.5 pr-1 pl-3 text-right">
                    <p className="font-figures font-mono">{i.price === null ? "—" : `$${i.price.toFixed(2)}`}</p>
                    <p className={`font-figures font-mono text-xs ${tone(i.changePct)}`}>{pct(i.changePct, true, 2)}</p>
                  </td>
                </tr>
                {open === i.symbol && (
                  <tr className="bg-[var(--surface-hover)]/40">
                    <td colSpan={COLUMNS.length + 2} className="px-2">
                      <Detail i={i} p={portfolio} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="mt-4 text-sm text-[var(--muted)]">Nothing matches.</p>}
    </>
  );
}
