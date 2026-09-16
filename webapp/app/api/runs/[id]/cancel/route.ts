import { NextResponse } from "next/server";
import { cancelRun } from "@/lib/orchestrator";
import { requireOwnedRun } from "@/lib/apiAuth";

/**
 * Cancels a running or held run. The orchestrator's loop checks run status
 * every iteration (the same mechanism "held" already relies on), so this
 * takes effect within one iteration rather than killing anything mid-call.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authResult = await requireOwnedRun(id);
  if (authResult.response) return authResult.response;

  try {
    cancelRun(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found")
      ? 404
      : message.includes("cannot be cancelled")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ status: "cancelled" });
}
