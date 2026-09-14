import crypto from "crypto";
import type { ArtifactMeta, Evidence } from "./types";

// Evidence extraction (Phase 1d / §3.7). Promote a step's CITED claims (those
// with a real source, after the claim-source validator has already downgraded
// any FACT that cited an unavailable tool) into run-level Evidence records, so
// the run carries a queryable citation trail rather than leaving sourced claims
// buried per-artifact. Pure - the caller appends the result to run.evidence.

export interface EvidenceContext {
  run_id: string;
  node_id: string;
  flow_step: string;
  at: string;
}

const URL_OR_REAL = /\S/;

export function extractEvidence(meta: ArtifactMeta, ctx: EvidenceContext): Evidence[] {
  const out: Evidence[] = [];
  for (const claim of meta.claims) {
    const source = (claim.source ?? "").trim();
    if (!source || !URL_OR_REAL.test(source)) continue; // only cited claims are evidence
    out.push({
      id: crypto.randomUUID(),
      run_id: ctx.run_id,
      node_id: ctx.node_id,
      flow_step: ctx.flow_step,
      claim_type: claim.type,
      text: claim.text,
      source,
      strength: "cited",
      captured_at: ctx.at,
    });
  }
  return out;
}
