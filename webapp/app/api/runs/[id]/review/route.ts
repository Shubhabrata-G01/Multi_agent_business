import { NextResponse } from "next/server";
import { requireOrgRun } from "@/lib/apiAuth";
import { listComments, listReviews } from "@/lib/reviews";
import { buildReviewRows, filterReviewRows, type ReviewFilter } from "@/lib/reviewDashboard";
import type { ClaimType, TaskRole } from "@/lib/types";

const ROLES: TaskRole[] = ["creator", "critic", "approver", "executor", "contributor"];
const CLAIM_TYPES: ClaimType[] = ["fact", "assumption", "estimate", "inference", "recommendation", "decision"];
const CONFIDENCE = ["high", "medium", "low"] as const;
const APPROVAL_STATES = ["pending", "approved", "rejected"] as const;
const REVIEW_STATUSES = ["assigned", "reviewed", "changes_requested", "none"] as const;

/**
 * Run-wide review dashboard data (STEP 5 items 5-6): every task output
 * across every step/attempt, filterable by phase/step/agent/role/confidence/
 * evidence-quality/claim-type/approval-state/blocked-or-error/unresolved-
 * assumptions/review-status, and full-text searchable (?q=).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authResult = await requireOrgRun(id); // any org member may view
  if (authResult.response || !authResult.run) return authResult.response;
  const run = authResult.run;

  const { searchParams } = new URL(request.url);
  const filter: ReviewFilter = {};

  const phase = searchParams.get("phase");
  if (phase) filter.phase = phase;
  const flowStep = searchParams.get("flow_step");
  if (flowStep) filter.flow_step = flowStep;
  const agentId = searchParams.get("agent_id");
  if (agentId) filter.agent_id = agentId;
  const role = searchParams.get("role");
  if (role && (ROLES as string[]).includes(role)) filter.role = role as TaskRole;
  const confidence = searchParams.get("confidence");
  if (confidence && (CONFIDENCE as readonly string[]).includes(confidence)) {
    filter.confidence = confidence as (typeof CONFIDENCE)[number];
  }
  const evidenceQuality = searchParams.get("evidence_quality");
  if (evidenceQuality && (CONFIDENCE as readonly string[]).includes(evidenceQuality)) {
    filter.evidence_quality = evidenceQuality as (typeof CONFIDENCE)[number];
  }
  const claimType = searchParams.get("claim_type");
  if (claimType && (CLAIM_TYPES as string[]).includes(claimType)) filter.claim_type = claimType as ClaimType;
  const approvalState = searchParams.get("approval_state");
  if (approvalState && (APPROVAL_STATES as readonly string[]).includes(approvalState)) {
    filter.approval_state = approvalState as (typeof APPROVAL_STATES)[number];
  }
  const blockedOrError = searchParams.get("blocked_or_error");
  if (blockedOrError === "true") filter.blocked_or_error = true;
  if (searchParams.get("unresolved_assumptions") === "true") filter.unresolved_assumptions_only = true;
  const reviewStatus = searchParams.get("review_status");
  if (reviewStatus && (REVIEW_STATUSES as readonly string[]).includes(reviewStatus)) {
    filter.review_status = reviewStatus as (typeof REVIEW_STATUSES)[number];
  }
  const q = searchParams.get("q");
  if (q) filter.q = q;

  const [comments, reviews] = await Promise.all([listComments(id), listReviews(id)]);
  const rows = buildReviewRows(run, comments, reviews);
  const filtered = filterReviewRows(run, rows, filter);

  return NextResponse.json({
    total: rows.length,
    filtered: filtered.length,
    rows: filtered,
  });
}
