import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PortfolioSyncStatus } from "@/components/PortfolioSyncStatus";

const checkedAt = Date.parse("2026-09-30T15:01:00Z");
const at = "2026-09-30T15:00:00Z";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(checkedAt);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("ignores a browser clock two hours ahead when aging a recent saved snapshot", () => {
  vi.setSystemTime(checkedAt + 2 * 60 * 60_000);
  render(
    <PortfolioSyncStatus at={at} tz="America/New_York" checkedAt={checkedAt} />,
  );
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.queryByText("Portfolio sync delayed")).toBeNull();
  expect(screen.getByText("Positions & cash · 2 min ago")).toBeTruthy();
});

it("still detects delayed sync when the browser clock is one hour behind", () => {
  vi.setSystemTime(checkedAt - 60 * 60_000);
  render(
    <PortfolioSyncStatus at={at} tz="America/New_York" checkedAt={checkedAt} />,
  );
  act(() => vi.advanceTimersByTime(40 * 60_000));
  expect(screen.getByText("Portfolio sync delayed")).toBeTruthy();
  expect(screen.getByText("Positions & cash · 41 min ago")).toBeTruthy();
});

it("does not rejuvenate saved data when the browser clock is corrected backwards", () => {
  const { container } = render(
    <PortfolioSyncStatus at={at} tz="America/New_York" checkedAt={checkedAt} />,
  );
  act(() => vi.advanceTimersByTime(40 * 60_000));
  vi.setSystemTime(checkedAt - 60 * 60_000);
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText("Portfolio sync delayed")).toBeTruthy();
  expect(screen.getByText("Positions & cash · 42 min ago")).toBeTruthy();
  expect(container.querySelector("time")!.dateTime).toBe(at);
});

it("rebases elapsed time on a new server response without carrying over the old elapsed time", () => {
  const { rerender, unmount } = render(
    <PortfolioSyncStatus at={at} tz="America/New_York" checkedAt={checkedAt} />,
  );
  act(() => vi.advanceTimersByTime(40 * 60_000));
  expect(screen.getByText("Portfolio sync delayed")).toBeTruthy();
  const updatedAt = checkedAt + 40 * 60_000;
  rerender(
    <PortfolioSyncStatus
      at={new Date(updatedAt).toISOString()}
      tz="America/New_York"
      checkedAt={updatedAt}
    />,
  );
  expect(screen.queryByText("Portfolio sync delayed")).toBeNull();
  expect(screen.getByText("Positions & cash · just now")).toBeTruthy();
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText("Positions & cash · 1 min ago")).toBeTruthy();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
