"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks an element's rendered width, so charts draw in real pixels. Scaling a fixed 760-wide
 * viewBox down to a phone shrank 10px labels to ~4px.
 */
export function useWidth<T extends HTMLElement>(fallback = 760) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}
