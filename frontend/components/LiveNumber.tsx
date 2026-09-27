"use client";

import { useEffect, useState } from "react";
import NumberFlow, { type Format } from "@number-flow/react";

const USD: Format = { style: "currency", currency: "USD" };

/**
 * A number that rolls its digits up or down when it changes (NumberFlow's odometer), and tints
 * green/red for a moment in the direction it moved — the Robinhood tick. Respects reduced motion.
 * `signed` shows a leading +/− (for P&L figures).
 */
export function LiveNumber({ value, format = USD, signed = false }: { value: number; format?: Format; signed?: boolean }) {
  // Previous value kept in state and compared during render (React's "adjust state on prop change"
  // pattern), so the flash starts on the same render as the new digits.
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  if (value !== prev) {
    setDir(value > prev ? 1 : -1);
    setPrev(value);
  }
  useEffect(() => {
    if (!dir) return;
    const t = setTimeout(() => setDir(0), 900);
    return () => clearTimeout(t);
  }, [dir, value]);

  return (
    <span
      className={`transition-colors duration-700 ${dir > 0 ? "text-[var(--success)]" : dir < 0 ? "text-[var(--danger)]" : ""}`}
    >
      <NumberFlow value={value} locales="en-US" format={signed ? { ...format, signDisplay: "always" } : format} />
    </span>
  );
}
