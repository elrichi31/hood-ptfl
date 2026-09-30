import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortfolioExplorer, type PositionHistory } from "@/components/PortfolioExplorer";

// Isolate network/router and SVG sizing, but render the real number animation component.
vi.mock("@/components/LivePrices", () => ({ useLiveHistory: (h: PositionHistory) => h }));
vi.mock("@/components/PortfolioChart", () => ({ PortfolioChart: () => <div /> }));

const history: PositionHistory = {
  at: ["2026-09-28T20:00:00Z", "2026-09-29T20:00:00Z", "2026-09-30T15:00:00Z"],
  total: [1000, 1100, 1200.25], cash: [1000, 1100, 1200.25], symbols: {},
};
type AnimatedElement = HTMLElement & {
  _data: { value: number }; transformTiming: EffectTiming; respectMotionPreference: boolean;
};
function headline(container: HTMLElement) {
  const element = container.querySelector<AnimatedElement>("number-flow-react");
  expect(element, "Portfolio headline must use animated digits, not static text").not.toBeNull();
  return element!;
}

describe("PortfolioExplorer animated headline", () => {
  it("labels the available window honestly and shows its actual dates", () => {
    const { container, getAllByRole, getByText, queryAllByRole } = render(
      <PortfolioExplorer history={history} tz="America/New_York" />
    );
    expect(queryAllByRole("tab", { name: "All" })).toHaveLength(0);
    fireEvent.click(getAllByRole("tab", { name: "Available" })[0]);
    expect(getByText("Available history · up to 90 days")).toBeTruthy();
    const dates = container.querySelectorAll("time");
    expect(Array.from(dates, (date) => date.dateTime)).toEqual([history.at[0], history.at[2]]);
    expect(dates[0].textContent).toBe("Sep 28, 2026");
    expect(dates[1].textContent).toBe("Sep 30, 2026");
    expect(headline(container)._data.value).toBe(1200.25);
  });
  it("renders the latest USD value with rolling digits and reduced-motion support", () => {
    const { container } = render(<PortfolioExplorer history={history} tz="America/New_York" />);
    const element = headline(container);
    expect(element._data.value).toBe(1200.25);
    expect(element.transformTiming.duration).toBe(450);
    expect(element.respectMotionPreference).toBe(true);
  });

  it("updates the same animation element on rising and falling portfolio values", () => {
    const { container, rerender } = render(<PortfolioExplorer history={history} tz="America/New_York" />);
    const element = headline(container);
    for (const value of [1250.5, 1150.75, 0]) {
      rerender(<PortfolioExplorer history={{ ...history, total: [1000, 1100, value] }} tz="America/New_York" />);
      expect(headline(container)).toBe(element);
      expect(element._data.value).toBe(value);
    }
  });

  it("keeps the latest total and animation instance when switching ranges", () => {
    const { container, getAllByRole } = render(<PortfolioExplorer history={history} tz="America/New_York" />);
    const element = headline(container);
    fireEvent.click(getAllByRole("tab", { name: "Available" })[0]);
    expect(headline(container)).toBe(element);
    expect(element._data.value).toBe(1200.25);
  });
});
