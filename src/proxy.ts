import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken, isValidApiKey } from "@/lib/auth";

// Gate the whole site behind a password. Two ways in:
//   • Browser  → a signed session cookie set by /api/auth/login.
//   • iOS app  → the shared `x-api-key` header (API routes only).
// Everything else is redirected to /login (pages) or rejected with 401 (API).
export const config = {
  matcher: [
    // Run on every path except Next internals and the favicon. The login page
    // and auth API are allowed through inside the function below.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that must stay reachable without a session.
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const hasSession = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // API routes: a logged-in browser session OR the iOS app's API key.
  if (pathname.startsWith("/api/")) {
    if (hasSession || isValidApiKey(request.headers.get("x-api-key"))) {
      return NextResponse.next();
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Page routes: require a session, otherwise send to the login screen.
  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // Preserve where the user was headed so login can bounce them back.
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
