import { headers } from "next/headers";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { NewsCard } from "@/components/news/NewsIntelligence";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import type { NewsEvent, NewsFeed } from "@/lib/news";
import type { InsiderActivity } from "@/lib/insiders";
import { InsiderTrades } from "@/components/InsiderTrades";
import { DashboardRetry } from "@/components/DashboardRetry";

const newest = (a: NewsEvent, b: NewsEvent) => b.publishedAt.localeCompare(a.publishedAt);

async function NewsAlerts() {
  let feed: NewsFeed | null = null;
  try {
    const res = await backend("/api/v1/news");
    if (res.ok) feed = await res.json();
  } catch { /* Report this section's fetch failure below. */ }
  if (!feed || !Array.isArray(feed.events)) return <SectionError label="news alerts" />;
  const events = feed?.events ?? [];
  const now = events.filter((e) => e.alert === "now").sort(newest);
  const digest = events.filter((e) => e.alert === "digest").sort(newest);
  const classified = events.some((e) => e.alert != null);

  return (
    <>

        {!classified ? (
          <Card className="mt-5">
            <p className="text-sm text-[var(--muted)]">
              No classified news yet. Set <code>TYPESAFE_API_KEY</code> and run{" "}
              <code>node ace news:classify</code>.
            </p>
          </Card>
        ) : (
          <>
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-medium text-[var(--secondary-foreground)]">
                See today <span className="text-[var(--muted)]">· {now.length}</span>
              </h2>
              {now.length ? (
                <div className="flex flex-col gap-4">
                  {now.map((e) => (
                    <NewsCard key={e.id} event={e} featured />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">Nothing urgent. All calm.</p>
              )}
            </section>

            <section className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-[var(--secondary-foreground)]">
                Daily digest <span className="text-[var(--muted)]">· {digest.length}</span>
              </h2>
              <Card>
                <div className="flex flex-col">
                  {digest.map((e) => (
                    <a
                      key={e.id}
                      href={e.sources[0]?.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-baseline gap-3 border-b border-[var(--border)] py-2.5 text-sm last:border-0 hover:text-[var(--accent)]"
                    >
                      <span className="w-14 shrink-0 font-medium">{e.tickers[0] ?? "—"}</span>
                      <span className="flex-1">{e.headline}</span>
                      <span className="shrink-0 text-xs text-[var(--muted)]">
                        {new Date(e.publishedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </a>
                  ))}
                </div>
              </Card>
            </section>
          </>
        )}


    </>
  );
}

function SectionError({ label }: { label: string }) {
  return <div role="alert" className="mt-5 flex items-center gap-3 text-sm text-[var(--muted)]">Could not load {label}.<DashboardRetry /></div>;
}

async function InsiderAlerts() {
  let insiders: InsiderActivity | null = null;
  try {
    const res = await backend("/api/v1/insiders");
    if (res.ok) insiders = await res.json();
  } catch { /* Report this section's fetch failure below. */ }
  if (!insiders || !Array.isArray(insiders.trades)) return <SectionError label="insider trades" />;
  return (
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-[var(--secondary-foreground)]">
          Insider trades <span className="text-[var(--muted)]">· {insiders.trades.length}</span>
        </h2>
        <InsiderTrades data={insiders} />
      </section>
    );
}

export default async function Alerts() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return (
    <main className="mx-auto w-full max-w-[960px] flex-1 px-4 pt-6 pb-24">
      <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Jev (TypeSafe) decides which news about your holdings deserves attention today and which can wait for the digest. Below: what company insiders are doing with the stocks you hold.
      </p>
      <Suspense fallback={<p role="status" className="mt-5 text-sm text-[var(--muted)]">Loading news alerts…</p>}><NewsAlerts /></Suspense>
      <Suspense fallback={<p role="status" className="mt-8 text-sm text-[var(--muted)]">Loading insider trades…</p>}><InsiderAlerts /></Suspense>
    </main>
  );
}
