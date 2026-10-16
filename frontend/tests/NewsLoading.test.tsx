import { expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import News from "@/app/(app)/news/page";
import { backend } from "@/lib/backend";
import { getMockNewsFeed } from "@/lib/news";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: {} }) } } }));
vi.mock("@/lib/tz", () => ({ viewerTz: async () => "UTC" }));
vi.mock("@/lib/backend", () => ({ backend: vi.fn() }));

it("shows interactive news before history completes, then enriches without resetting filters", async () => {
  let release!: (r: Response) => void;
  const history = new Promise<Response>((resolve) => { release = resolve; });
  vi.mocked(backend).mockImplementation(async (path) => {
    if (path.endsWith("/news")) return Response.json(getMockNewsFeed());
    if (path.endsWith("/latest")) return Response.json({ positions: { equities: [{ symbol: "MSTR", price: 110, value: 110, prevClose: 100, prevCloseDate: "2020-01-01" }], crypto: [] } });
    return history;
  });
  let ready = false;
  const page = News().then((node) => { ready = true; return node; });
  try {
    await vi.waitFor(() => expect(ready).toBe(true), { timeout: 150 });
    render(await page);
    expect(screen.getByText("News Intelligence")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Loading portfolio");
    fireEvent.change(screen.getByPlaceholderText("Search news..."), { target: { value: "bitcoin" } });
  } finally {
    await act(async () => { release(Response.json({ at: [], symbols: {} })); await page; });
  }
  expect(screen.getByPlaceholderText("Search news...")).toHaveProperty("value", "bitcoin");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getAllByText("+10.00%").length).toBeGreaterThan(0);
});

it.each(["http", "network", "json"])("keeps the feed usable when portfolio enrichment fails with %s", async (failure) => {
  vi.mocked(backend).mockImplementation(async (path) => {
    if (path.endsWith("/news")) return Response.json(getMockNewsFeed());
    if (failure === "network") throw new TypeError("offline");
    return failure === "http" ? new Response(null, { status: 503 }) : new Response("not JSON");
  });
  render(await News());
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("News is still available"));
  expect(screen.getByText("News Intelligence")).toBeTruthy();
  expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("No news on your holdings yet.")).toBeNull();
});

it("shows a retry rather than demo news when the feed request fails", async () => {
  vi.mocked(backend).mockRejectedValue(new TypeError("offline"));
  render(await News());
  expect(screen.getByRole("alert").textContent).toContain("Could not load news");
  expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
});
