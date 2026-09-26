import { cookies } from "next/headers";

/** Viewer's IANA time zone from the cookie set in the root layout; ET until the first visit sets it. */
export async function viewerTz() {
  const tz = (await cookies()).get("tz")?.value;
  try {
    if (tz) new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz || "America/New_York";
  } catch {
    return "America/New_York";
  }
}
