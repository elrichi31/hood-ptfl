import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

/** Cookie-presence check only (edge-safe) — real session validation happens server-side. */
export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // api/logo: public company/coin logos (see app/api/logo), cached by the browser for a week.
  matcher: ["/((?!api/auth|api/logo|login|signup|_next/static|_next/image|favicon.ico).*)"],
};
