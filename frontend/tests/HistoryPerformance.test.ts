import { expect, it } from "vitest";
import { prevCloseIndex, priceContext, robinhoodTodayHistory, type FullHist } from "@/lib/history";

it("limits Today calculations to the current baselines instead of rescanning older crypto history", () => {
  const count = 12000;
  const end = Date.parse("2026-10-16T15:00:00Z");
  const at = Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * 300000).toISOString());
  const price = Array.from({ length: count }, (_, i) => 100 + i / 100);
  const qty = Array<number>(count).fill(1);
  const base = prevCloseIndex(at);
  let oldPriceReads = 0;
  const prices = new Proxy(price, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key) && Number(key) < base) oldPriceReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  const h: FullHist = { at, total: price.map((p) => p * 2), cash: Array<number>(count).fill(0), symbols: {
    AAA: { type: "stock", qty, price }, BTC: { type: "crypto", qty, price: prices },
  } };
  const start = performance.now();
  const day = robinhoodTodayHistory(h, "America/New_York");
  console.log(JSON.stringify({ snapshots: count, todayPoints: count - day.from, oldPriceReads, elapsedMs: Number((performance.now() - start).toFixed(2)) }));
  expect(day.pnl).toBeCloseTo((price[count - 1] - price[base]) + (price[count - 1] - price[at.indexOf("2026-10-16T03:55:00.000Z")]), 8);
  expect(oldPriceReads).toBe(0);
  expect(day.path[day.path.length - 1]).toBe(day.pnl);
});

it("builds position sparklines from only the last week while preserving gaps and sampling", () => {
  const count = 5000;
  const end = Date.parse("2026-10-16T15:00:00Z");
  const at = Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * 300000).toISOString());
  const original = Array.from({ length: count }, (_, i) => i % 17 === 0 ? null : 100 + i / 100);
  const cutoff = end - 7 * 86400000;
  const week = original.filter((p, i): p is number => p !== null && Date.parse(at[i]) >= cutoff);
  const stride = Math.ceil(week.length / 60) || 1;
  const expected = week.filter((_, i) => i % stride === 0 || i === week.length - 1);
  let oldPriceReads = 0;
  const price = new Proxy(original, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key) && Date.parse(at[Number(key)]) < cutoff) oldPriceReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  const context = priceContext({ at, symbols: { AAA: { price } } }, "AAA");
  expect(context.week).toEqual(expected);
  expect(context.prevClose).not.toBeNull();
  expect(oldPriceReads).toBe(0);
});
