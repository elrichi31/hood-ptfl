import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PositionsTable } from "@/components/PositionsTable";
import { PortfolioExplorer, type PositionHistory } from "@/components/PortfolioExplorer";
import { PortfolioChart } from "@/components/PortfolioChart";

// Keep the real table, request lifecycle and chart. Only replace the portal/animation shell.
vi.mock("@heroui/react", () => {
  const Frame = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Modal: {
    Root: ({ children, isOpen, onOpenChange }: { children: ReactNode; isOpen: boolean; onOpenChange: (open: boolean) => void }) => isOpen ? <div role="dialog"><button onClick={() => onOpenChange(false)}>Close</button>{children}</div> : null,
    Backdrop: Frame, Container: Frame, Dialog: Frame, Header: Frame, Heading: Frame, Body: Frame,
  } };
});
vi.mock("@/components/LivePrices", () => ({ useLivePrices: () => ({ prices: {} }), useLiveHistory: (h: PositionHistory) => h }));
vi.mock("@/components/LiveNumber", () => ({ LiveNumber: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock("@/lib/useWidth", () => ({ useWidth: () => [null, 760] }));
const rows = ["AAA", "BBB"].map((symbol) => ({ symbol, quantity: 1, avgCost: 100, price: 100, value: 100 }));
const details = (symbol: string, sector: string | null = "Technology") => ({ symbol, sector, marketCap: null, peRatio: null, dividendYield: null, high52w: null, low52w: null, nextEarningsDate: null, rsi: null, analystRatings: null });
const fetchMock = vi.fn();
function table() { return render(<PositionsTable rows={rows} enrichable tz="UTC" />); }
function open(symbol: string) { fireEvent.click(screen.getByText(symbol).closest("tr")!); }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("PointerEvent", MouseEvent); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("does not reuse another symbol's details after an HTTP failure and lets the viewer retry", async () => {
  fetchMock.mockResolvedValueOnce(response(details("AAA"))).mockResolvedValueOnce(response({ error: "Unavailable" }, 503)).mockResolvedValueOnce(response(details("BBB", "Energy")));
  table(); open("AAA");
  expect(await screen.findByText("Technology")).toBeTruthy();
  fireEvent.click(screen.getByText("Close")); open("BBB");
  expect(screen.queryByText("Technology")).toBeNull();
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Energy")).toBeTruthy();
});
it.each(["network", "json", "invalid"])("shows a recoverable error for %s failures", async (kind) => {
  if (kind === "network") fetchMock.mockRejectedValueOnce(new Error("Offline"));
  else if (kind === "json") fetchMock.mockResolvedValueOnce(new Response("not JSON"));
  else fetchMock.mockResolvedValueOnce(response({ error: "Not details" }));
  table(); open("AAA");
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
});
it("shows a useful empty state when no enrichment is available", async () => {
  fetchMock.mockResolvedValueOnce(response(details("AAA", null)));
  table(); open("AAA");
  expect(await screen.findByText(/No additional details available/)).toBeTruthy();
});
it("aborts a closed request and ignores its late result after another symbol opens", async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })).mockResolvedValueOnce(response(details("BBB", "Energy")));
  table(); open("AAA");
  const signal = fetchMock.mock.calls[0][1]?.signal;
  fireEvent.click(screen.getByText("Close"));
  expect(signal?.aborted).toBe(true);
  open("BBB"); expect(await screen.findByText("Energy")).toBeTruthy();
  await act(async () => { finish(response(details("AAA"))); });
  expect(screen.queryByText("Technology")).toBeNull();
});

function hoverLast(container: HTMLElement) { fireEvent.pointerMove(container.querySelector("svg")!, { clientX: 684 }); }
it.each([50, -50])("separates a cash flow of %s from investment P&L", (flow) => {
  const h: PositionHistory = { at: ["2026-09-29T15:00:00Z", "2026-09-29T15:05:00Z"], total: [100, 110 + flow], cash: [0, flow], symbols: { AAA: { type: "stock", qty: [1, 1], price: [100, 110] } } };
  const { container } = render(<PortfolioExplorer history={h} tz="UTC" />);
  hoverLast(container);
  expect(screen.getByText(/Balance change/).textContent).toContain(flow > 0 ? "+$60.00" : "-$40.00");
  expect(screen.getByText(/Adjusted P&L/).textContent).toContain("+$10.00");
});
it("does not treat a share purchase as a cash flow gain", () => {
  const h: PositionHistory = { at: ["2026-09-29T15:00:00Z", "2026-09-29T15:05:00Z"], total: [200, 210], cash: [100, 0], symbols: { AAA: { type: "stock", qty: [1, 2], price: [100, 105] } } };
  const { container } = render(<PortfolioExplorer history={h} tz="UTC" />);
  hoverLast(container);
  expect(screen.getByText(/Adjusted P&L/).textContent).toContain("+$5.00");
});
it("does not show an infinite percentage when the initial balance is zero", () => {
  const { container } = render(<PortfolioChart data={[{ at: "2026-09-29T15:00:00Z", totalValue: 0, cash: 0 }, { at: "2026-09-29T15:05:00Z", totalValue: 50, cash: 50 }]} />);
  hoverLast(container);
  expect(container.textContent).not.toMatch(/Infinity|NaN/);
  expect(screen.getByText(/Balance change/).textContent).toContain("—");
  expect(screen.queryByText(/Adjusted P&L/)).toBeNull();
  expect(screen.queryByText(/P&L excludes deposits/)).toBeNull();
});
it("does not display invalid hover markers after shortening the chart range", () => {
  const points = [100, 105, 110].map((totalValue, i) => ({ at: `2026-09-29T15:${String(i * 5).padStart(2, "0")}:00Z`, totalValue, cash: 0 }));
  const view = render(<PortfolioChart data={points} />);
  hoverLast(view.container);
  view.rerender(<PortfolioChart data={points.slice(0, 2)} />);
  expect(view.container.innerHTML).not.toContain("NaN");
});
