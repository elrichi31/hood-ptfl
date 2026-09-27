import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { Card } from "@/components/Card";

type Usage = {
  provider: "finnhub" | "alphavantage" | "marketaux" | "typesafe";
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
  finnhub: { name: "Finnhub", usedFor: "Company news per holding, market headlines, earnings calendar" },
  alphavantage: { name: "Alpha Vantage", usedFor: "News + sentiment for all holdings (one call per poll)" },
  marketaux: { name: "Marketaux", usedFor: "Entity-matched news for all holdings (one call per poll)" },
  typesafe: { name: "TypeSafe", usedFor: "AI classification of new articles (one call per article)" },
};

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

      {u.days.length > 0 && (
        <div className="mt-3 flex h-10 items-end gap-1" aria-label="Calls per day, last 7 days">
          {u.days.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.calls} calls${d.errors ? `, ${d.errors} failed` : ""}`}
              className="flex-1 rounded-sm bg-[var(--accent)] opacity-70"
              style={{ height: `${Math.max(6, (d.calls / max) * 100)}%` }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
