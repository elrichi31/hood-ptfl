import { expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server.browser";
import Alerts from "@/app/(app)/alerts/page";
import { backend } from "@/lib/backend";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: {} }) } } }));
vi.mock("@/lib/backend", () => ({ backend: vi.fn() }));
vi.mock("@/components/news/NewsIntelligence", () => ({ NewsCard: () => <div>Ready news story</div> }));
vi.mock("@/components/InsiderTrades", () => ({ InsiderTrades: () => <div>Ready insider trades</div> }));
const news = { events: [{ id: "1", alert: "now", publishedAt: "2026-10-16T12:00:00Z" }] };

it.each(["news", "insiders"])("streams the healthy Alerts section while %s is pending", async (slow) => {
  let release!: (r: Response) => void;
  const pending = new Promise<Response>((resolve) => { release = resolve; });
  vi.mocked(backend).mockImplementation((path) => path.endsWith(`/${slow}`) ? pending : Promise.resolve(Response.json(path.endsWith("/news") ? news : { trades: [] })));
  let ready = false;
  const page = Alerts().then((node) => { ready = true; return node; });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let html = "";
  const decoder = new TextDecoder();
  try {
    await vi.waitFor(() => expect(ready).toBe(true), { timeout: 150 });
    reader = (await renderToReadableStream(await page)).getReader();
    const expected = slow === "news" ? "Ready insider trades" : "Ready news story";
    while (!html.includes(expected)) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value);
    }
    expect(html).toContain(expected);
    expect(html).toContain("Loading");
  } finally {
    release(Response.json(slow === "news" ? news : { trades: [] }));
    await page;
  }
  if (reader) {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; html += decoder.decode(chunk.value); }
  }
  expect(html).toContain("Ready news story");
  expect(html).toContain("Ready insider trades");
});

it.each(["news", "insiders"])("isolates a failed %s request without losing the other section", async (failed) => {
  vi.mocked(backend).mockImplementation(async (path) => {
    if (path.endsWith(`/${failed}`)) throw new TypeError("offline");
    return Response.json(path.endsWith("/news") ? news : { trades: [] });
  });
  const html = await new Response(await renderToReadableStream(await Alerts())).text();
  expect(html).toContain(failed === "news" ? "Ready insider trades" : "Ready news story");
  expect(html).toContain(failed === "news" ? "Could not load <!-- -->news alerts" : "Could not load <!-- -->insider trades");
  expect(html).toContain("Retry");
});
