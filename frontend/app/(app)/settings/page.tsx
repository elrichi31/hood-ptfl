import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { Card } from "@/components/Card";

type Usage = {
  provider: "finnhub" | "alphavantage" | "marketaux" | "typesafe" | "coinbase";
  configured: boolean;
  perDay: number | null;
  perMinute: number | null;
  today: number;
  todayErrors: number;
  avg7d: number;
  days: { day: string; calls: number; errors: number }[];
  rateHeaders: Record<string, string> | null;
  lastCallAt: string | null;
};

const INFO: Record<Usage["provider"], { name: string; usedFor: string }> = {
  finnhub: { name: "Finnhub", usedFor: "News every 15 min, live prices (WebSocket), Discover, insider trades, earnings calendar" },
  alphavantage: { name: "Alpha Vantage", usedFor: "News + sentiment for all holdings, paced to use the full daily quota (~1/hour)" },
  marketaux: { name: "Marketaux", usedFor: "News for one holding per call, rotating, paced to use the full daily quota (~1 every 15 min)" },
  typesafe: { name: "TypeSafe", usedFor: "AI classification of new articles (one call per article)" },
  coinbase: { name: "Coinbase", usedFor: "Multi-year daily crypto prices for Risk (public, no key; ~20 calls per 6h rebuild)" },
};

/** The last 7 UTC days, oldest first — the backend buckets calls by UTC day (when quotas reset). */
const lastWeek = () =>
  Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10));

export default async function Settings() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const res = await backend("/api/v1/usage");
  const usage: Usage[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-16">
      <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-[2.5rem]">Settings</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Real API calls made by the backend, counted per UTC day (when free-tier quotas reset).
      </p>

      {!usage.length && <p className="mt-8 text-sm text-[var(--muted)]">Couldn&apos;t load API usage.</p>}

      <div className="mt-8 flex flex-col gap-4">
        {usage.map((u) => (
          <ProviderCard key={u.provider} u={u} />
        ))}
      </div>
    </main>
  );
}

function ProviderCard({ u }: { u: Usage }) {
  const { name, usedFor } = INFO[u.provider];
  const pct = u.perDay ? Math.min(100, (u.today / u.perDay) * 100) : null;
  const remainingMin = u.rateHeaders?.["x-ratelimit-remaining"];
  const max = Math.max(1, ...u.days.map((d) => d.calls));

  return (
    <Card
      title={name}
      action={
        <span className={`text-xs ${u.configured ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>
          {u.configured ? "Configured" : "No API key"}
        </span>
      }
    >
      <p className="text-xs text-[var(--muted)]">{usedFor}</p>

      <div className="mt-3 flex items-baseline justify-between gap-4 text-sm">
        <p>
          <span className="text-xl font-semibold tabular-nums">{u.today}</span>
          <span className="text-[var(--muted)]">{u.perDay ? ` / ${u.perDay} today` : " calls today"}</span>
          {u.todayErrors > 0 && <span className="text-[var(--danger)]"> · {u.todayErrors} failed</span>}
        </p>
        <p className="text-right text-xs text-[var(--muted)] tabular-nums">
          {u.avg7d}/day avg (7d)
          {u.perDay && ` · ${Math.max(0, u.perDay - u.today)} left today`}
        </p>
      </div>

      {pct !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
          <div
            className={`h-full rounded-full ${pct >= 90 ? "bg-[var(--danger)]" : pct >= 70 ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <p className="mt-2 text-xs text-[var(--muted)]">
        {u.perDay ? `Free tier: ${u.perDay}/day` : "No daily cap"}
        {u.perMinute && ` · ${u.perMinute}/min`}
        {remainingMin && ` · ${remainingMin} left this minute`}
        {!u.perDay && !u.perMinute && " · limits not published"}
      </p>

      {/* Always 7 slots (oldest → today), so one day of data doesn't stretch into a full-width block. */}
      <div className="mt-3 flex h-10 items-end gap-1" aria-label="Calls per day, last 7 days">
        {lastWeek().map((day) => {
          const d = u.days.find((x) => x.day === day);
          return (
            <div
              key={day}
              title={`${day}: ${d?.calls ?? 0} calls${d?.errors ? `, ${d.errors} failed` : ""}`}
              className={`flex-1 rounded-sm ${d?.calls ? "bg-[var(--accent)] opacity-70" : "bg-[var(--surface-secondary)]"}`}
              style={{ height: d?.calls ? `${Math.max(8, (d.calls / max) * 100)}%` : "2px" }}
            />
          );
        })}
      </div>
    </Card>
  );
}
