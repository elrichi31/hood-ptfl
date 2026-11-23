import { getSectors } from '#services/enrichment'
import { heldPositions } from '#services/poller'

// Sectors almost never change, and a lookup costs one Robinhood call per 10 symbols, so keep them
// for a day. A symbol with no sector is retried sooner in case the fundamentals were just late.
const TTL_MS = 24 * 3600e3
const MISS_TTL_MS = 10 * 60e3
const cache = new Map<string, { at: number; sector: string | null }>()
let inflight: Promise<Record<string, string | null>> | null = null

const fresh = (c: { at: number; sector: string | null } | undefined) =>
  !!c && Date.now() - c.at < (c.sector === null ? MISS_TTL_MS : TTL_MS)

async function build(): Promise<Record<string, string | null>> {
  const { equities } = await heldPositions()
  const symbols = [...new Set(equities.map((p) => p.symbol))]
  const stale = symbols.filter((s) => !fresh(cache.get(s)))
  if (stale.length) {
    const found = await getSectors(stale)
    const at = Date.now()
    for (const s of stale) cache.set(s, { at, sector: found.get(s) ?? null })
  }
  return Object.fromEntries(symbols.map((s) => [s, cache.get(s)?.sector ?? null]))
}

/** Sector per currently held equity symbol (crypto has none; the dashboard labels it itself). */
export function getHeldSectors() {
  inflight ??= build().finally(() => (inflight = null))
  return inflight
}
