// Same-origin enforcement for state-changing requests (STEP 4 item 12).
// Session auth is cookie-based (see auth.ts), so without this a cross-site
// page could ride the browser's ambient session cookie into a POST here.
// NextAuth's own sign-in/callback routes already carry their own CSRF token;
// this covers this app's own API routes, which don't.
import { NextResponse } from "next/server";

export function requireSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  const requestHost = request.headers.get("host");

  if (!origin) {
    // A browser fetch/form POST always sends Origin (or at least Referer);
    // absence is expected only for non-browser callers (curl, server-to-
    // server). This app is browser-first with cookie auth, so require it in
    // production; allow it in development for easy local curl testing.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Missing Origin header." }, { status: 403 });
    }
    return null;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Invalid Origin header." }, { status: 403 });
  }

  if (!requestHost || originHost !== requestHost) {
    return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
  }
  return null;
}
