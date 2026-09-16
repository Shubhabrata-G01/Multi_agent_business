import { NextResponse } from "next/server";
import { requireOrgRun } from "@/lib/apiAuth";
import { canApproveGate } from "@/lib/authz";
import { assignReviewer, setReviewStatus } from "@/lib/reviews";
import { requireSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  attempt: z.number().int().min(1).max(1000),
  action: z.enum(["assign", "mark_reviewed", "request_changes"]),
  // For "assign": defaults to self if omitted. Must be an email belonging to
  // a member of the SAME organization as the run (checked below) - assigning
  // an outsider would leak that the run exists to them.
  reviewerEmail: z.string().trim().email().optional(),
  note: z.string().trim().max(4000).optional(),
});

/**
 * Review actions independent of the formal gate-approval flow (STEP 5 item
 * 7): assign a reviewer, mark reviewed, or request changes on any step's
 * current attempt. Requires a role that can approve gates (OWNER/ADMIN/
 * REVIEWER) - the same bar as a formal approval, since these are the
 * people responsible for QA.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; step: string }> },
) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const { id, step } = await params;
  const authResult = await requireOrgRun(id, canApproveGate);
  if (authResult.response || !authResult.user || !authResult.run) return authResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { attempt, action, note } = parsed.data;

  try {
    if (action === "assign") {
      let reviewer = { id: authResult.user.id, email: authResult.user.email ?? authResult.user.id };
      if (parsed.data.reviewerEmail && parsed.data.reviewerEmail !== reviewer.email) {
        const target = await prisma.user.findUnique({ where: { email: parsed.data.reviewerEmail } });
        const targetMembership = target
          ? await prisma.membership.findUnique({
              where: { user_id_organization_id: { user_id: target.id, organization_id: authResult.run.organization_id! } },
            })
          : null;
        if (!target || !targetMembership) {
          return NextResponse.json(
            { error: "That email does not belong to a member of this run's organization." },
            { status: 400 },
          );
        }
        reviewer = { id: target.id, email: target.email };
      }
      const review = await assignReviewer(id, step, attempt, reviewer);
      return NextResponse.json({ review });
    }

    const status = action === "mark_reviewed" ? "reviewed" : "changes_requested";
    const review = await setReviewStatus(
      id,
      step,
      attempt,
      status,
      { id: authResult.user.id, email: authResult.user.email ?? authResult.user.id },
      note,
    );
    return NextResponse.json({ review });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
