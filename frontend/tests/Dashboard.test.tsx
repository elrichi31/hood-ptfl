import { render, screen } from "@testing-library/react";
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
afterEach(() => vi.clearAllMocks());

describe("Dashboard partial failures", () => {
  it.each([
    { type: "brokerage", nickname: { invalid: true }, cash: 100, totalValue: 100 },
    { type: { invalid: true }, nickname: null, cash: 100, totalValue: 100 },
  ])("isolates invalid account labels: %j", async (account) => {
    vi.mocked(backend).mockImplementation(
      async (path) =>
        new Response(
          JSON.stringify(
            path === "/api/v1/latest"
              ? { ...latest, balance: { ...latest.balance, accounts: [account] } }
              : data[path],
          ),
        ),
    );
    render(await Home());
    expect(screen.getByText("Portfolio chart available")).toBeTruthy();
    expect(screen.getByText("Daily chart available")).toBeTruthy();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Service returned invalid data. Please retry.").length,
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
