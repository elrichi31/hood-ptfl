"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Company / coin logo by ticker, all free and keyless:
 * - stocks & ETFs: Parqet's logo CDN (uniform app-icon squares), then FMP's image-stock as backup;
 * - crypto: the cryptocurrency-icons npm package on jsDelivr (version-pinned, immutable), then nvstly and
 *   CoinCap — Parqet resolves "BTC"/"USDC" to unrelated stocks, so crypto never goes there;
 * - anything that fails falls through to a colored monogram, so a row never shows an empty tile.
 */
const sources = (symbol: string, crypto: boolean) => {
  const s = encodeURIComponent(symbol);
  return crypto
    ? [
        `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${s.toLowerCase()}.png`,
        `https://cdn.jsdelivr.net/gh/nvstly/icons@main/crypto_icons/${s}.png`,
        `https://assets.coincap.io/assets/icons/${s.toLowerCase()}@2x.png`,
      ]
    : [`https://assets.parqet.com/logos/symbol/${s}?format=png`, `https://financialmodelingprep.com/image-stock/${s}.png`];
};

function tickerHue(symbol: string) {
  let hash = 0;
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

export function TickerLogo({ symbol, crypto = false, size = 32 }: { symbol: string; crypto?: boolean; size?: number }) {
  const [attempt, setAttempt] = useState(0);
  const img = useRef<HTMLImageElement>(null);
  const urls = sources(symbol, crypto);
  const box = { width: size, height: size };

  // The server-rendered <img> can fail before React hydrates, and then onError never fires — the
  // tile would stay empty. Catch that case on mount (and after each source switch).
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setAttempt((a) => a + 1);
  }, [attempt]);

  if (attempt >= urls.length) {
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
        style={{ ...box, fontSize: size * 0.34, background: `oklch(0.55 0.12 ${tickerHue(symbol)})` }}
      >
        {symbol.slice(0, 2)}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--surface-secondary)] ${crypto ? "p-[12%]" : ""}`}
      style={box}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- third-party logo CDNs, tiny images; next/image would need remotePatterns for each */}
      <img
        ref={img}
        key={urls[attempt]}
        src={urls[attempt]}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
        onError={() => setAttempt((a) => a + 1)}
      />
    </span>
  );
}
