import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { Card } from "@/components/Card";
import { DiscoverTable, type DiscoverItem, type PortfolioContext } from "@/components/DiscoverTable";

type Discover = {
  status: "idle" | "building" | "ready";
  builtAt: string | null;
  items: DiscoverItem[];
  portfolio: PortfolioContext | null;
};

export default async function DiscoverPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const res = await backend("/api/v1/discover");
  const d: Discover = res.ok ? await res.json() : { status: "idle", builtAt: null, items: [], portfolio: null };
  const diversifiers = d.items.filter((i) => i.fit && i.fit.deltaVolAt5 < 0).length;

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24">
      <h1 className="text-2xl font-semibold tracking-tight">Discover</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Stocks and ETFs from your watchlists, peers of what you hold, and popular names that would diversify you, each scored on
        how it fits <em>your</em> portfolio, not just on analyst hype. Click a row for the detail and a what-if. Ideas to
        research, not advice
        {d.builtAt &&
          ` · updated ${new Date(d.builtAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
        .
      </p>

      <div className="mt-4">
        <Card
          title={
            d.items.length
              ? `${d.items.length} candidates · ${diversifiers} would lower your volatility`
              : "Candidates"
          }
        >
          {d.items.length ? (
            <DiscoverTable items={d.items} portfolio={d.portfolio} />
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {d.status === "building"
                ? "Building your list: Robinhood data plus Finnhub for ~70 names. This takes about 10 minutes after a restart, then refreshes daily. Reload in a bit."
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
