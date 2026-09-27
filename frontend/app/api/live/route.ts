import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";

// Pipes the backend's live-price SSE stream to the browser (which never talks to :3333 directly).
// Passing req.signal closes the upstream connection as soon as the tab goes away.
export async function GET(req: NextRequest) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = await backend("/api/v1/live", { signal: req.signal });
  if (!res.ok || !res.body)
    return new NextResponse(null, { status: res.status || 502 });
  return new Response(res.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
