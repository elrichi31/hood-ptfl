import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";


type Trade = {
  politician_name: string;
  party: string;
  position: string;
  symbol: string;
  heldSymbol: string;
  transaction_type: "BUY" | "SELL";
  amount_range: { min: string; max: string } | null;
  transaction_date: string;
  disclosure_date: string;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function PoliticianTrades() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const res = await backend("/api/v1/politician-trades");
  const trades: Trade[] = res.ok ? await res.json() : [];

  return (
    <AppShell name={session.user.name} email={session.user.email}>
      <main className="mx-auto w-full max-w-[760px] flex-1 px-6 pt-16 pb-24">
        <h1 className="text-[2.5rem] leading-tight font-bold tracking-tight">Politician trades</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Disclosed trades by US politicians in tickers you currently hold. Source: Tip Ranks, via
          Robinhood&apos;s MCP.
        </p>

        {!trades.length && (
          <p className="mt-8 text-sm text-[var(--muted)]">No disclosed trades found in your holdings.</p>
        )}

        <div className="mt-8 flex flex-col">
          {trades.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-3 text-sm last:border-0">
              <div>
                <p className="font-medium">{t.politician_name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {t.position} · {t.party.charAt(0) + t.party.slice(1).toLowerCase()}
                </p>
              </div>
              <div className="text-right">
                <p>
                  <span className={t.transaction_type === "BUY" ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                    {t.transaction_type}
                  </span>{" "}
                  <span className="font-medium">{t.symbol}</span>
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {t.amount_range ? `${money(Number(t.amount_range.min))}–${money(Number(t.amount_range.max))}` : "—"}
                  {" · "}
                  {new Date(t.transaction_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
