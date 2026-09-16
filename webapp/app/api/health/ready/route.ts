import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getReadiness } from "@/lib/health";

/**
 * Readiness (STEP 6 item 4): PostgreSQL connectivity + at least one live
 * worker (Postgres backend only). Returns 503 when not ready, so a load
 * balancer/orchestrator stops routing traffic to this instance until its
 * dependencies recover, rather than serving requests that will fail anyway.
 */
export async function GET() {
  const report = await getReadiness(prisma);
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
