// PostgreSQL-backed artifact repository (see lib/storageBackend.ts). Mirrors
// lib/fs/fsArtifactStore.ts's semantics exactly (immutable versions, index/
// query shape, assumption register / decision log derivation) but normalizes
// flow_step/attempt/agent_id/confidence/evidence_quality/gate_decision into
// real columns (STEP 2 item 3) instead of scanning JSON files.
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { ArtifactMeta, ClaimType, GateAction } from "../types";

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

function rowToRecord(row: { data: Prisma.JsonValue }): ArtifactRecord {
  return row.data as unknown as ArtifactRecord;
}

function claimCounts(meta: ArtifactMeta): Partial<Record<ClaimType, number>> {
  const counts: Partial<Record<ClaimType, number>> = {};
  for (const claim of meta.claims) {
    counts[claim.type] = (counts[claim.type] ?? 0) + 1;
  }
  return counts;
}

function toIndexEntry(record: ArtifactRecord): ArtifactIndexEntry {
  return {
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
  };
}

/**
 * Persists one immutable Creator/revision attempt as a new artifact version.
 * (run_id, flow_step, attempt) is unique - a second write for the same triple
 * is a bug upstream (attempt numbers only ever increment), so it fails loudly
 * via the unique constraint rather than silently overwriting history.
 */
export async function saveArtifactVersion(record: ArtifactRecord): Promise<void> {
  try {
    await prisma.artifactVersion.create({
      data: {
        run_id: record.run_id,
        flow_step: record.flow_step,
        attempt: record.attempt,
        created_at: new Date(record.created_at),
        gate_decision: record.gate_decision,
        gate_reason: record.gate_reason,
        agent_id: record.agent_id,
        confidence: record.meta.confidence,
        evidence_quality: record.meta.evidence_quality,
        data: record as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(
        `Artifact version already exists for run ${record.run_id} step ${record.flow_step} attempt ${record.attempt} - artifact versions are immutable and cannot be overwritten.`,
      );
    }
    throw err;
  }
}

/** Updates a version's gate_decision/gate_reason after evaluateGate() runs,
 * without changing its content/meta - the artifact itself is immutable, but
 * "what happened next" is only known after the fact. */
export async function recordGateDecision(
  runId: string,
  flowStep: string,
  attempt: number,
  decision: GateAction,
  reason: string | null,
): Promise<void> {
  const row = await prisma.artifactVersion.findUnique({
    where: { run_id_flow_step_attempt: { run_id: runId, flow_step: flowStep, attempt } },
  });
  if (!row) return;
  const record = rowToRecord(row);
  record.gate_decision = decision;
  record.gate_reason = reason;
  await prisma.artifactVersion.update({
    where: { id: row.id },
    data: {
      gate_decision: decision,
      gate_reason: reason,
      data: record as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function listArtifactVersions(runId: string, flowStep: string): Promise<ArtifactRecord[]> {
  const rows = await prisma.artifactVersion.findMany({
    where: { run_id: runId, flow_step: flowStep },
    orderBy: { attempt: "asc" },
  });
  return rows.map(rowToRecord);
}

export async function getLatestArtifactVersion(
  runId: string,
  flowStep: string,
): Promise<ArtifactRecord | null> {
  const row = await prisma.artifactVersion.findFirst({
    where: { run_id: runId, flow_step: flowStep },
    orderBy: { attempt: "desc" },
  });
  return row ? rowToRecord(row) : null;
}

export async function queryArtifacts(runId: string, filter: ArtifactQuery): Promise<ArtifactIndexEntry[]> {
  const where: Prisma.ArtifactVersionWhereInput = { run_id: runId };
  if (filter.flow_step) where.flow_step = filter.flow_step;
  if (filter.agent_id) where.agent_id = filter.agent_id;
  if (filter.min_confidence) {
    const allowed = (Object.keys(CONFIDENCE_RANK) as ArtifactMeta["confidence"][]).filter(
      (c) => CONFIDENCE_RANK[c] >= CONFIDENCE_RANK[filter.min_confidence!],
    );
    where.confidence = { in: allowed };
  }
  const rows = await prisma.artifactVersion.findMany({ where, orderBy: { created_at: "asc" } });
  return rows
    .map(rowToRecord)
    .map(toIndexEntry)
    .filter((entry) => !filter.claim_type || (entry.claim_counts[filter.claim_type] ?? 0) > 0);
}

async function latestRecordsByStep(runId: string): Promise<ArtifactRecord[]> {
  // Latest attempt per flow_step, in one query via Postgres DISTINCT ON
  // rather than N getLatestArtifactVersion round-trips.
  const rows = await prisma.$queryRaw<{ data: Prisma.JsonValue }[]>(Prisma.sql`
    SELECT DISTINCT ON (flow_step) data
    FROM "ArtifactVersion"
    WHERE run_id = ${runId}
    ORDER BY flow_step, attempt DESC
  `);
  return rows.map(rowToRecord);
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

async function getClaimsByType(runId: string, type: ClaimType): Promise<ClaimHit[]> {
  const hits: ClaimHit[] = [];
  for (const record of await latestRecordsByStep(runId)) {
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
export async function getAssumptionRegister(runId: string) {
  return (await getClaimsByType(runId, "assumption")).map((hit, idx) => ({
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
export async function getDecisionLog(runId: string) {
  return (await getClaimsByType(runId, "decision")).map((hit, idx) => ({
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
