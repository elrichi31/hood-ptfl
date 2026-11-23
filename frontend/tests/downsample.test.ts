import { describe, expect, it } from "vitest";
import { lttbIndices } from "@/lib/downsample";

describe("lttbIndices", () => {
  it("returns every index when under the threshold", () => {
    expect(lttbIndices([1, 2, 3, 4], 10)).toEqual([0, 1, 2, 3]);
  });

  it("keeps first/last, hits the target size and stays ascending", () => {
    const values = Array.from({ length: 2782 }, (_, i) => Math.sin(i / 40) * 100 + (i % 7));
    const idx = lttbIndices(values, 200);
    expect(idx).toHaveLength(200);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(values.length - 1);
    expect(idx.every((v, i) => i === 0 || v > idx[i - 1])).toBe(true);
  });

  it("preserves a lone spike", () => {
    const values = new Array(1000).fill(10);
    values[503] = 500;
    expect(lttbIndices(values, 50)).toContain(503);
  });
});
