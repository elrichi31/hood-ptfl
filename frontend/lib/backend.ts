const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3333";

/** Server-side only: calls the internal backend with the shared secret it requires. */
export const backend = (path: string) =>
  fetch(`${BACKEND_URL}${path}`, {
    cache: "no-store",
    headers: { "x-internal-token": process.env.BACKEND_TOKEN ?? "" },
  });
