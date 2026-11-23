import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewsIntelligence } from "@/components/news/NewsIntelligence";
import { mockEvents, pageFrom } from "./newsFixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

const events = mockEvents();
const SIZE = 3;

function stubApi(handler: (url: URL) => Response | Promise<Response>) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => handler(new URL(String(input), "http://localhost")));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("renders only the first page and appends the next one on demand", async () => {
  const fetcher = stubApi((url) => {
    expect(url.pathname).toBe("/api/news");
    return Response.json(pageFrom(events, SIZE, Number(url.searchParams.get("offset")), false));
  });
  render(<NewsIntelligence feed={pageFrom(events, SIZE)} />);

  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(SIZE);
  expect(screen.getByText(`Showing ${SIZE} of ${events.length}`)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Show more stories" }));
  await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(SIZE * 2));
  expect(new URL(String(fetcher.mock.calls[0][0]), "http://localhost").searchParams.get("offset")).toBe(String(SIZE));
  expect(screen.getByText(`Showing ${SIZE * 2} of ${events.length}`)).toBeTruthy();
});

it("hides the button once everything is loaded", () => {
  render(<NewsIntelligence feed={pageFrom(events, events.length)} />);
  expect(screen.queryByRole("button", { name: "Show more stories" })).toBeNull();
});

it("asks the server for page 1 with the chosen filters instead of filtering locally", async () => {
  const filtered = events.filter((e) => e.impact === "high");
  const fetcher = stubApi(() => Response.json(pageFrom(filtered, SIZE, 0, false)));
  render(<NewsIntelligence feed={pageFrom(events, SIZE)} />);

  fireEvent.click(screen.getByRole("button", { name: "High Impact" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const params = new URL(String(fetcher.mock.calls[0][0]), "http://localhost").searchParams;
  expect(params.get("category")).toBe("high-impact");
  expect(params.get("offset")).toBe("0");
  await waitFor(() => expect(screen.getByText(`Showing ${Math.min(SIZE, filtered.length)} of ${filtered.length}`)).toBeTruthy());
});

it("debounces search so typing sends one request", async () => {
  const fetcher = stubApi(() => Response.json(pageFrom(events, SIZE, 0, false)));
  render(<NewsIntelligence feed={pageFrom(events, SIZE)} />);
  const box = screen.getByPlaceholderText("Search news...");
  for (const text of ["b", "bi", "bit"]) fireEvent.change(box, { target: { value: text } });
  expect(fetcher).not.toHaveBeenCalled();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1), { timeout: 1500 });
  expect(new URL(String(fetcher.mock.calls[0][0]), "http://localhost").searchParams.get("q")).toBe("bit");
});

it("keeps the current stories and offers a retry when loading more fails", async () => {
  stubApi(() => new Response(null, { status: 502 }));
  render(<NewsIntelligence feed={pageFrom(events, SIZE)} />);
  fireEvent.click(screen.getByRole("button", { name: "Show more stories" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not load more stories"));
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(SIZE);
  expect(screen.getByRole("button", { name: "Show more stories" })).toBeTruthy();
});
