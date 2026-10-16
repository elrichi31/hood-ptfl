/** Process-local successful-result cache; concurrent requests share one build. */
export function cacheAsync<T>(
  load: () => Promise<T>,
  ttlMs: number,
  now = Date.now
): () => Promise<T> {
  let cached: { value: T; until: number } | undefined
  let inflight: Promise<T> | undefined
  return () => {
    if (cached && now() < cached.until) return Promise.resolve(cached.value)
    inflight ??= Promise.resolve()
      .then(load)
      .then((value) => {
        cached = { value, until: now() + ttlMs }
        return value
      })
      .finally(() => {
        inflight = undefined
      })
    return inflight
  }
}
