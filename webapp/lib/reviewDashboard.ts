// Run-wide review dashboard data (STEP 5 items 5-6): flattens every task
// output (creator/critic/contributor/approver/executor, every attempt) into
// one filterable, searchable list. Pure/synchronous over an already-loaded
// RunState plus the review-workspace records (lib/reviews.ts) - the API
// route (app/api/runs/[id]/review/route.ts) is what actually loads those.
import type {
  ArtifactMeta,
  ClaimType,
  GateAction,
  RunState,
  StepStatus,
  StepTask,
  TaskRole,
  TaskVerdict,
} from "./types";
import type { StepReviewRecord, StepReviewStatus } from "./reviews";

export interface ReviewRow {
  task_id: string;
  flow_step: string;
  business_phase: string;
  activity: string;
  attempt: number;
  role: TaskRole;
  agent_id: string;
  agent_name: string;
  model: string;
  status: StepStatus;
  verdict: TaskVerdict;
  content: string | null;
  reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  confidence: ArtifactMeta["confidence"] | null;
  evidence_quality: ArtifactMeta["evidence_quality"] | null;
  claim_types: ClaimType[];
  // Count of ASSUMPTION-type claims on this task - there is no separate
  // assumption-resolution workflow elsewhere in this codebase (see
  // lib/fs/fsArtifactStore.ts's getAssumptionRegister, which defaults every
  // assumption's status to "unvalidated"), so "unresolved" here pragmatically
  // means "present" - every assumption claim is unresolved until a human
  // process outside this app validates it.
  unresolved_assumptions: number;
  is_gate: boolean;
  gate_decision: GateAction | null;
  blocked_or_error: boolean;
  review_status: StepReviewStatus | null;
  reviewer_email: string | null;
  comment_count: number;
}

export interface ReviewFilter {
  phase?: string;
  flow_step?: string;
  agent_id?: string;
  role?: TaskRole;
  confidence?: ArtifactMeta["confidence"];
  evidence_quality?: ArtifactMeta["evidence_quality"];
  claim_type?: ClaimType;
  approval_state?: "pending" | "approved" | "rejected";
  blocked_or_error?: boolean;
  unresolved_assumptions_only?: boolean;
  review_status?: StepReviewStatus | "none";
  /** Case-insensitive substring match over content + reason (STEP 5 item 6). */
  q?: string;
}

function claimTypesOf(meta: ArtifactMeta | null): ClaimType[] {
  if (!meta) return [];
  return Array.from(new Set(meta.claims.map((c) => c.type)));
}

function countAssumptions(meta: ArtifactMeta | null): number {
  if (!meta) return 0;
  return meta.claims.filter((c) => c.type === "assumption").length;
}

export function buildReviewRows(
  run: RunState,
  comments: { flow_step: string }[],
  reviews: StepReviewRecord[],
): ReviewRow[] {
  const reviewByStep = new Map(reviews.map((r) => [`${r.flow_step}:${r.attempt}`, r]));
  const commentCountByStep = new Map<string, number>();
  for (const c of comments) {
    commentCountByStep.set(c.flow_step, (commentCountByStep.get(c.flow_step) ?? 0) + 1);
  }

  const rows: ReviewRow[] = [];
  for (const step of run.steps) {
    const stepMeta = step.meta;
    const review = reviewByStep.get(`${step.flow_step}:${step.attempt}`) ?? null;
    for (const task of step.tasks as StepTask[]) {
      const meta = task.meta ?? (task.role === "creator" ? stepMeta : null);
      rows.push({
        task_id: task.id,
        flow_step: step.flow_step,
        business_phase: step.business_phase,
        activity: step.activity,
        attempt: step.attempt,
        role: task.role,
        agent_id: task.agent_id,
        agent_name: task.agent_name,
        model: task.model,
        status: task.status,
        verdict: task.verdict,
        content: task.content,
        reason: task.reason,
        started_at: task.started_at,
        finished_at: task.finished_at,
        input_tokens: task.input_tokens,
        output_tokens: task.output_tokens,
        confidence: meta?.confidence ?? null,
        evidence_quality: meta?.evidence_quality ?? null,
        claim_types: claimTypesOf(meta),
        unresolved_assumptions: countAssumptions(meta),
        is_gate: step.is_gate,
        gate_decision: step.gate_decision,
        blocked_or_error: task.status === "blocked" || task.status === "error",
        review_status: review?.status ?? null,
        reviewer_email: review?.reviewer_email ?? null,
        comment_count: commentCountByStep.get(step.flow_step) ?? 0,
      });
    }
  }
  return rows;
}

function approvalStateOf(run: RunState, row: ReviewRow): "pending" | "approved" | "rejected" | null {
  const key = `${row.flow_step}:${row.attempt}`;
  const match = (run.approvals ?? []).find((a) => `${a.flow_step}:${a.attempt}` === key);
  return match ? match.status : null;
}

export function filterReviewRows(run: RunState, rows: ReviewRow[], filter: ReviewFilter): ReviewRow[] {
  const q = filter.q?.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.phase && row.business_phase !== filter.phase) return false;
    if (filter.flow_step && row.flow_step !== filter.flow_step) return false;
    if (filter.agent_id && row.agent_id !== filter.agent_id) return false;
    if (filter.role && row.role !== filter.role) return false;
    if (filter.confidence && row.confidence !== filter.confidence) return false;
    if (filter.evidence_quality && row.evidence_quality !== filter.evidence_quality) return false;
    if (filter.claim_type && !row.claim_types.includes(filter.claim_type)) return false;
    if (filter.blocked_or_error !== undefined && row.blocked_or_error !== filter.blocked_or_error) {
      return false;
    }
    if (filter.unresolved_assumptions_only && row.unresolved_assumptions === 0) return false;
    if (filter.approval_state && approvalStateOf(run, row) !== filter.approval_state) return false;
    if (filter.review_status) {
      const actual = row.review_status ?? "none";
      if (actual !== filter.review_status) return false;
    }
    if (q) {
      const haystack = `${row.content ?? ""} ${row.reason ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
