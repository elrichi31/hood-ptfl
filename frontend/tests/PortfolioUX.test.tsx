import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  PortfolioExplorer,
  type PositionHistory,
} from "@/components/PortfolioExplorer";
import { PortfolioChart } from "@/components/PortfolioChart";
vi.mock("@/components/LivePrices", () => ({
  useLiveHistory: (h: PositionHistory) => h,
}));
vi.mock("@/lib/useWidth", () => ({ useWidth: () => [null, 760] }));
const history: PositionHistory = {
  at: ["2026-09-30T00:30:00Z", "2026-09-30T02:30:00Z"],
  total: [100, 105],
  cash: [100, 105],
  symbols: {},
};
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("remembers the chosen range across mounts without overwriting it with the default", () => {
  const first = render(
    <PortfolioExplorer history={history} tz="America/New_York" />,
  );
  fireEvent.click(screen.getAllByRole("tab", { name: "1W" })[0]);
  expect(localStorage.getItem("hood:portfolio-range")).toBe("1W");
  first.unmount();
  render(<PortfolioExplorer history={history} tz="America/New_York" />);
  expect(
    screen
      .getAllByRole("tab", { name: "1W" })
      .every((t) => t.getAttribute("aria-selected") === "true"),
  ).toBe(true);
});
it("ignores an obsolete stored range and keeps working when storage is blocked", () => {
  localStorage.setItem("hood:portfolio-range", "invalid");
  render(<PortfolioExplorer history={history} tz="America/New_York" />);
  expect(
    screen.getAllByRole("tab", { name: "1D" })[0].getAttribute("aria-selected"),
  ).toBe("true");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  fireEvent.click(screen.getAllByRole("tab", { name: "1M" })[0]);
  expect(
    screen.getAllByRole("tab", { name: "1M" })[0].getAttribute("aria-selected"),
  ).toBe("true");
});
it("restores a valid saved range", () => {
  localStorage.setItem("hood:portfolio-range", "ALL");
  render(<PortfolioExplorer history={history} tz="America/New_York" />);
  expect(
    screen
      .getAllByRole("tab", { name: "Available" })[0]
      .getAttribute("aria-selected"),
  ).toBe("true");
});
it("explains empty history without telling the user to run a terminal command", () => {
  render(
    <PortfolioExplorer
      history={{ at: [], total: [], cash: [], symbols: {} }}
      tz="America/New_York"
    />,
  );
  expect(screen.queryByText(/portfolio:backfill/)).toBeNull();
  expect(
    screen.getByText(
      /every 5 minutes during market hours and every 30 minutes otherwise/,
    ),
  ).toBeTruthy();
});
it("uses the viewer timezone for axis labels and hover dates", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const { container } = render(
    <PortfolioExplorer history={history} tz="Pacific/Honolulu" />,
  );
  expect(screen.getByText("2:30 PM")).toBeTruthy();
  expect(screen.getByText("4:30 PM")).toBeTruthy();
  fireEvent.pointerMove(container.querySelector("svg")!, { clientX: 4 });
  expect(screen.getByText(/Tue, Sep 29, 2:30 PM/)).toBeTruthy();
});
it("describes both polling intervals for a single chart point", () => {
  render(
    <PortfolioChart
      data={[{ at: history.at[0], totalValue: 100, cash: 100 }]}
    />,
  );
  expect(
    screen.getByText(
      /every 5 minutes during market hours and every 30 minutes otherwise/,
    ),
  ).toBeTruthy();
});

it("keeps the default range when reading storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(<PortfolioExplorer history={history} tz="America/New_York" />);
  expect(
    screen.getAllByRole("tab", { name: "1D" })[0].getAttribute("aria-selected"),
  ).toBe("true");
});
it("does not draw a day separator at UTC midnight when both points are on the same viewer day", () => {
  const { container } = render(
    <PortfolioChart
      tz="Pacific/Honolulu"
      data={[
        { at: "2026-09-29T23:30:00Z", totalValue: 100, cash: 100 },
        { at: "2026-09-30T00:30:00Z", totalValue: 105, cash: 100 },
      ]}
    />,
  );
  expect(
    container.querySelectorAll('line[stroke-dasharray="2 3"]'),
  ).toHaveLength(0);
});
