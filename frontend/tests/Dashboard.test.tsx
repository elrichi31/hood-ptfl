import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/(app)/page";
import { backend } from "@/lib/backend";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { name: "Nicolas" } }) } },
}));
vi.mock("@/lib/tz", () => ({ viewerTz: async () => "America/New_York" }));
vi.mock("@/lib/backend", () => ({ backend: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("@/components/PortfolioExplorer", () => ({
  PortfolioExplorer: () => <div>Portfolio chart available</div>,
}));
vi.mock("@/components/DailyPnlChart", () => ({
  DailyPnlChart: () => <div>Daily chart available</div>,
}));
vi.mock("@/components/PositionsTable", () => ({
  PositionsTable: () => <div>Positions available</div>,
}));
vi.mock("@/components/AnalysisCharts", () => ({
  AllocationChart: () => <div>Allocation available</div>,
  TopMoversChart: () => <div>Movers available</div>,
}));

const latest = {
  at: "2026-09-30T15:00:00Z",
  balance: {
    total: 100,
    accounts: [
      { type: "brokerage", nickname: null, cash: 100, totalValue: 100 },
    ],
  },
  positions: { equities: [], crypto: [] },
  pnl: null,
};
const data: Record<string, unknown> = {
  "/api/v1/latest": latest,
  "/api/v1/history": [],
  "/api/v1/history/positions": { at: [], total: [], cash: [], symbols: {} },
  "/api/v1/history/daily": [],
  "/api/v1/history/references": {},
};
beforeEach(() => {
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
    },
  );
  vi.mocked(backend).mockImplementation(
    async (path) => new Response(JSON.stringify(data[path])),
  );
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Portfolio synchronization status", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-09-30T15:01:00Z");
  });

  it("shows the original successful synchronization time separately from quotes", async () => {
    render(await Home());
    const status = screen.getByRole("status", {
      name: "Portfolio synchronization",
    });
    expect(
      within(status).getByText("Last successful portfolio sync"),
    ).toBeTruthy();
    const time = status.querySelector("time")!;
    expect(time.dateTime).toBe(latest.at);
    expect(time.textContent).toBe("Sep 30, 2026, 11:00:00 AM");
    expect(
      within(status).getByText("Positions & cash · 1 min ago"),
    ).toBeTruthy();
    expect(screen.getByText("Reconnecting")).toBeTruthy();
  });

  it("warns when saved positions are delayed without hiding them or advancing their time", async () => {
    vi.setSystemTime("2026-09-30T15:36:00Z");
    const { container } = render(await Home());
    const status = screen.getByRole("status", {
      name: "Portfolio synchronization",
    });
    expect(within(status).getByText("Portfolio sync delayed")).toBeTruthy();
    expect(
      within(status).getByText(
        "Positions and cash may be outdated; showing last saved data.",
      ),
    ).toBeTruthy();
    expect(status.querySelector("time")!.dateTime).toBe(latest.at);
    expect(screen.getAllByText("Positions available")).toHaveLength(2);
    const total = container.querySelector<
      HTMLElement & { _data: { value: number } }
    >("number-flow-react");
    expect(total!._data.value).toBe(100);
  });

  it("ages while the page stays open and clears the warning only for a newer saved snapshot", async () => {
    vi.setSystemTime("2026-09-30T15:34:00Z");
    const { rerender, unmount } = render(await Home());
    expect(screen.queryByText("Portfolio sync delayed")).toBeNull();
    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(screen.getByText("Portfolio sync delayed")).toBeTruthy();
    expect(
      screen
        .getByRole("status", { name: "Portfolio synchronization" })
        .querySelector("time")!.dateTime,
    ).toBe(latest.at);
    const updatedAt = "2026-09-30T15:36:00Z";
    vi.mocked(backend).mockImplementation(
      async (path) =>
        new Response(
          JSON.stringify(
            path === "/api/v1/latest"
              ? { ...latest, at: updatedAt }
              : data[path],
          ),
        ),
    );
    rerender(await Home());
    expect(screen.queryByText("Portfolio sync delayed")).toBeNull();
    expect(
      screen
        .getByRole("status", { name: "Portfolio synchronization" })
        .querySelector("time")!.dateTime,
    ).toBe(updatedAt);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let fresh live quotes clear a delayed portfolio synchronization", async () => {
    vi.setSystemTime("2026-09-30T15:36:00Z");
    class Source {
      static current: Source;
      onmessage: ((event: { data: string }) => void) | null = null;
      constructor() {
        Source.current = this;
      }
      close() {}
    }
    vi.stubGlobal("EventSource", Source);
    render(await Home());
    act(() =>
      Source.current.onmessage?.({
        data: JSON.stringify({
          prices: { AAPL: 105 },
          timestamps: { AAPL: Date.now() },
          provider: "connected",
          lastTradeAt: Date.now(),
        }),
      }),
    );
    expect(screen.getByText("Live quotes")).toBeTruthy();
    expect(screen.getByText("Portfolio sync delayed")).toBeTruthy();
    expect(
      screen
        .getByRole("status", { name: "Portfolio synchronization" })
        .querySelector("time")!.dateTime,
    ).toBe(latest.at);
  });

  it.each(["invalid-date", "2026-10-01T15:00:00Z"])(
    "does not present an invalid or future saved time as successful: %s",
    async (at) => {
      vi.mocked(backend).mockImplementation(
        async (path) =>
          new Response(
            JSON.stringify(
              path === "/api/v1/latest" ? { ...latest, at } : data[path],
            ),
          ),
      );
      render(await Home());
      const status = screen.getByRole("status", {
        name: "Portfolio synchronization",
      });
      expect(
        within(status).getByText("Portfolio sync unavailable"),
      ).toBeTruthy();
      expect(status.querySelector("time")).toBeNull();
    },
  );

  it("does not report a successful sync or fabricate a time when portfolio loading fails", async () => {
    vi.mocked(backend).mockImplementation(async (path) => {
      if (path === "/api/v1/latest") throw new TypeError("fetch failed");
      return new Response(JSON.stringify(data[path]));
    });
    render(await Home());
    const status = screen.getByRole("status", {
      name: "Portfolio synchronization",
    });
    expect(within(status).getByText("Portfolio sync unavailable")).toBeTruthy();
    expect(status.querySelector("time")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("Dashboard partial failures", () => {
  it.each([
    {
      type: "brokerage",
      nickname: { invalid: true },
      cash: 100,
      totalValue: 100,
    },
    { type: { invalid: true }, nickname: null, cash: 100, totalValue: 100 },
  ])("isolates invalid account labels: %j", async (account) => {
    vi.mocked(backend).mockImplementation(
      async (path) =>
        new Response(
          JSON.stringify(
            path === "/api/v1/latest"
              ? {
                  ...latest,
                  balance: { ...latest.balance, accounts: [account] },
                }
              : data[path],
          ),
        ),
    );
    render(await Home());
    expect(screen.getByText("Portfolio chart available")).toBeTruthy();
    expect(screen.getByText("Daily chart available")).toBeTruthy();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Service returned invalid data. Please retry.")
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Positions available")).toBeNull();
  });

  it("isolates a valid JSON response with an invalid shape", async () => {
    vi.mocked(backend).mockImplementation(
      async (path) =>
        new Response(
          JSON.stringify(path === "/api/v1/history/daily" ? {} : data[path]),
        ),
    );
    render(await Home());
    expect(screen.getAllByText("Positions available")).toHaveLength(2);
    expect(screen.queryByText("Daily chart available")).toBeNull();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
  it("keeps independent charts when latest portfolio fails over the network", async () => {
    vi.mocked(backend).mockImplementation(async (path) => {
      if (path === "/api/v1/latest") throw new TypeError("fetch failed");
      return new Response(JSON.stringify(data[path]));
    });
    render(await Home());
    expect(screen.getByText("Portfolio chart available")).toBeTruthy();
    expect(screen.getByText("Daily chart available")).toBeTruthy();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.queryByText("Positions available")).toBeNull();
  });

  it("keeps positions and daily chart when position history returns HTTP 500", async () => {
    vi.mocked(backend).mockImplementation(async (path) =>
      path === "/api/v1/history/positions"
        ? new Response("failed", { status: 500 })
        : new Response(JSON.stringify(data[path])),
    );
    render(await Home());
    expect(screen.getAllByText("Positions available")).toHaveLength(2);
    expect(screen.getByText("Daily chart available")).toBeTruthy();
    expect(screen.queryByText("Portfolio chart available")).toBeNull();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("shows an error instead of a fake zero monthly return when daily JSON is malformed", async () => {
    vi.mocked(backend).mockImplementation(
      async (path) =>
        new Response(
          path === "/api/v1/history/daily"
            ? "not json"
            : JSON.stringify(data[path]),
        ),
    );
    render(await Home());
    expect(screen.getAllByText("Positions available")).toHaveLength(2);
    expect(screen.queryByText("Daily chart available")).toBeNull();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
