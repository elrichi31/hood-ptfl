import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { Card } from "@/components/Card";
import { DiscoverTable, type DiscoverItem } from "@/components/DiscoverTable";

type Discover = { status: "idle" | "building" | "ready"; builtAt: string | null; items: DiscoverItem[] };

export default async function DiscoverPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const res = await backend("/api/v1/discover");
  const d: Discover = res.ok ? await res.json() : { status: "idle", builtAt: null, items: [] };

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24">
      <h1 className="text-2xl font-semibold tracking-tight">Discover</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Stocks you don&apos;t own yet that trade as peers of the ones you do, ranked by analyst consensus, growth and
        margins. Ideas to research, not advice. Source: Finnhub
        {d.builtAt &&
          ` · updated ${new Date(d.builtAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
        .
      </p>

      <div className="mt-4">
        <Card title={d.items.length ? `${d.items.length} candidates` : "Candidates"}>
          {d.items.length ? (
            <DiscoverTable items={d.items} />
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {d.status === "building"
                ? "Building your list from Finnhub. This takes about 6 minutes after a restart, then refreshes daily. Reload in a bit."
                : !res.ok
                  ? `Could not load Discover (backend returned ${res.status}).`
                  : "No candidates yet. Discover needs FINNHUB_API_KEY and at least one stock holding."}
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
