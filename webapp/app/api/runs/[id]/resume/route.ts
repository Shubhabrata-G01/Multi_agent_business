import { NextResponse } from "next/server";
import { resumeRun } from "@/lib/orchestrator";

/**
 * Resumes a "held" run (paused at a stage gate - see evaluateGate in
 * webapp/lib/orchestrator.ts) or a "failed" one (replays whatever step it
 * failed on as a fresh attempt). The body may supply an apiKey; if omitted,
 * resumeRun tries the short-lived in-memory key cache
 * (webapp/lib/keyCache.ts) first, then the server env var, same as starting
 * a fresh run - the "No API key supplied" error below is what the UI uses
 * to decide whether to prompt for one.
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
      : message.includes("cannot be resumed")
        ? 409
        : message.includes("No API key supplied")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ status: "resuming" });
}
