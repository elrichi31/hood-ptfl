import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";

// Feeds the top-bar orders menu from the poller's last pull (never live).
export async function GET(req: NextRequest) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = await backend("/api/v1/latest");
  if (!res.ok) return NextResponse.json({ orders: [] });
  const { orders } = await res.json();
  return NextResponse.json({ orders: orders ?? [] });
}
