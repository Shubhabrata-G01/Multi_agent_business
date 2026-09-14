import { describe, it, expect } from "vitest";
import { evaluateGate, runtimeNotice } from "./orchestrator";
import type { ArtifactMeta, FlowStepDef, StepTask } from "./types";

// --- builders -------------------------------------------------------------

function makeStep(partial: Partial<FlowStepDef> = {}): FlowStepDef {
  return {
    flow_step: "10",
    business_phase: "Development",
    activity: "Build the thing",
    primary_role: "Backend Engineer",
    supporting_roles: "QA",
    inputs: "spec",
    what_the_role_does: "builds",
    output_artifact: "Feature",
    passed_to: "QA",
    done_gate_criteria: "passes tests",
    loop_reentry_condition: "n/a",
    ...partial,
  };
}

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

function makeTask(
  role: StepTask["role"],
  verdict: StepTask["verdict"],
): StepTask {
  return {
    role,
    agent_id: "AG-1",
    agent_name: "Agent One",
    status: "done",
    content: null,
    verdict,
    reason: null,
    started_at: null,
    finished_at: null,
    input_tokens: null,
    output_tokens: null,
    meta: null,
    model: "test-model",
  };
}

const approvedCritic = () => makeTask("critic", "approved");
const rejectingCritic = () => makeTask("critic", "changes_requested");

// --- gate state machine ---------------------------------------------------

describe("evaluateGate", () => {
  it("advances an ordinary step whose reviewers approved", () => {
    const r = evaluateGate(makeStep(), makeMeta(), [approvedCritic()], null, {}, {});
    expect(r.action).toBe("advance");
  });

  it("advances an ordinary (non-evidence, non-gate) step even when a reviewer requested changes and there is no numeric loop target", () => {
    const r = evaluateGate(makeStep(), makeMeta(), [rejectingCritic()], null, {}, {});
    expect(r.action).toBe("advance");
  });

  it("exits on a No-Go recorded at a gate step", () => {
    const gate = makeStep({ business_phase: "Go / No-Go", output_artifact: "Go / No-Go Decision" });
    const r = evaluateGate(gate, makeMeta({ decision: "no_go" }), [], null, {}, {});
    expect(r.action).toBe("no_go_exit");
  });

  it("retries an evidence-led step whose reviewer still requests changes, within the retry bound", () => {
    const step = makeStep({ business_phase: "Market Validation" });
    const r = evaluateGate(step, makeMeta(), [rejectingCritic()], null, {}, {});
    expect(r.action).toBe("retry_step");
  });

  it("retries an evidence-led step that self-reports low confidence AND low evidence quality", () => {
    const step = makeStep({ business_phase: "Quality" });
    const meta = makeMeta({ confidence: "low", evidence_quality: "low" });
    const r = evaluateGate(step, meta, [approvedCritic()], null, {}, {});
    expect(r.action).toBe("retry_step");
  });

  it("returns to a numeric loop-reentry target when review fails on a non-evidence step", () => {
    const step = makeStep({
      business_phase: "Architecture",
      loop_reentry_condition: "Return to Step 29 until critical concerns are resolved",
    });
    const r = evaluateGate(step, makeMeta(), [rejectingCritic()], null, {}, {});
    expect(r.action).toBe("return_to_step");
    expect(r.target).toBe("29");
  });

  it("holds an evidence-led step once the retry bound is exhausted and there is no loop target", () => {
    const step = makeStep({
      business_phase: "Product-Market Fit",
      loop_reentry_condition: "repeat interviews with more users",
    });
    // priorAttempts at the retry ceiling (default MAX_RETRIES_PER_STEP=2)
    const r = evaluateGate(step, makeMeta(), [rejectingCritic()], null, { "10": 2 }, {});
    expect(r.action).toBe("held");
  });

  it("holds a gate step whose approver rejected and which has no loop target", () => {
    const gate = makeStep({ business_phase: "Go / No-Go", output_artifact: "Approval" });
    const approver = makeTask("approver", "rejected");
    const r = evaluateGate(gate, makeMeta({ decision: "go" }), [], approver, {}, {});
    expect(r.action).toBe("held");
  });

  it("retries a gate step with an unresolved claim-source integrity violation, within the retry bound", () => {
    const gate = makeStep({ business_phase: "Go / No-Go", output_artifact: "Approval" });
    const r = evaluateGate(gate, makeMeta({ decision: "go" }), [approvedCritic()], makeTask("approver", "approved"), {}, {}, 1);
    expect(r.action).toBe("retry_step");
  });

  it("retries an evidence-led step with an integrity violation even when reviewers approved", () => {
    const step = makeStep({ business_phase: "Market Validation" });
    const r = evaluateGate(step, makeMeta(), [approvedCritic()], null, {}, {}, 2);
    expect(r.action).toBe("retry_step");
  });

  it("holds once the integrity-violation retry bound is exhausted", () => {
    const gate = makeStep({ business_phase: "Go / No-Go", output_artifact: "Approval" });
    const r = evaluateGate(gate, makeMeta({ decision: "go" }), [approvedCritic()], makeTask("approver", "approved"), { "10": 2 }, {}, 1);
    expect(r.action).toBe("held");
  });

  it("still advances an ordinary step with an integrity violation (the per-claim downgrade suffices)", () => {
    const r = evaluateGate(makeStep(), makeMeta(), [approvedCritic()], null, {}, {}, 3);
    expect(r.action).toBe("advance");
  });
});

// --- Phase 0a mode enforcement (runtime notice branching) -----------------

describe("runtimeNotice mode branching", () => {
  it("simulation mode instructs full autonomy and no approval pauses", () => {
    const text = runtimeNotice("anthropic", "ROLE", [], "simulation");
    expect(text).toMatch(/fully autonomous/i);
    expect(text).toMatch(/do not defer a decision/i);
    expect(text).not.toMatch(/PENDING_HUMAN_APPROVAL/);
  });

  it("assisted mode forbids asserting Level 2+ decisions and requires PENDING_HUMAN_APPROVAL", () => {
    const text = runtimeNotice("anthropic", "ROLE", [], "assisted");
    expect(text).toMatch(/APPROVAL-GATED/);
    expect(text).toMatch(/PENDING_HUMAN_APPROVAL/);
    expect(text).not.toMatch(/do not defer a decision/i);
  });

  it("defaults to simulation behavior when no mode is given (legacy runs)", () => {
    const text = runtimeNotice("anthropic", "ROLE");
    expect(text).toMatch(/fully autonomous/i);
    expect(text).not.toMatch(/PENDING_HUMAN_APPROVAL/);
  });

  it("always carries the role instructions through", () => {
    expect(runtimeNotice("anthropic", "ROLE-MARKER", [], "assisted")).toContain("ROLE-MARKER");
    expect(runtimeNotice("anthropic", "ROLE-MARKER", [], "simulation")).toContain("ROLE-MARKER");
  });
});
