import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";

// Proxies the browser's on-demand "enrich this position" click to the internal
// backend — the browser never talks to :3333 directly (see PRODUCT.md).
// middleware.ts only checks cookie presence, so validate the session for real here.
export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { symbol } = await params;
  if (!/^[A-Za-z0-9.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  const res = await backend(`/api/v1/symbol/${encodeURIComponent(symbol)}`);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
