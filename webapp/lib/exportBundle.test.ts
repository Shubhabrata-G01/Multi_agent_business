import crypto from "crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { ArtifactMeta, RunState, StepResult, StepTask } from "./types";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

function makeMeta(partial: Partial<ArtifactMeta> = {}): ArtifactMeta {
  return {
    status: "ok",
    confidence: "high",
    evidence_quality: "high",
    decision: null,
    claims: [
      { type: "assumption", text: "Users want a faster onboarding flow.", source: null },
      { type: "decision", text: "Proceed to build the MVP.", source: "user interviews" },
    ],
    open_questions: [],
    reason: null,
    validation_notes: [],
    ...partial,
  };
}

function makeTask(partial: Partial<StepTask> = {}): StepTask {
  return {
    id: crypto.randomUUID(),
    role: "creator",
    agent_id: "UXR-001",
    agent_name: "UX Researcher",
    status: "done",
    content: "UNIQUE_CREATOR_MARKER content body.",
    verdict: null,
    reason: null,
    started_at: "2026-01-01T00:00:00Z",
    finished_at: "2026-01-01T00:01:00Z",
    input_tokens: 500,
    output_tokens: 800,
    meta: makeMeta(),
    model: "test-model",
    ...partial,
  };
}

// STEP 5 item 12 - every task output (creator/critic here) must survive into
// every export format.
describeIfDb("exportBundle (STEP 5 items 9/12)", () => {
  const cleanupRunIds: string[] = [];

  afterEach(async () => {
    const { prisma } = await import("./prisma");
    if (cleanupRunIds.length) {
      await prisma.job.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
      await prisma.run.deleteMany({ where: { id: { in: cleanupRunIds } } });
      await prisma.comment.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
    }
    cleanupRunIds.length = 0;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    await prisma.$disconnect();
  });

  async function makeRunWithArtifact(): Promise<RunState> {
    const { saveRun } = await import("./runStore");
    const { saveArtifactVersion } = await import("./artifactStore");
    const { addComment } = await import("./reviews");

    const id = `test-export-run-${crypto.randomUUID()}`;
    cleanupRunIds.push(id);
    const now = new Date().toISOString();

    const creatorTask = makeTask({ role: "creator" });
    const criticTask = makeTask({
      role: "critic",
      agent_id: "PM-001",
      agent_name: "Product Manager",
      content: "UNIQUE_CRITIC_MARKER findings.",
      verdict: "changes_requested",
      meta: null,
    });

    const step: StepResult = {
      flow_step: "05",
      business_phase: "Market Validation",
      activity: "Research customer workflows",
      agent_id: "UXR-001",
      agent_name: "UX Researcher",
      output_artifact: "Market Validation Report",
      status: "done",
      content: creatorTask.content,
      reason: null,
      started_at: now,
      finished_at: now,
      input_tokens: 500,
      output_tokens: 800,
      tasks: [creatorTask, criticTask],
      is_gate: false,
      attempt: 1,
      meta: creatorTask.meta,
      gate_decision: "advance",
      gate_reason: null,
    };

    const run: RunState = {
      id,
      owner_id: "export-test-owner",
      organization_id: "export-test-org",
      idea: "An export-test business idea",
      status: "completed",
      created_at: now,
      updated_at: now,
      current_step_index: 1,
      total_steps: 1,
      steps: [step],
      error: null,
      provider: "anthropic",
      model: "test-model",
      mode: "assisted",
      key_source: "server_env",
      step_attempts: {},
      jump_counts: {},
      path: [],
      total_executions: 1,
      approvals: [
        {
          id: "approval-1",
          run_id: id,
          flow_step: "05",
          node_id: "saas.05",
          attempt: 1,
          level: 2,
          activity: "Research customer workflows",
          output_artifact: "Market Validation Report",
          summary: "needs approval",
          status: "approved",
          created_at: now,
          decided_by: "reviewer@example.com",
          decided_by_user_id: "u-reviewer",
          decided_by_role: "OWNER",
          decided_at: now,
        },
      ],
    };

    await saveRun(run);
    await saveArtifactVersion({
      run_id: id,
      flow_step: "05",
      output_artifact: "Market Validation Report",
      attempt: 1,
      agent_id: "UXR-001",
      agent_name: "UX Researcher",
      content: creatorTask.content!,
      meta: creatorTask.meta!,
      model: "test-model",
      provider: "anthropic",
      created_at: now,
      gate_decision: "advance",
      gate_reason: null,
    });
    await addComment({
      runId: id,
      flowStep: "05",
      attempt: 1,
      author: { id: "u-commenter", email: "commenter@example.com" },
      body: "UNIQUE_COMMENT_MARKER left during review.",
    });

    return run;
  }

  it("JSON audit bundle includes the run, artifacts, assumptions, decisions, evidence, approvals, and comments", async () => {
    const { buildJsonAuditBundle } = await import("./exportBundle");
    const run = await makeRunWithArtifact();

    const bundle = await buildJsonAuditBundle(run);
    expect(bundle.run.id).toBe(run.id);
    expect(JSON.stringify(bundle.artifacts_by_step)).toContain("UNIQUE_CREATOR_MARKER");
    expect(bundle.assumption_register.some((a) => a.assumption.includes("faster onboarding"))).toBe(true);
    expect(bundle.decision_log.some((d) => d.decision.includes("Proceed to build"))).toBe(true);
    expect(bundle.approval_history).toHaveLength(1);
    expect(bundle.approval_history[0].decided_by).toBe("reviewer@example.com");
    expect(bundle.comments.some((c) => c.body.includes("UNIQUE_COMMENT_MARKER"))).toBe(true);
    expect(bundle.disclaimer).toMatch(/advisory/i);
  });

  it("Markdown export includes both creator content and approval history", async () => {
    const { buildMarkdownExport } = await import("./exportBundle");
    const run = await makeRunWithArtifact();

    const markdown = await buildMarkdownExport(run);
    expect(markdown).toContain("UNIQUE_CREATOR_MARKER");
    expect(markdown).toContain("approved");
    expect(markdown).toContain("reviewer@example.com");
    expect(markdown.toLowerCase()).toContain("advisory");
  });

  it("CSV artifact index includes the creator artifact's row", async () => {
    const { buildArtifactIndexCsv } = await import("./exportBundle");
    const run = await makeRunWithArtifact();

    const csv = await buildArtifactIndexCsv(run);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("flow_step");
    expect(csv).toContain("UXR-001");
    expect(csv).toContain("Market Validation Report");
  });

  it("every task output (creator AND critic) is present somewhere in the JSON bundle", async () => {
    const { buildJsonAuditBundle } = await import("./exportBundle");
    const run = await makeRunWithArtifact();
    const bundle = await buildJsonAuditBundle(run);

    const runSteps = bundle.run.steps;
    const allTaskContent = runSteps.flatMap((s) => s.tasks.map((t) => t.content)).join(" | ");
    expect(allTaskContent).toContain("UNIQUE_CREATOR_MARKER");
    expect(allTaskContent).toContain("UNIQUE_CRITIC_MARKER");
  });
});
