// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { backend } from "@/lib/backend";

afterEach(() => vi.unstubAllGlobals());

describe("backend request deadlines", () => {
  it("adds a default deadline and preserves request headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await backend("/api/v1/latest", {
      headers: { Accept: "application/json" },
    });
    const init = fetcher.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
    expect(new Headers(init.headers).has("x-internal-token")).toBe(true);
    expect(init.cache).toBe("no-store");
  });

  it("aborts stalled requests", async () => {
    vi.stubGlobal(
      "fetch",
      (_: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          );
          // Keep the event loop alive until the native deadline fires.
          setTimeout(() => reject(new Error("request never aborted")), 100);
        }),
    );
    await expect(
      backend("/slow", undefined, { timeoutMs: 10 }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("lets SSE opt out of the deadline without losing caller cancellation", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(new Response("data: {}\n\n"));
    vi.stubGlobal("fetch", fetcher);
    await backend(
      "/api/v1/live",
      { signal: controller.signal },
      { timeoutMs: null },
    );
    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("honours caller cancellation alongside the default deadline", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await backend("/api/v1/latest", { signal: controller.signal });
    controller.abort();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
