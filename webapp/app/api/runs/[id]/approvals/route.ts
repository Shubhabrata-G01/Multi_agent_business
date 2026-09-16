import { NextResponse } from "next/server";
import { decideApproval } from "@/lib/orchestrator";
import { requireOwnedRun } from "@/lib/apiAuth";

/**
 * Resolves a pending human-approval request on an assisted-mode run holding at a
 * Level-2+ gate (Phase 1c). Body: { approvalId, decision: "approve" | "reject",
 * reason?, apiKey? }. On success the run resumes (approve advances past the gate;
 * reject reworks it). A missing key surfaces "No API key supplied" (400) so the
 * UI can prompt, exactly like the resume route.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authResult = await requireOwnedRun(id);
  if (authResult.response) return authResult.response;

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
    await decideApproval(id, approvalId, decision, reason, apiKey);
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
