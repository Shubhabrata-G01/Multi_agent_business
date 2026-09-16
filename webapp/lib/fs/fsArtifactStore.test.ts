import fs from "fs";
import path from "path";
import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  saveArtifactVersion,
  recordGateDecision,
  listArtifactVersions,
  queryArtifacts,
  getAssumptionRegister,
  getDecisionLog,
  type ArtifactRecord,
} from "./fsArtifactStore";
import type { ArtifactMeta } from "../types";

const RUNS_DIR = path.join(process.cwd(), "runs");
const createdRunIds: string[] = [];

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

function makeRecord(runId: string, partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    run_id: runId,
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

function newRunId(): string {
  const id = `test-fixture-${crypto.randomUUID()}`;
  createdRunIds.push(id);
  return id;
}

afterEach(() => {
  for (const id of createdRunIds.splice(0)) {
    const dir = path.join(RUNS_DIR, id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("fsArtifactStore (filesystem fallback)", () => {
  it("persists an immutable artifact version and lists it back", async () => {
    const runId = newRunId();
    const record = makeRecord(runId);
    await saveArtifactVersion(record);

    const versions = await listArtifactVersions(runId, "05");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toEqual(record);
  });

  it("recordGateDecision updates only gate fields, not content/meta", async () => {
    const runId = newRunId();
    await saveArtifactVersion(makeRecord(runId));
    await recordGateDecision(runId, "05", 1, "advance", "Reviewers approved.");

    const [version] = await listArtifactVersions(runId, "05");
    expect(version.gate_decision).toBe("advance");
    expect(version.gate_reason).toBe("Reviewers approved.");
    expect(version.content).toBe("The artifact body.");
  });

  it("queryArtifacts filters the run's index by agent_id and min_confidence", async () => {
    const runId = newRunId();
    await saveArtifactVersion(
      makeRecord(runId, { flow_step: "05", agent_id: "UXR-001", meta: makeMeta({ confidence: "low" }) }),
    );
    await saveArtifactVersion(
      makeRecord(runId, { flow_step: "06", agent_id: "PM-001", meta: makeMeta({ confidence: "high" }) }),
    );

    const byAgent = await queryArtifacts(runId, { agent_id: "PM-001" });
    expect(byAgent.map((e) => e.flow_step)).toEqual(["06"]);

    const highConfidence = await queryArtifacts(runId, { min_confidence: "high" });
    expect(highConfidence.map((e) => e.flow_step)).toEqual(["06"]);
  });

  it("getAssumptionRegister and getDecisionLog derive from claims, same shape as the PostgreSQL backend", async () => {
    const runId = newRunId();
    await saveArtifactVersion(
      makeRecord(runId, {
        meta: makeMeta({
          claims: [
            { type: "assumption", text: "Users want this.", source: null },
            { type: "decision", text: "Proceed to build.", source: "interview notes" },
          ],
        }),
      }),
    );

    const assumptions = await getAssumptionRegister(runId);
    expect(assumptions[0].assumption).toBe("Users want this.");

    const decisions = await getDecisionLog(runId);
    expect(decisions[0].decision).toBe("Proceed to build.");
  });
});
