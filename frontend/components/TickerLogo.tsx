"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Company / coin logo by ticker, served by this app's own /api/logo proxy (which picks the source:
 * Parqet/FMP for stocks and ETFs, crypto icon sets for coins). Anything that fails — or hangs — falls
 * back to a colored monogram, so a row never shows an empty tile.
 */
const HANG_MS = 6000;

function tickerHue(symbol: string) {
  let hash = 0;
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

export function TickerLogo({ symbol, crypto = false, size = 32 }: { symbol: string; crypto?: boolean; size?: number }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const box = { width: size, height: size };

  useEffect(() => {
    const el = img.current;
    if (!el) return;
    // The server-rendered <img> can fail before React hydrates, and then onError never fires.
    if (el.complete) {
      if (el.naturalWidth === 0) setFailed(true);
      return;
    }
    // A request that neither loads nor errors (blocked network) would otherwise leave the tile blank.
    const t = setTimeout(() => {
      if (!el.complete || el.naturalWidth === 0) setFailed(true);
    }, HANG_MS);
    el.addEventListener("load", () => clearTimeout(t), { once: true });
    return () => clearTimeout(t);
  }, []);

  if (failed) {
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
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny same-origin logos, cached a week; next/image adds nothing here */}
      <img
        ref={img}
        src={`/api/logo/${encodeURIComponent(symbol)}${crypto ? "?crypto=1" : ""}`}
        alt=""
        decoding="async"
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
