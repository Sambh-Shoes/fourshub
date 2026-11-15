import { NextResponse, type NextRequest } from "next/server";

// Quick check before any page loads: no session cookie means go to login.
// The real check (is the session valid?) happens on each page via requireUser().
export function middleware(req: NextRequest) {
  if (!req.cookies.get("fh_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next|favicon.ico).*)"],
};
