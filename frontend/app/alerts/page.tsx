import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import { NewsCard } from "@/components/news/NewsIntelligence";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import type { NewsEvent, NewsFeed } from "@/lib/news";

const newest = (a: NewsEvent, b: NewsEvent) => b.publishedAt.localeCompare(a.publishedAt);

export default async function Alerts() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const res = await backend("/api/v1/news");
  const feed: NewsFeed | null = res.ok ? await res.json() : null;
  const events = feed?.events ?? [];
  const now = events.filter((e) => e.alert === "now").sort(newest);
  const digest = events.filter((e) => e.alert === "digest").sort(newest);
  const classified = events.some((e) => e.alert != null);

  return (
    <AppShell name={session.user.name} email={session.user.email}>
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 pt-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Jev (TypeSafe) decide qué noticias de tus posiciones merecen verse hoy y cuáles pueden esperar al resumen.
        </p>

        {!classified ? (
          <Card className="mt-5">
            <p className="text-sm text-[var(--muted)]">
              Aún no hay noticias clasificadas. Configura <code>TYPESAFE_API_KEY</code> y corre{" "}
              <code>node ace news:classify</code>.
            </p>
          </Card>
        ) : (
          <>
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-medium text-[var(--secondary-foreground)]">
                Ver hoy <span className="text-[var(--muted)]">· {now.length}</span>
              </h2>
              {now.length ? (
                <div className="flex flex-col gap-4">
                  {now.map((e) => (
                    <NewsCard key={e.id} event={e} featured />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">Nada urgente. Tranquilo.</p>
              )}
            </section>

            <section className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-[var(--secondary-foreground)]">
                Resumen del día <span className="text-[var(--muted)]">· {digest.length}</span>
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
                        {new Date(e.publishedAt).toLocaleString("es", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </a>
                  ))}
                </div>
              </Card>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
