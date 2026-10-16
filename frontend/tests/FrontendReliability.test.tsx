import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PortfolioExplorer, type PositionHistory } from "@/components/PortfolioExplorer";
import { PortfolioChart } from "@/components/PortfolioChart";
import { robinhoodToday } from "@/lib/history";

// Keep the real chart and calculations; isolate live data, animation and sizing.
vi.mock("@/components/LivePrices", () => ({ useLiveHistory: (h: PositionHistory) => h }));
vi.mock("@/components/LiveNumber", () => ({ LiveNumber: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock("@/lib/useWidth", () => ({ useWidth: () => [null, 760] }));
beforeEach(() => { localStorage.clear(); vi.stubGlobal("PointerEvent", MouseEvent); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function hoverLast(container: HTMLElement) { fireEvent.pointerMove(container.querySelector("svg")!, { clientX: 684 }); }
it.each([["America/New_York", 60], ["UTC", 70]] as const)("aligns 1D gains, curve and session totals with Today in %s", (tz, expected) => {
  const h: PositionHistory = {
    at: ["2026-10-14T20:00:00Z", "2026-10-14T23:00:00Z", "2026-10-15T03:55:00Z", "2026-10-15T04:05:00Z", "2026-10-15T15:00:00Z"],
    total: [200, 235, 250, 260, 350], cash: [0, 0, 0, 0, 50],
    symbols: {
      AAA: { type: "stock", qty: [1, 1, 1, 1, 1], price: [100, 105, 110, 115, 120] },
      BTC: { type: "crypto", qty: [1, 1, 1, 1, 1], price: [100, 130, 140, 145, 180] },
    },
  };
  const { container } = render(<PortfolioExplorer history={h} tz={tz} />);
  expect(robinhoodToday(h, tz).pnl).toBe(expected);
  fireEvent.click(screen.getByRole("button", { name: "Net gains" }));
  const card = screen.getByRole("heading", { name: "Net gains over time" }).closest("section")!;
  expect(card.querySelector(".text-2xl")?.textContent).toBe(String(expected));
  expect(card.querySelector(".text-sm.font-mono")?.textContent).toBe(tz === "UTC" ? "+35.00%" : "+30.00%");
  expect(card.textContent).toContain("Market hours +$40.00");
  expect(card.textContent).toContain(tz === "UTC" ? "After-hours & overnight +$30.00" : "After-hours & overnight +$20.00");
  hoverLast(container);
  expect(screen.getByText(`Net gains · +$${expected}.00`)).toBeTruthy();
  fireEvent.pointerMove(container.querySelector("svg")!, { clientX: 4 });
  expect(screen.getByText("Net gains · +$0.00")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("tab", { name: "Available" })[0]);
  expect(card.querySelector(".text-2xl")?.textContent).toBe("100");
});
it.each([50, -50])("plots net gains instead of portfolio value with a cash flow of %s", (flow) => {
  const h: PositionHistory = { at: ["2026-09-29T15:00:00Z", "2026-09-29T15:05:00Z", "2026-09-29T15:10:00Z"], total: [100, 110 + flow, 95 + flow], cash: [0, flow, flow], symbols: { AAA: { type: "stock", qty: [1, 1, 1], price: [100, 110, 95] } } };
  const { container } = render(<PortfolioExplorer history={h} tz="UTC" />);
  const portfolioPath = container.querySelector('path[fill="url(#pc-fill)"]')!.getAttribute("d");
  fireEvent.click(screen.getByRole("button", { name: "Net gains" }));
  const card = screen.getByRole("heading", { name: "Net gains over time" }).closest("section")!;
  expect(card.querySelector(".text-2xl")?.textContent).toBe("-5");
  expect(card.textContent).toContain("High $10.00");
  expect(card.textContent).toContain("Low -$5.00");
  expect(container.querySelector('path[fill="url(#pc-fill)"]')!.getAttribute("d")).not.toBe(portfolioPath);
  hoverLast(container);
  expect(screen.getByText("Net gains · -$5.00")).toBeTruthy();
  expect(screen.queryByText(/Balance change/)).toBeNull();
  expect(screen.getByText(/Excludes deposits and withdrawals/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Portfolio" }));
  expect(screen.getByRole("heading", { name: "Value over time" })).toBeTruthy();
  expect(card.querySelector(".text-2xl")?.textContent).toBe(String(95 + flow));
  expect(container.querySelector('path[fill="url(#pc-fill)"]')!.getAttribute("d")).toBe(portfolioPath);
});
it.each([50, -50])("separates a cash flow of %s from investment P&L", (flow) => {
  const h: PositionHistory = { at: ["2026-09-29T15:00:00Z", "2026-09-29T15:05:00Z"], total: [100, 110 + flow], cash: [0, flow], symbols: { AAA: { type: "stock", qty: [1, 1], price: [100, 110] } } };
  const { container } = render(<PortfolioExplorer history={h} tz="UTC" />);
  hoverLast(container);
  expect(screen.getByText(/Balance change/).textContent).toContain(flow > 0 ? "+$60.00" : "-$40.00");
  expect(screen.getByText(/Adjusted P&L/).textContent).toContain("+$10.00");
});
it("keeps crypto gains when local midnight precedes the securities close", () => {
  const h: PositionHistory = {
    at: ["2026-10-14T09:55:00Z", "2026-10-14T10:05:00Z", "2026-10-14T20:00:00Z", "2026-10-15T08:00:00Z"],
    total: [200, 220, 250, 275], cash: [0, 0, 0, 0],
    symbols: {
      AAA: { type: "stock", qty: [1, 1, 1, 1], price: [100, 110, 120, 125] },
      BTC: { type: "crypto", qty: [1, 1, 1, 1], price: [100, 110, 130, 150] },
    },
  };
  const { container } = render(<PortfolioExplorer history={h} tz="Pacific/Honolulu" />);
  fireEvent.click(screen.getByRole("button", { name: "Net gains" }));
  const card = screen.getByRole("heading", { name: "Net gains over time" }).closest("section")!;
  expect(card.querySelector(".text-2xl")?.textContent).toBe("55");
  expect(card.querySelector(".text-sm.font-mono")?.textContent).toBe("+22.00%");
  expect(card.querySelector("time")?.dateTime).toBe(h.at[0]);
  hoverLast(container);
  expect(screen.getByText("Net gains · +$55.00")).toBeTruthy();
});
it("rebases net gains when changing the selected period", () => {
  const h: PositionHistory = { at: ["2026-09-28T20:00:00Z", "2026-09-29T20:00:00Z", "2026-09-30T15:00:00Z"], total: [100, 120, 110], cash: [0, 0, 0], symbols: { AAA: { type: "stock", qty: [1, 1, 1], price: [100, 120, 110] } } };
  render(<PortfolioExplorer history={h} tz="UTC" />);
  fireEvent.click(screen.getByRole("button", { name: "Net gains" }));
  const card = screen.getByRole("heading", { name: "Net gains over time" }).closest("section")!;
  expect(card.querySelector(".text-2xl")?.textContent).toBe("-10");
  fireEvent.click(screen.getAllByRole("tab", { name: "Available" })[0]);
  expect(card.querySelector(".text-2xl")?.textContent).toBe("10");
  expect(screen.getByRole("button", { name: "Net gains" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getAllByRole("tab", { name: "1D" })[0]);
  expect(card.querySelector(".text-2xl")?.textContent).toBe("-10");
});
it("shows zero net gains for a cash-only deposit with a zero starting balance", () => {
  const h: PositionHistory = { at: ["2026-09-29T15:00:00Z", "2026-09-29T15:05:00Z"], total: [0, 50], cash: [0, 50], symbols: {} };
  const { container } = render(<PortfolioExplorer history={h} tz="UTC" />);
  fireEvent.click(screen.getByRole("button", { name: "Net gains" }));
  const card = screen.getByRole("heading", { name: "Net gains over time" }).closest("section")!;
  expect(card.querySelector(".text-2xl")?.textContent).toBe("0");
  hoverLast(container);
  expect(screen.getByText("Net gains · +$0.00")).toBeTruthy();
  expect(container.innerHTML).not.toMatch(/Infinity|NaN/);
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
