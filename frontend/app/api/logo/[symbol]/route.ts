import { NextRequest } from "next/server";

/**
 * Same-origin logo proxy for TickerLogo. The browser only ever asks this app, so a viewer whose network
 * can't reach a logo CDN (jsDelivr hung for one of them and left every crypto tile blank) still gets
 * logos. Sources are tried server-side in order, each with a timeout; the winner is cached in memory
 * and by the browser for a week.
 * - stocks & ETFs: Parqet (uniform app-icon squares), then FMP;
 * - crypto: the version-pinned cryptocurrency-icons package, nvstly, CoinCap. Parqet maps "BTC"/"USDC"
 *   to unrelated stocks, so crypto never goes there.
 */
const sources = (symbol: string, crypto: boolean) =>
  crypto
    ? [
        `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${symbol.toLowerCase()}.png`,
        `https://cdn.jsdelivr.net/gh/nvstly/icons@main/crypto_icons/${symbol}.png`,
        `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`,
      ]
    : [`https://assets.parqet.com/logos/symbol/${symbol}?format=png`, `https://financialmodelingprep.com/image-stock/${symbol}.png`];

// ponytail: unbounded in-memory cache — a portfolio + Discover is ~100 logos of a few KB. Add an LRU
// bound if this ever serves arbitrary tickers at scale.
const cache = new Map<string, { body: ArrayBuffer; type: string } | null>();

const WEEK = 7 * 24 * 3600;

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol.toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return new Response(null, { status: 400 });
  const crypto = req.nextUrl.searchParams.get("crypto") === "1";
  const key = `${crypto ? "c" : "s"}:${symbol}`;

  if (!cache.has(key)) {
    let found: { body: ArrayBuffer; type: string } | null = null;
    for (const url of sources(symbol, crypto)) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.startsWith("image/")) continue;
        const body = await res.arrayBuffer();
        if (body.byteLength < 100) continue; // empty placeholder
        found = { body, type };
        break;
      } catch {
        // timeout / network error: try the next source
      }
    }
    cache.set(key, found);
  }

  const hit = cache.get(key);
  if (!hit) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  return new Response(hit.body, {
    headers: { "content-type": hit.type, "cache-control": `public, max-age=${WEEK}, immutable` },
  });
}
