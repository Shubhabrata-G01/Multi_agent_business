import { NextResponse } from "next/server";
import { collectMetrics, renderPrometheusText } from "@/lib/metrics";
import { getStorageBackend } from "@/lib/storageBackend";

/**
 * Prometheus-format metrics (STEP 6 item 3). Postgres-only - filesystem mode
 * has no Run/Job/UsageEvent tables to query, so this returns 501 there
 * rather than a page of zeros that could be mistaken for "genuinely idle."
 * Not behind auth: this is the conventional scrape contract (a metrics
 * scraper is a trusted internal caller, same as any other Prometheus
 * target) - put a network-level restriction in front of it in production if
 * this endpoint shouldn't be public.
 */
export async function GET() {
  if (getStorageBackend() !== "postgres") {
    return NextResponse.json(
      { error: "Metrics require the PostgreSQL storage backend." },
      { status: 501 },
    );
  }
  const samples = await collectMetrics();
  return new NextResponse(renderPrometheusText(samples), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
