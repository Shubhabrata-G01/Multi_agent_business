import { describe, expect, it } from "vitest";
import { buildReviewRows, filterReviewRows } from "./reviewDashboard";
import type { ArtifactMeta, RunState, StepResult, StepTask } from "./types";

function makeMeta(partial: Partial<ArtifactMeta> = {}): ArtifactMeta {
  return {
    status: "ok",
    confidence: "high",
    evidence_quality: "high",
    decision: null,
    claims: [],
    open_questions: [],
    reason: null,
    validation_notes: [],
    ...partial,
  };
}

function makeTask(partial: Partial<StepTask> = {}): StepTask {
  return {
    id: `task-${Math.random()}`,
    role: "creator",
    agent_id: "AG-1",
    agent_name: "Agent One",
    status: "done",
    content: "Some artifact body mentioning widgets.",
    verdict: null,
    reason: null,
    started_at: null,
    finished_at: null,
    input_tokens: 100,
    output_tokens: 200,
    meta: null,
    model: "test-model",
    ...partial,
  };
}

function makeStep(partial: Partial<StepResult> = {}): StepResult {
  return {
    flow_step: "05",
    business_phase: "Market Validation",
    activity: "Research customer workflows",
    agent_id: "AG-1",
    agent_name: "Agent One",
    output_artifact: "Report",
    status: "done",
    content: "final content",
    reason: null,
    started_at: null,
    finished_at: null,
    input_tokens: null,
    output_tokens: null,
    tasks: [makeTask()],
    is_gate: false,
    attempt: 1,
    meta: makeMeta(),
    gate_decision: "advance",
    gate_reason: null,
    ...partial,
  };
}

function makeRun(steps: StepResult[]): RunState {
  return {
    id: "run-1",
    owner_id: "owner-1",
    organization_id: "org-1",
    idea: "idea",
    status: "running",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    current_step_index: 0,
    total_steps: steps.length,
    steps,
    error: null,
    provider: "anthropic",
    model: "test-model",
    key_source: "server_env",
    step_attempts: {},
    jump_counts: {},
    path: [],
    total_executions: 0,
  };
}

describe("buildReviewRows / filterReviewRows (STEP 5 items 5-6)", () => {
  it("flattens every task across every step into a row", () => {
    const run = makeRun([
      makeStep({
        flow_step: "05",
        tasks: [makeTask({ role: "creator" }), makeTask({ role: "critic", verdict: "approved" })],
      }),
      makeStep({ flow_step: "06", tasks: [makeTask({ role: "creator" })] }),
    ]);
    const rows = buildReviewRows(run, [], []);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.role)).toEqual(["creator", "critic", "creator"]);
  });

  it("filters by role", () => {
    const run = makeRun([
      makeStep({ tasks: [makeTask({ role: "creator" }), makeTask({ role: "critic" })] }),
    ]);
    const rows = buildReviewRows(run, [], []);
    const critics = filterReviewRows(run, rows, { role: "critic" });
    expect(critics).toHaveLength(1);
    expect(critics[0].role).toBe("critic");
  });

  it("filters by confidence, taken from the creator task's own meta", () => {
    const run = makeRun([
      makeStep({
        tasks: [makeTask({ role: "creator", meta: makeMeta({ confidence: "low" }) })],
      }),
    ]);
    const rows = buildReviewRows(run, [], []);
    expect(filterReviewRows(run, rows, { confidence: "low" })).toHaveLength(1);
    expect(filterReviewRows(run, rows, { confidence: "high" })).toHaveLength(0);
  });

  it("filters by claim_type and counts unresolved assumptions", () => {
    const run = makeRun([
      makeStep({
        tasks: [
          makeTask({
            role: "creator",
            meta: makeMeta({
              claims: [
                { type: "assumption", text: "Users want X", source: null },
                { type: "fact", text: "Market is big", source: "report.pdf" },
              ],
            }),
          }),
        ],
      }),
    ]);
    const rows = buildReviewRows(run, [], []);
    expect(rows[0].unresolved_assumptions).toBe(1);
    expect(filterReviewRows(run, rows, { claim_type: "assumption" })).toHaveLength(1);
    expect(filterReviewRows(run, rows, { unresolved_assumptions_only: true })).toHaveLength(1);
    expect(filterReviewRows(run, rows, { claim_type: "decision" })).toHaveLength(0);
  });

  it("filters by blocked_or_error", () => {
    const run = makeRun([
      makeStep({ tasks: [makeTask({ status: "error" }), makeTask({ status: "done" })] }),
    ]);
    const rows = buildReviewRows(run, [], []);
    expect(filterReviewRows(run, rows, { blocked_or_error: true })).toHaveLength(1);
  });

  it("filters by approval_state using run.approvals", () => {
    const run = makeRun([makeStep({ flow_step: "13", attempt: 1, is_gate: true })]);
    run.approvals = [
      {
        id: "a1",
        run_id: run.id,
        flow_step: "13",
        node_id: "saas.13",
        attempt: 1,
        level: 2,
        activity: "Gate",
        output_artifact: "Decision",
        summary: "needs approval",
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    const rows = buildReviewRows(run, [], []);
    expect(filterReviewRows(run, rows, { approval_state: "pending" })).toHaveLength(1);
    expect(filterReviewRows(run, rows, { approval_state: "approved" })).toHaveLength(0);
  });

  it("full-text searches content and reason (case-insensitive)", () => {
    const run = makeRun([
      makeStep({
        tasks: [
          makeTask({ content: "This mentions WIDGETS explicitly." }),
          makeTask({ role: "critic", content: "Nothing relevant here." }),
        ],
      }),
    ]);
    const rows = buildReviewRows(run, [], []);
    expect(filterReviewRows(run, rows, { q: "widgets" })).toHaveLength(1);
    expect(filterReviewRows(run, rows, { q: "nonexistent-term" })).toHaveLength(0);
  });

  it("attaches review status and comment counts per step", () => {
    const run = makeRun([makeStep({ flow_step: "07", attempt: 1 })]);
    const rows = buildReviewRows(
      run,
      [{ flow_step: "07" }, { flow_step: "07" }],
      [
        {
          run_id: run.id,
          flow_step: "07",
          attempt: 1,
          reviewer_id: "u1",
          reviewer_email: "r@example.com",
          status: "reviewed",
          note: null,
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    );
    expect(rows[0].review_status).toBe("reviewed");
    expect(rows[0].reviewer_email).toBe("r@example.com");
    expect(rows[0].comment_count).toBe(2);
  });
});
