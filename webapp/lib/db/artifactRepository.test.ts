import crypto from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ArtifactMeta } from "../types";
import type { ArtifactRecord } from "./artifactRepository";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

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

describeIfDb("PostgreSQL artifactRepository", () => {
  let prisma: (typeof import("../prisma"))["prisma"];
  let repo: typeof import("./artifactRepository");
  let runRepo: typeof import("./runRepository");
  const testRunIds: string[] = [];

  function makeRecord(partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
    return {
      run_id: partial.run_id ?? "unset",
      flow_step: "05",
      output_artifact: "Market Validation Report",
      attempt: 1,
      agent_id: "UXR-001",
      agent_name: "UX Researcher",
      content: "The artifact body.",
      meta: makeMeta(),
      model: "test-model",
      provider: "anthropic",
      created_at: new Date().toISOString(),
      gate_decision: null,
      gate_reason: null,
      ...partial,
    };
  }

  async function makeTestRun(): Promise<string> {
    const id = `test-run-${crypto.randomUUID()}`;
    testRunIds.push(id);
    const now = new Date().toISOString();
    await runRepo.saveRun({
      id,
      owner_id: "owner-1",
      idea: "idea",
      status: "running",
      created_at: now,
      updated_at: now,
      current_step_index: 0,
      total_steps: 1,
      steps: [],
      error: null,
      provider: "anthropic",
      model: "test-model",
      key_source: "server_env",
      step_attempts: {},
      jump_counts: {},
      path: [],
      total_executions: 0,
    });
    return id;
  }

  beforeEach(async () => {
    ({ prisma } = await import("../prisma"));
    repo = await import("./artifactRepository");
    runRepo = await import("./runRepository");
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("../prisma");
    if (testRunIds.length > 0) {
      await prisma.run.deleteMany({ where: { id: { in: testRunIds } } });
    }
    await prisma.$disconnect();
  });

  it("persists an artifact version with normalized index columns", async () => {
    const runId = await makeTestRun();
    const record = makeRecord({
      run_id: runId,
      meta: makeMeta({ confidence: "medium", evidence_quality: "low" }),
    });
    await repo.saveArtifactVersion(record);

    const row = await prisma.artifactVersion.findUniqueOrThrow({
      where: { run_id_flow_step_attempt: { run_id: runId, flow_step: "05", attempt: 1 } },
    });
    expect(row.agent_id).toBe("UXR-001");
    expect(row.confidence).toBe("medium");
    expect(row.evidence_quality).toBe("low");

    const versions = await repo.listArtifactVersions(runId, "05");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toEqual(record);
  });

  it("refuses to overwrite an existing (run_id, flow_step, attempt) - immutability", async () => {
    const runId = await makeTestRun();
    const record = makeRecord({ run_id: runId });
    await repo.saveArtifactVersion(record);
    await expect(
      repo.saveArtifactVersion({ ...record, content: "a different body" }),
    ).rejects.toThrow(/immutable/i);

    // The original content survives untouched.
    const versions = await repo.listArtifactVersions(runId, "05");
    expect(versions[0].content).toBe("The artifact body.");
  });

  it("updates only gate_decision/gate_reason via recordGateDecision, leaving content/meta untouched", async () => {
    const runId = await makeTestRun();
    await repo.saveArtifactVersion(makeRecord({ run_id: runId }));
    await repo.recordGateDecision(runId, "05", 1, "advance", "Reviewers approved.");

    const [version] = await repo.listArtifactVersions(runId, "05");
    expect(version.gate_decision).toBe("advance");
    expect(version.gate_reason).toBe("Reviewers approved.");
    expect(version.content).toBe("The artifact body.");
  });

  it("queryArtifacts filters by agent_id and min_confidence", async () => {
    const runId = await makeTestRun();
    await repo.saveArtifactVersion(
      makeRecord({ run_id: runId, flow_step: "05", agent_id: "UXR-001", meta: makeMeta({ confidence: "low" }) }),
    );
    await repo.saveArtifactVersion(
      makeRecord({ run_id: runId, flow_step: "06", agent_id: "PM-001", meta: makeMeta({ confidence: "high" }) }),
    );

    const byAgent = await repo.queryArtifacts(runId, { agent_id: "PM-001" });
    expect(byAgent.map((e) => e.flow_step)).toEqual(["06"]);

    const highConfidence = await repo.queryArtifacts(runId, { min_confidence: "high" });
    expect(highConfidence.map((e) => e.flow_step)).toEqual(["06"]);
  });

  it("getAssumptionRegister and getDecisionLog derive from the latest attempt per step", async () => {
    const runId = await makeTestRun();
    await repo.saveArtifactVersion(
      makeRecord({
        run_id: runId,
        flow_step: "05",
        attempt: 1,
        meta: makeMeta({
          claims: [
            { type: "assumption", text: "Users want this.", source: null },
            { type: "decision", text: "Proceed to build.", source: "interview notes" },
          ],
        }),
      }),
    );

    const assumptions = await repo.getAssumptionRegister(runId);
    expect(assumptions).toHaveLength(1);
    expect(assumptions[0].assumption).toBe("Users want this.");

    const decisions = await repo.getDecisionLog(runId);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].decision).toBe("Proceed to build.");
    expect(decisions[0].status).toBe("proposed");
  });
});
