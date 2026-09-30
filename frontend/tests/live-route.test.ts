// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/live/route";
import { backend } from "@/lib/backend";
vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession: vi.fn(async () => ({ user: { name: "Nicolas" } })) },
  },
}));
vi.mock("@/lib/backend", () => ({ backend: vi.fn() }));

describe("SSE proxy", () => {
  it("opts out of ordinary request timeout and preserves disconnect cancellation", async () => {
    vi.mocked(backend).mockResolvedValue(new Response("data: {}\n\n"));
    const request = new NextRequest("http://localhost/api/live");
    const response = await GET(request);
    expect(backend).toHaveBeenCalledWith(
      "/api/v1/live",
      { signal: request.signal },
      { timeoutMs: null },
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe("data: {}\n\n");
  });
  it("returns 502 for an upstream transport failure so EventSource can retry", async () => {
    vi.mocked(backend).mockRejectedValue(new TypeError("fetch failed"));
    expect(
      (await GET(new NextRequest("http://localhost/api/live"))).status,
    ).toBe(502);
  });
});
