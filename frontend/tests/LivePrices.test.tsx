import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LivePricesProvider,
  LiveQuoteStatus,
  useLivePrices,
  useLiveHistory,
} from "@/components/LivePrices";
import type { PositionHistory } from "@/components/PortfolioExplorer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
class Source {
  static current: Source;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  close = vi.fn();
  constructor() {
    Source.current = this;
  }
}
const now = Date.parse("2026-09-30T15:00:00Z");
const history: PositionHistory = {
  at: [new Date(now - 10_000).toISOString()],
  total: [100],
  cash: [0],
  symbols: { AAPL: { type: "equity", qty: [1], price: [100] } },
};
function Consumer() {
  const live = useLivePrices();
  const h = useLiveHistory(history);
  return (
    <>
      <pre data-testid="state">{JSON.stringify(live)}</pre>
      <pre data-testid="history">{JSON.stringify(h)}</pre>
    </>
  );
}
function state() {
  return JSON.parse(screen.getByTestId("state").textContent!);
}
function send(provider: string, t: number | null, price = 105) {
  act(() =>
    Source.current.onmessage?.({
      data: JSON.stringify({
        provider,
        prices: t ? { AAPL: price } : {},
        timestamps: t ? { AAPL: t } : {},
        lastTradeAt: t,
      }),
    }),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal("EventSource", Source);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live quote status and original trade times", () => {
  it("does not let cached quotes override a newer polled snapshot", () => {
    render(
      <LivePricesProvider snapshotAt={new Date(now).toISOString()}>
        <Consumer />
      </LivePricesProvider>,
    );
    send("connected", now - 1000);
    expect(state().prices).toEqual({});
    send("connected", now + 1000);
    expect(state().prices.AAPL).toBe(105);
  });

  it("does not mark the portfolio live just because SSE opens", () => {
    render(
      <LivePricesProvider>
        <Consumer />
        <LiveQuoteStatus />
      </LivePricesProvider>,
    );
    act(() => Source.current.onopen?.());
    expect(state().connected).toBe(false);
    expect(state().status).toBe("reconnecting");
  });

  it("shows live only for a connected provider with fresh quotes, then ages without messages", () => {
    render(
      <LivePricesProvider>
        <Consumer />
        <LiveQuoteStatus />
      </LivePricesProvider>,
    );
    send("connected", now);
    expect(state().status).toBe("live");
    expect(screen.getByRole("status").textContent).toContain("Live quotes");
    expect(screen.getByRole("status").querySelector("time")?.dateTime).toBe(
      new Date(now).toISOString(),
    );
    expect(state().at).toBe(new Date(now).toISOString());
    act(() => vi.advanceTimersByTime(65_000));
    expect(state().status).toBe("stale");
    expect(state().connected).toBe(false);
  });

  it("does not relabel cached quotes as fresh on reconnect or heartbeat", () => {
    render(
      <LivePricesProvider>
        <Consumer />
        <LiveQuoteStatus />
      </LivePricesProvider>,
    );
    send("connected", now - 120_000);
    expect(state().status).toBe("stale");
    expect(state().at).toBe(new Date(now - 120_000).toISOString());
    const h = JSON.parse(screen.getByTestId("history").textContent!);
    expect(h.at).toHaveLength(1); // quote predates saved snapshot
    send("reconnecting", now - 120_000);
    expect(state().status).toBe("reconnecting");
    send("connected", now - 120_000);
    expect(state().status).toBe("stale");
  });

  it("handles disabled, waiting, upstream failure and browser disconnect separately", () => {
    render(
      <LivePricesProvider>
        <Consumer />
        <LiveQuoteStatus />
      </LivePricesProvider>,
    );
    send("disabled", null);
    expect(state().status).toBe("disabled");
    send("connected", null);
    expect(state().status).toBe("waiting");
    send("connected", now);
    act(() => Source.current.onerror?.());
    expect(state().status).toBe("reconnecting");
  });

  it("ignores malformed events and closes SSE on unmount", () => {
    const { unmount } = render(
      <LivePricesProvider>
        <Consumer />
        <LiveQuoteStatus />
      </LivePricesProvider>,
    );
    send("connected", now);
    act(() => Source.current.onmessage?.({ data: "{" }));
    act(() =>
      Source.current.onmessage?.({
        data: JSON.stringify({
          provider: "connected",
          prices: { AAPL: "bad" },
          timestamps: { AAPL: now },
          lastTradeAt: now,
        }),
      }),
    );
    expect(state().prices.AAPL).toBe(105);
    unmount();
    expect(Source.current.close).toHaveBeenCalledOnce();
  });

  it("replaces full snapshots so sold symbols are removed", () => {
    render(
      <LivePricesProvider>
        <Consumer />
        <LiveQuoteStatus />
      </LivePricesProvider>,
    );
    send("connected", now);
    send("connected", null);
    expect(state().prices).toEqual({});
  });
});
