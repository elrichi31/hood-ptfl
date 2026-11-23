import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";

// Only these reach the backend; everything else in the query string is dropped.
const ALLOWED = ["limit", "offset", "sort", "category", "ticker", "source", "q"];

/** Pages of news cards for the News screen ("show more" and filter changes). */
export async function GET(req: NextRequest) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URLSearchParams();
  for (const key of ALLOWED) {
    const value = req.nextUrl.searchParams.get(key);
    if (value !== null) params.set(key, value);
  }
  try {
    const res = await backend(`/api/v1/news/page?${params}`);
    if (!res.ok) return NextResponse.json({ error: "News unavailable" }, { status: res.status === 400 ? 400 : 502 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "News unavailable" }, { status: 504 });
  }
}
