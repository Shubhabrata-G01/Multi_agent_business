import fs from "fs";
import path from "path";
import type { ArtifactMeta, ClaimType, GateAction } from "./types";

const RUNS_DIR = path.join(process.cwd(), "runs");

export interface ArtifactRecord {
  run_id: string;
  flow_step: string;
  output_artifact: string;
  attempt: number;
  agent_id: string;
  agent_name: string;
  content: string;
  meta: ArtifactMeta;
  model: string;
  provider: string;
  created_at: string;
  gate_decision: GateAction | null;
  gate_reason: string | null;
}

export interface ArtifactIndexEntry {
  flow_step: string;
  attempt: number;
  output_artifact: string;
  agent_id: string;
  agent_name: string;
  confidence: ArtifactMeta["confidence"];
  evidence_quality: ArtifactMeta["evidence_quality"];
  decision: ArtifactMeta["decision"];
  claim_counts: Partial<Record<ClaimType, number>>;
  created_at: string;
}

function artifactsDir(runId: string): string {
  // runId is only ever crypto.randomUUID() from orchestrator.ts, never user
  // input, so no path-traversal sanitization is needed here (same trust
  // boundary as runStore.ts).
  return path.join(RUNS_DIR, runId, "artifacts");
}

function versionDir(runId: string, flowStep: string): string {
  return path.join(artifactsDir(runId), flowStep);
}

function versionFilePath(runId: string, flowStep: string, attempt: number): string {
  return path.join(versionDir(runId, flowStep), `v${attempt}.json`);
}

function indexFilePath(runId: string): string {
  return path.join(artifactsDir(runId), "index.json");
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readIndex(runId: string): ArtifactIndexEntry[] {
  const file = indexFilePath(runId);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8")) as ArtifactIndexEntry[];
}

function writeIndex(runId: string, entries: ArtifactIndexEntry[]): void {
  ensureDir(artifactsDir(runId));
  fs.writeFileSync(indexFilePath(runId), JSON.stringify(entries, null, 2), "utf-8");
}

function claimCounts(meta: ArtifactMeta): Partial<Record<ClaimType, number>> {
  const counts: Partial<Record<ClaimType, number>> = {};
  for (const claim of meta.claims) {
    counts[claim.type] = (counts[claim.type] ?? 0) + 1;
  }
  return counts;
}

/** Persists one immutable Creator/revision attempt as a new artifact version
 * and appends its pointer to the run's index. Only Creator/revision outputs
 * are versioned here - Critic/Approver/Executor outputs stay in StepTask,
 * keeping this store about the artifact itself, not every reviewer comment. */
export function saveArtifactVersion(record: ArtifactRecord): void {
  ensureDir(versionDir(record.run_id, record.flow_step));
  fs.writeFileSync(
    versionFilePath(record.run_id, record.flow_step, record.attempt),
    JSON.stringify(record, null, 2),
    "utf-8",
  );

  const index = readIndex(record.run_id);
  index.push({
    flow_step: record.flow_step,
    attempt: record.attempt,
    output_artifact: record.output_artifact,
    agent_id: record.agent_id,
    agent_name: record.agent_name,
    confidence: record.meta.confidence,
    evidence_quality: record.meta.evidence_quality,
    decision: record.meta.decision,
    claim_counts: claimCounts(record.meta),
    created_at: record.created_at,
  });
  writeIndex(record.run_id, index);
}

/** Updates a version's gate_decision/gate_reason after evaluateGate() runs,
 * without changing its content/meta - the artifact itself is immutable, but
 * "what happened next" is only known after the fact. */
export function recordGateDecision(
  runId: string,
  flowStep: string,
  attempt: number,
  decision: GateAction,
  reason: string | null,
): void {
  const file = versionFilePath(runId, flowStep, attempt);
  if (!fs.existsSync(file)) return;
  const record = JSON.parse(fs.readFileSync(file, "utf-8")) as ArtifactRecord;
  record.gate_decision = decision;
  record.gate_reason = reason;
  fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf-8");
}

export function listArtifactVersions(runId: string, flowStep: string): ArtifactRecord[] {
  const dir = versionDir(runId, flowStep);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as ArtifactRecord)
    .sort((a, b) => a.attempt - b.attempt);
}

export function getLatestArtifactVersion(
  runId: string,
  flowStep: string,
): ArtifactRecord | null {
  const versions = listArtifactVersions(runId, flowStep);
  return versions.length ? versions[versions.length - 1] : null;
}

export interface ArtifactQuery {
  flow_step?: string;
  agent_id?: string;
  claim_type?: ClaimType;
  min_confidence?: ArtifactMeta["confidence"];
}

const CONFIDENCE_RANK: Record<ArtifactMeta["confidence"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function queryArtifacts(runId: string, filter: ArtifactQuery): ArtifactIndexEntry[] {
  return readIndex(runId).filter((entry) => {
    if (filter.flow_step && entry.flow_step !== filter.flow_step) return false;
    if (filter.agent_id && entry.agent_id !== filter.agent_id) return false;
    if (filter.claim_type && !(entry.claim_counts[filter.claim_type] ?? 0)) return false;
    if (
      filter.min_confidence &&
      CONFIDENCE_RANK[entry.confidence] < CONFIDENCE_RANK[filter.min_confidence]
    ) {
      return false;
    }
    return true;
  });
}

function latestRecordsByStep(runId: string): ArtifactRecord[] {
  const index = readIndex(runId);
  const flowSteps = Array.from(new Set(index.map((e) => e.flow_step)));
  return flowSteps
    .map((step) => getLatestArtifactVersion(runId, step))
    .filter((r): r is ArtifactRecord => r !== null);
}

interface ClaimHit {
  flow_step: string;
  agent_name: string;
  confidence: ArtifactMeta["confidence"];
  created_at: string;
  gate_decision: GateAction | null;
  text: string;
  source: string | null;
}

function getClaimsByType(runId: string, type: ClaimType): ClaimHit[] {
  const hits: ClaimHit[] = [];
  for (const record of latestRecordsByStep(runId)) {
    for (const claim of record.meta.claims) {
      if (claim.type !== type) continue;
      hits.push({
        flow_step: record.flow_step,
        agent_name: record.agent_name,
        confidence: record.meta.confidence,
        created_at: record.created_at,
        gate_decision: record.gate_decision,
        text: claim.text,
        source: claim.source,
      });
    }
  }
  return hits;
}

/** Shaped to match company/governance/assumption-register-template.md's field
 * names. Fields the current schema doesn't derive (impact_if_wrong,
 * validation_method, related_decision) are left null rather than guessed -
 * there's no separate validation workflow feeding this yet. */
export function getAssumptionRegister(runId: string) {
  return getClaimsByType(runId, "assumption").map((hit, idx) => ({
    assumption_id: `A-${hit.flow_step}-${idx + 1}`,
    assumption: hit.text,
    owner: hit.agent_name,
    evidence: hit.source,
    confidence: hit.confidence,
    impact_if_wrong: null as null,
    validation_method: null as null,
    status: "unvalidated" as const,
    date_raised: hit.created_at,
    date_resolved: null as null,
    related_decision: null as null,
    related_flow_step: hit.flow_step,
  }));
}

/** Shaped to match company/governance/decision-log-template.md's field names.
 * status is derived from the gate outcome that followed this artifact
 * version, when known; "proposed" otherwise. */
export function getDecisionLog(runId: string) {
  return getClaimsByType(runId, "decision").map((hit, idx) => ({
    decision_id: `D-${hit.flow_step}-${idx + 1}`,
    date: hit.created_at,
    decision: hit.text,
    context: null as null,
    options_considered: null as null,
    recommendation: null as null,
    decision_maker: hit.agent_name,
    supporting_agents: null as null,
    evidence: hit.source,
    risks: null as null,
    expected_outcome: null as null,
    actual_outcome: null as null,
    status:
      hit.gate_decision === "no_go_exit"
        ? "rejected"
        : hit.gate_decision === "advance"
          ? "approved"
          : "proposed",
    review_date: null as null,
    related_flow_step: hit.flow_step,
  }));
}
