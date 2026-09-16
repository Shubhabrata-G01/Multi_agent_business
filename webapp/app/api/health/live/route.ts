import { NextResponse } from "next/server";

/**
 * Liveness (STEP 6 item 4): "is this process able to handle a request at
 * all" - no dependency checks, so a load balancer/orchestrator restarting a
 * genuinely wedged process never confuses "dependency is down" (readiness's
 * job) with "this process itself is dead."
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
