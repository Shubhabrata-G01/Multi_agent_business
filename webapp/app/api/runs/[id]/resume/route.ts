import { NextResponse } from "next/server";
import { resumeRun } from "@/lib/orchestrator";

/**
 * Resumes a "held" run (a run that paused at a stage gate after exhausting
 * its bounded retries - see evaluateGate in webapp/lib/orchestrator.ts).
 * Since the API key is never persisted, the body may re-supply one; if
 * omitted, resumeRun falls back to the server env var, same as starting a
 * fresh run.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // No body supplied is fine - apiKey stays undefined below.
  }
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const apiKey =
    typeof obj.apiKey === "string" && obj.apiKey.trim() ? obj.apiKey.trim() : undefined;

  try {
    resumeRun(id, apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found")
      ? 404
      : message.includes("is not held")
        ? 409
        : message.includes("No API key supplied")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ status: "resuming" });
}
