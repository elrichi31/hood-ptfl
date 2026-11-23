// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/alerts/route";
import { backend } from "@/lib/backend";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: {} }) } } }));
vi.mock("@/lib/backend", () => ({ backend: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
const now = new Date().toISOString();
const newsFeed = { events: [{ id: "n1", headline: "NVDA guidance", tickers: ["NVDA"], publishedAt: now, alert: "now", sources: [{ name: "x", url: "https://x.example" }] }] };
const request = () => new NextRequest("http://localhost/api/alerts");

describe("/api/alerts resilience", () => {
  it("still returns news alerts when insiders time out", async () => {
    vi.mocked(backend).mockImplementation(async (path) => {
      if (path.endsWith("/news")) return Response.json(newsFeed);
      throw timeout();
    });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.items[0].id).toBe("n1");
  });

  it("returns an empty bell instead of throwing when both sources fail", async () => {
    vi.mocked(backend).mockRejectedValue(timeout());
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0, latest: null, items: [] });
  });

  it("ignores malformed JSON from one source", async () => {
    vi.mocked(backend).mockImplementation(async (path) =>
      path.endsWith("/news") ? Response.json(newsFeed) : new Response("<html>not json</html>"),
    );
    const res = await GET(request());
    expect((await res.json()).count).toBe(1);
  });
});
