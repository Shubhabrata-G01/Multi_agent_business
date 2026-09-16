import { NextResponse } from "next/server";
import { cancelRun } from "@/lib/orchestrator";
import { requireOrgRun } from "@/lib/apiAuth";
import { canManageRun } from "@/lib/authz";
import { requireSameOrigin } from "@/lib/csrf";

/**
 * Cancels a running or held run. The orchestrator's loop checks run status
 * every iteration (the same mechanism "held" already relies on), so this
 * takes effect within one iteration rather than killing anything mid-call.
 * Requires a role that can manage runs (OWNER/ADMIN/MEMBER) - a REVIEWER
 * gets 403.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const { id } = await params;
  const authResult = await requireOrgRun(id, canManageRun);
  if (authResult.response) return authResult.response;

  try {
    await cancelRun(id);
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
