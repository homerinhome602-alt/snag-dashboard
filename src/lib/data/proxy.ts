import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

// Runs on every request (see src/proxy.ts). Redirects unauthenticated traffic
// to /login, leaving the auth screens reachable. jose verifies the JWT on the
// Edge runtime without any Node APIs.
export async function updateSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = await verifySessionToken(token);

  const isPublicPath =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/api/me") ||
    request.nextUrl.pathname.startsWith("/api/rpc") ||
    request.nextUrl.pathname.startsWith("/api/attachments");

  if (!claims && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
