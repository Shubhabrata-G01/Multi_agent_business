import { NextResponse } from "next/server";
import { decideApproval } from "@/lib/orchestrator";
import { requireOrgRun } from "@/lib/apiAuth";
import { canApproveGate } from "@/lib/authz";
import { checkRateLimit } from "@/lib/rateLimit";
import { requireSameOrigin } from "@/lib/csrf";

/**
 * Resolves a pending human-approval request on an assisted-mode run holding at a
 * Level-2+ gate (Phase 1c). Body: { approvalId, decision: "approve" | "reject",
 * reason?, apiKey? }. On success the run resumes (approve advances past the gate;
 * reject reworks it). A missing key surfaces "No API key supplied" (400) so the
 * UI can prompt, exactly like the resume route. Requires a role that can
 * approve gates (OWNER/ADMIN/REVIEWER - see lib/authz.ts) - a plain MEMBER
 * gets 403.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const { id } = await params;
  const authResult = await requireOrgRun(id, canApproveGate);
  if (authResult.response || !authResult.user || !authResult.role) return authResult.response;

  const rateLimited = checkRateLimit(`approvals:${authResult.user.id}`, "approval");
  if (rateLimited) return rateLimited;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const approvalId = typeof obj.approvalId === "string" ? obj.approvalId : "";
  if (!approvalId) {
    return NextResponse.json({ error: "Field 'approvalId' is required." }, { status: 400 });
  }
  const decision = obj.decision === "reject" ? "reject" : obj.decision === "approve" ? "approve" : null;
  if (!decision) {
    return NextResponse.json(
      { error: "Field 'decision' must be 'approve' or 'reject'." },
      { status: 400 },
    );
  }
  const reason =
    typeof obj.reason === "string" && obj.reason.trim() ? obj.reason.trim() : undefined;
  const apiKey =
    typeof obj.apiKey === "string" && obj.apiKey.trim() ? obj.apiKey.trim() : undefined;

  try {
    await decideApproval(id, approvalId, decision, reason, apiKey, {
      id: authResult.user.id,
      email: authResult.user.email ?? authResult.user.id,
      role: authResult.role,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found")
      ? 404
      : message.includes("already")
        ? 409
        : message.includes("No API key supplied")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ status: decision === "approve" ? "approved" : "rejected" });
}
