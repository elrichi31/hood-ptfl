import type { ComponentProps } from "react";
import { Card } from "@/components/Card";
import { DashboardRetry } from "@/components/DashboardRetry";
import { PositionsTable } from "@/components/PositionsTable";
import type { PositionHistory } from "@/components/PortfolioExplorer";
import { backend } from "@/lib/backend";

type TableProps = ComponentProps<typeof PositionsTable>;
type References = NonNullable<TableProps["references"]>;
type HoldingsProps = {
  positions: { equities: TableProps["rows"]; crypto: TableProps["rows"] };
  history?: PositionHistory;
  tz: string;
  historyError?: string | null;
};

/** The same usable holdings remain visible while optional historical returns load. */
export function HoldingsTables({ positions, history, tz, historyError, references, referenceError, pending = false }: HoldingsProps & {
  references?: References;
  referenceError?: string | null;
  pending?: boolean;
}) {
  return (
    <>
      {pending && <p role="status" className="text-xs text-[var(--muted)]">Loading historical returns…</p>}
      {(historyError || referenceError) && (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-sm text-[var(--muted)]">
            Position returns are partially unavailable: {historyError ?? referenceError}
          </p>
          {referenceError && <DashboardRetry />}
        </div>
      )}
      <Card title="Stocks & ETFs">
        <PositionsTable rows={positions.equities} history={history} references={references} tz={tz} enrichable />
      </Card>
      <Card title="Crypto">
        <PositionsTable rows={positions.crypto} history={history} references={references} tz={tz} crypto />
      </Card>
    </>
  );
}

/** Only this lower section waits on provider-backed reference prices, not the dashboard. */
export async function DeferredHoldings(props: HoldingsProps) {
  let references: References | undefined;
  let error: string | null = null;
  if (props.positions.equities.length) {
    try {
      const response = await backend("/api/v1/history/references");
      if (!response.ok) error = `Service returned HTTP ${response.status}.`;
      else {
        const data: unknown = await response.json();
        if (data && typeof data === "object" && !Array.isArray(data) && Object.values(data).every((row) => row && typeof row === "object" && !Array.isArray(row) && Object.values(row).every(Number.isFinite))) {
          references = data as References;
        } else error = "Service returned invalid data. Please retry.";
      }
    } catch (cause) {
      error = cause instanceof Error && ["TimeoutError", "AbortError"].includes(cause.name)
        ? "The service took too long to respond."
        : "Could not load data. Please retry.";
    }
  }
  return <HoldingsTables {...props} references={references} referenceError={error} />;
}
