import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import Home from "@/app/(app)/page";
import { backend } from "@/lib/backend";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { name: "Nicolas" } }) } } }));
vi.mock("@/lib/tz", () => ({ viewerTz: async () => "America/New_York" }));
vi.mock("@/lib/backend", () => ({ backend: vi.fn() }));
vi.mock("@/components/PortfolioExplorer", () => ({ PortfolioExplorer: () => <div>Portfolio chart available</div> }));
vi.mock("@/components/DailyPnlChart", () => ({ DailyPnlChart: () => <div>Daily chart available</div> }));
vi.mock("@/components/AnalysisCharts", () => ({ AllocationChart: () => <div>Allocation</div>, TopMoversChart: () => <div>Movers</div> }));
vi.mock("@/components/PositionsTable", () => ({ PositionsTable: ({ references }: { references?: Record<string, Record<string, number>> }) => <div data-reference={references?.AAA?.["1Y"]}>Positions available</div> }));
vi.mock("@/components/LivePrices", () => ({
  LivePricesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  LiveTotal: () => <span>100</span>, LiveToday: () => <span>Today</span>, LiveQuoteStatus: () => <span>Quotes</span>,
}));

const fixtures: Record<string, unknown> = {
  "/api/v1/latest": { at: "2026-10-16T15:00:00Z", balance: { total: 100, accounts: [] }, positions: { equities: [{ symbol: "AAA", quantity: 1, avgCost: 90, price: 100, value: 100 }], crypto: [] }, pnl: null },
  "/api/v1/history": [],
  "/api/v1/history/positions": { at: [], total: [], cash: [], symbols: {} },
  "/api/v1/history/daily": [],
};

it("returns the main dashboard without waiting for historical reference prices", async () => {
  let release: ((r: Response) => void) | undefined;
  const slowReferences = new Promise<Response>((resolve) => { release = resolve; });
  vi.mocked(backend).mockImplementation((path) => path === "/api/v1/history/references" ? slowReferences : Promise.resolve(Response.json(fixtures[path])));
  let ready = false;
  const page = Home().then((result) => { ready = true; return result; });
  try {
    await vi.waitFor(() => expect(ready).toBe(true), { timeout: 150, interval: 10 });
  } finally {
    release!(Response.json({ AAA: { "1Y": 70 } }));
    await page;
  }
});

it("streams the dashboard and usable holdings before slow reference prices finish", async () => {
  let release!: (r: Response) => void;
  const slowReferences = new Promise<Response>((resolve) => { release = resolve; });
  vi.mocked(backend).mockImplementation((path) => path === "/api/v1/history/references" ? slowReferences : Promise.resolve(Response.json(fixtures[path])));
  const stream = await renderToReadableStream(await Home());
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let shell = "";
  try {
    while (!shell.includes("Loading historical returns")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      shell += decoder.decode(chunk.value);
    }
    expect(shell).toContain("Portfolio chart available");
    expect(shell).toContain("Positions available");
    expect(shell).not.toContain('data-reference="70"');
  } finally {
    release(Response.json({ AAA: { "1Y": 70 } }));
  }
  let completed = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    completed += decoder.decode(chunk.value);
  }
  expect(completed).toContain('data-reference="70"');
});

it.each(["http", "invalid", "json", "network", "timeout"])("isolates reference %s failures in the streamed holdings section", async (failure) => {
  vi.mocked(backend).mockImplementation(async (path) => {
    if (path !== "/api/v1/history/references") return Response.json(fixtures[path]);
    if (failure === "http") return new Response("Unavailable", { status: 503 });
    if (failure === "invalid") return Response.json({ AAA: { "1Y": "invalid" } });
    if (failure === "json") return new Response("not JSON");
    throw failure === "timeout" ? new DOMException("timeout", "TimeoutError") : new TypeError("offline");
  });
  const html = await new Response(await renderToReadableStream(await Home())).text();
  expect(html).toContain("Portfolio chart available");
  expect(html).toContain("Positions available");
  expect(html).toContain("Position returns are partially unavailable:");
  expect(html).toContain("Retry");
  expect(html).not.toContain("Some sections could not load.");
});
