import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";

// Proxies the Risk page's trade simulator when it tries a symbol you don't hold (see symbolReturns).
export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { symbol } = await params;
  if (!/^[A-Za-z.]{1,6}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  const res = await backend(`/api/v1/risk/returns/${encodeURIComponent(symbol.toUpperCase())}`);
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
