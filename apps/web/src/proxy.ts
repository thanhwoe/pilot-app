import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/session-cookie";

/**
 * Sends signed-out visitors to sign-in, and signed-in ones away from it. It only checks that the cookie exists and never calls the
 * API: the home page's `GET /me` decides whether the session is valid.
 */
export function proxy(request: NextRequest) {
  // Server Actions post to the page they live on; redirect page loads only, never those.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (request.nextUrl.pathname === "/" && !hasSession) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (request.nextUrl.pathname === "/sign-in" && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/sign-in"],
};
