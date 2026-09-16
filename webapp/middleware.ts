import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// STEP 6 item 2: every request gets a correlation id - reuses an inbound
// X-Request-Id (e.g. set by a reverse proxy/load balancer) if present, else
// generates one. Route handlers read it via request.headers.get("x-request-id")
// and attach it to every structured log line (lib/logger.ts) for that
// request, and it's echoed back on the response so a client/proxy can
// correlate its own logs too.
export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
