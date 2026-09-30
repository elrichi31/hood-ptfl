import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";

// SSE must outlive ordinary request deadlines; caller cancellation still closes upstream.
export async function GET(req: NextRequest) {
  if (!(await auth.api.getSession({ headers: req.headers }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const res = await backend(
      "/api/v1/live",
      { signal: req.signal },
      { timeoutMs: null },
    );
    if (!res.ok || !res.body)
      return new NextResponse(null, { status: res.ok ? 502 : res.status });
    return new Response(res.body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
