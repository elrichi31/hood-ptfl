/**
 * Largest-Triangle-Three-Buckets downsampling: keeps the first and last point and, for each bucket
 * in between, the point that forms the largest triangle with its neighbours — so peaks, dips and
 * the overall shape survive while the point count drops to `threshold`. Returns indices into
 * `values` (ascending), so callers can pick the matching rows from parallel arrays.
 */
export function lttbIndices(values: number[], threshold: number): number[] {
  const n = values.length;
  if (threshold >= n || threshold < 3) return values.map((_, i) => i);

  const picked = [0];
  const every = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Average of the next bucket (the "third point" of the triangle).
    const nextStart = Math.floor((i + 1) * every) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
    let avgX = 0;
    let avgY = 0;
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += j;
      avgY += values[j];
    }
    const len = nextEnd - nextStart || 1;
    avgX /= len;
    avgY /= len;

    // Pick the point in the current bucket with the largest triangle area.
    const start = Math.floor(i * every) + 1;
    const end = Math.floor((i + 1) * every) + 1;
    let best = start;
    let bestArea = -1;
    for (let j = start; j < end; j++) {
      const area = Math.abs((a - avgX) * (values[j] - values[a]) - (a - j) * (avgY - values[a]));
      if (area > bestArea) {
        bestArea = area;
        best = j;
      }
    }
    picked.push(best);
    a = best;
  }

  picked.push(n - 1);
  return picked;
}
