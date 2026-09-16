// Dispatches to the PostgreSQL artifact repository (lib/db/artifactRepository.ts)
// or the JSON-filesystem fallback (lib/fs/fsArtifactStore.ts) based on
// lib/storageBackend.ts. Every operation is async and must be awaited by
// callers - see STEP 2 of the remediation plan. This module intentionally has
// no persistence logic of its own beyond the evidence-ledger lookup below,
// which just reads the run's own `evidence` field (see lib/evidence.ts) and
// so doesn't need a backend-specific implementation.
import { getStorageBackend } from "./storageBackend";
import * as fsStore from "./fs/fsArtifactStore";
import * as pgStore from "./db/artifactRepository";
import { loadRun } from "./runStore";
import type { ClaimType, Evidence, GateAction } from "./types";

export type { ArtifactRecord, ArtifactIndexEntry, ArtifactQuery } from "./fs/fsArtifactStore";

function backend() {
  return getStorageBackend() === "postgres" ? pgStore : fsStore;
}

export async function saveArtifactVersion(
  record: import("./fs/fsArtifactStore").ArtifactRecord,
): Promise<void> {
  return backend().saveArtifactVersion(record);
}

export async function recordGateDecision(
  runId: string,
  flowStep: string,
  attempt: number,
  decision: GateAction,
  reason: string | null,
): Promise<void> {
  return backend().recordGateDecision(runId, flowStep, attempt, decision, reason);
}

export async function listArtifactVersions(runId: string, flowStep: string) {
  return backend().listArtifactVersions(runId, flowStep);
}

export async function getLatestArtifactVersion(runId: string, flowStep: string) {
  return backend().getLatestArtifactVersion(runId, flowStep);
}

export async function queryArtifacts(
  runId: string,
  filter: import("./fs/fsArtifactStore").ArtifactQuery,
) {
  return backend().queryArtifacts(runId, filter);
}

export async function getAssumptionRegister(runId: string) {
  return backend().getAssumptionRegister(runId);
}

export async function getDecisionLog(runId: string) {
  return backend().getDecisionLog(runId);
}

export interface EvidenceQuery {
  flow_step?: string;
  claim_type?: ClaimType;
}

/**
 * Evidence lookup (STEP 2 item 2): the run-level ledger of source-backed
 * claims (see lib/evidence.ts's extractEvidence, appended to run.evidence by
 * orchestrator.ts) - a citation trail that spans every step, not just one
 * artifact's own claims. Lives on the Run row (JSONB `data.evidence`) rather
 * than ArtifactVersion, so this reads through runStore rather than needing
 * its own table.
 */
export async function getEvidenceLedger(runId: string, filter: EvidenceQuery = {}): Promise<Evidence[]> {
  const run = await loadRun(runId);
  const evidence = run?.evidence ?? [];
  return evidence.filter((e) => {
    if (filter.flow_step && e.flow_step !== filter.flow_step) return false;
    if (filter.claim_type && e.claim_type !== filter.claim_type) return false;
    return true;
  });
}
