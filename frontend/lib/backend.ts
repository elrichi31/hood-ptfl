const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3333";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Server-side only. Ordinary requests have a deadline; SSE explicitly opts out. */
export const backend = (
  path: string,
  init?: RequestInit,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number | null } = {},
) => {
  const deadline = timeoutMs === null ? null : AbortSignal.timeout(timeoutMs);
  const signal = deadline
    ? init?.signal
      ? AbortSignal.any([init.signal, deadline])
      : deadline
    : init?.signal;
  const headers = new Headers(init?.headers);
  headers.set("x-internal-token", process.env.BACKEND_TOKEN ?? "");
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    signal,
    cache: "no-store",
    headers,
  });
};
