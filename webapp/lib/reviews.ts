// Review workspace actions (STEP 5 item 7): comment, assign reviewer, mark
// reviewed, request changes. Independent of the formal gate-approval flow
// (lib/orchestrator.ts's decideApproval/ApprovalRequest, which only exists
// for Level-2+ gate steps and blocks run progress) - these apply to ANY
// step's artifact, gate or not, and never block execution themselves.
// Postgres-only, same as the rest of the review/export surface (STEP 5) -
// filesystem mode has no Comment/StepReview table.
import { prisma } from "./prisma";
import { getStorageBackend } from "./storageBackend";

export interface Reviewer {
  id: string;
  email: string;
}

export interface CommentRecord {
  id: string;
  run_id: string;
  flow_step: string;
  attempt: number;
  task_id: string | null;
  author_id: string;
  author_email: string;
  body: string;
  created_at: string;
}

function assertPostgres(): void {
  if (getStorageBackend() !== "postgres") {
    throw new Error(
      "The review workspace (comments/reviews) requires the PostgreSQL storage backend.",
    );
  }
}

export async function addComment(params: {
  runId: string;
  flowStep: string;
  attempt: number;
  taskId?: string | null;
  author: Reviewer;
  body: string;
}): Promise<CommentRecord> {
  assertPostgres();
  const row = await prisma.comment.create({
    data: {
      run_id: params.runId,
      flow_step: params.flowStep,
      attempt: params.attempt,
      task_id: params.taskId ?? null,
      author_id: params.author.id,
      author_email: params.author.email,
      body: params.body,
    },
  });
  return {
    id: row.id,
    run_id: row.run_id,
    flow_step: row.flow_step,
    attempt: row.attempt,
    task_id: row.task_id,
    author_id: row.author_id,
    author_email: row.author_email,
    body: row.body,
    created_at: row.created_at.toISOString(),
  };
}

export async function listComments(runId: string, flowStep?: string): Promise<CommentRecord[]> {
  if (getStorageBackend() !== "postgres") return [];
  const rows = await prisma.comment.findMany({
    where: { run_id: runId, ...(flowStep ? { flow_step: flowStep } : {}) },
    orderBy: { created_at: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    run_id: row.run_id,
    flow_step: row.flow_step,
    attempt: row.attempt,
    task_id: row.task_id,
    author_id: row.author_id,
    author_email: row.author_email,
    body: row.body,
    created_at: row.created_at.toISOString(),
  }));
}

export type StepReviewStatus = "assigned" | "reviewed" | "changes_requested";

export interface StepReviewRecord {
  run_id: string;
  flow_step: string;
  attempt: number;
  reviewer_id: string | null;
  reviewer_email: string | null;
  status: StepReviewStatus;
  note: string | null;
  updated_at: string;
}

function toRecord(row: {
  run_id: string;
  flow_step: string;
  attempt: number;
  reviewer_id: string | null;
  reviewer_email: string | null;
  status: string;
  note: string | null;
  updated_at: Date;
}): StepReviewRecord {
  return {
    run_id: row.run_id,
    flow_step: row.flow_step,
    attempt: row.attempt,
    reviewer_id: row.reviewer_id,
    reviewer_email: row.reviewer_email,
    status: row.status as StepReviewStatus,
    note: row.note,
    updated_at: row.updated_at.toISOString(),
  };
}

/** Assigns a reviewer to a step's current attempt (does not require the
 * assignee to be the one calling - any org member who can approve gates can
 * assign another). */
export async function assignReviewer(
  runId: string,
  flowStep: string,
  attempt: number,
  reviewer: Reviewer,
): Promise<StepReviewRecord> {
  assertPostgres();
  const row = await prisma.stepReview.upsert({
    where: { run_id_flow_step_attempt: { run_id: runId, flow_step: flowStep, attempt } },
    create: {
      run_id: runId,
      flow_step: flowStep,
      attempt,
      reviewer_id: reviewer.id,
      reviewer_email: reviewer.email,
      status: "assigned",
    },
    update: { reviewer_id: reviewer.id, reviewer_email: reviewer.email, status: "assigned" },
  });
  return toRecord(row);
}

export async function setReviewStatus(
  runId: string,
  flowStep: string,
  attempt: number,
  status: "reviewed" | "changes_requested",
  reviewer: Reviewer,
  note?: string,
): Promise<StepReviewRecord> {
  assertPostgres();
  const row = await prisma.stepReview.upsert({
    where: { run_id_flow_step_attempt: { run_id: runId, flow_step: flowStep, attempt } },
    create: {
      run_id: runId,
      flow_step: flowStep,
      attempt,
      reviewer_id: reviewer.id,
      reviewer_email: reviewer.email,
      status,
      note: note ?? null,
    },
    update: {
      reviewer_id: reviewer.id,
      reviewer_email: reviewer.email,
      status,
      note: note ?? null,
    },
  });
  return toRecord(row);
}

export async function listReviews(runId: string): Promise<StepReviewRecord[]> {
  if (getStorageBackend() !== "postgres") return [];
  const rows = await prisma.stepReview.findMany({ where: { run_id: runId } });
  return rows.map(toRecord);
}
