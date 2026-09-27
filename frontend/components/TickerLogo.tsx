"use client";

import { useState } from "react";

/**
 * Company / coin logo by ticker, all free and keyless:
 * - stocks & ETFs: Parqet's logo CDN (uniform app-icon squares), then FMP's image-stock as backup;
 * - crypto: nvstly/icons via jsDelivr (Parqet resolves "BTC"/"USDC" to unrelated stocks), on a dark tile
 *   because those marks are transparent (XRP's is white);
 * - anything that fails to load falls through to a colored monogram, so a row never shows a broken image.
 */
const sources = (symbol: string, crypto: boolean) =>
  crypto
    ? [`https://cdn.jsdelivr.net/gh/nvstly/icons@main/crypto_icons/${symbol}.png`]
    : [
        `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=png`,
        `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`,
      ];

function tickerHue(symbol: string) {
  let hash = 0;
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

export function TickerLogo({ symbol, crypto = false, size = 32 }: { symbol: string; crypto?: boolean; size?: number }) {
  const [attempt, setAttempt] = useState(0);
  const urls = sources(symbol, crypto);
  const box = { width: size, height: size };

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
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md ${crypto ? "bg-[#1f1f1f] p-[15%]" : "bg-[var(--surface-secondary)]"}`}
      style={box}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- third-party logo CDNs, tiny images; next/image would need remotePatterns for each */}
      <img
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
