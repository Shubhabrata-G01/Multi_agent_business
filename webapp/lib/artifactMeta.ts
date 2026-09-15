import { z } from "zod";
import type { ArtifactMeta, Claim } from "./types";

const ClaimSchema = z.object({
  type: z.enum([
    "fact",
    "assumption",
    "estimate",
    "inference",
    "recommendation",
    "decision",
  ]),
  text: z.string(),
  source: z.string().nullable().optional().default(null),
});

const ArtifactMetaSchema = z.object({
  status: z.enum(["ok", "blocked"]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence_quality: z.enum(["high", "medium", "low"]),
  decision: z.enum(["go", "no_go", "conditional"]).nullable().optional().default(null),
  claims: z.array(ClaimSchema).default([]),
  open_questions: z.array(z.string()).default([]),
  reason: z.string().nullable().optional().default(null),
  // Never supplied by the model - always starts empty and is filled in by
  // validateArtifactMeta() after parsing.
  validation_notes: z.array(z.string()).default([]),
});

const FENCE_RE = /```artifact-meta\s*([\s\S]*?)```\s*$/i;

export function defaultArtifactMeta(reason: string): ArtifactMeta {
  return {
    status: "ok",
    confidence: "low",
    evidence_quality: "low",
    decision: null,
    claims: [],
    open_questions: [],
    reason,
    validation_notes: [],
  };
}

/**
 * Deterministic, non-negotiable check applied after every parse - the model
 * self-reports confidence/evidence_quality/claim labels, but a claim tagged
 * FACT with no source is downgraded regardless of what it says about itself.
 * This is what "evidence must be verified, not merely self-described" means
 * in a run with no live tool access to actually check a source: it can't
 * confirm a citation is real, but it can refuse to let an uncited assertion
 * carry FACT-level weight. Every change is recorded in validation_notes, not
 * applied silently.
 */
export function validateArtifactMeta(meta: ArtifactMeta): ArtifactMeta {
  let unsourcedFacts = 0;
  const claims: Claim[] = meta.claims.map((claim) => {
    if (claim.type === "fact" && !claim.source) {
      unsourcedFacts += 1;
      return { ...claim, type: "assumption" };
    }
    return claim;
  });

  const notes = [...meta.validation_notes];
  let evidence_quality = meta.evidence_quality;

  if (unsourcedFacts > 0) {
    notes.push(
      `Downgraded ${unsourcedFacts} unsourced FACT claim(s) to ASSUMPTION - no external ` +
        "tool access is connected in this run to verify a source " +
        "(company/architecture/07-mcp-tool-integration-policy.md).",
    );
    if (evidence_quality === "high") {
      evidence_quality = "medium";
      notes.push("Capped evidence_quality at medium because unsourced FACT claim(s) were present.");
    }
  }

  return { ...meta, claims, evidence_quality, validation_notes: notes };
}

// company/architecture/09-quality-and-confidence-standards.md's FACT/ASSUMPTION/
// ESTIMATE/INFERENCE/RECOMMENDATION/DECISION taxonomy, applied per-artifact rather
// than left as prose the model may or may not follow. Never throws - a model that
// gets the format wrong loses its structured evidence for that one step, not the
// whole run.
export function parseArtifactMeta(rawText: string): { content: string; meta: ArtifactMeta } {
  const match = rawText.match(FENCE_RE);
  const content = match ? rawText.slice(0, match.index).trim() : rawText.trim();

  if (match) {
    try {
      const json = JSON.parse(match[1]);
      const parsed = ArtifactMetaSchema.safeParse(json);
      if (parsed.success) {
        return { content, meta: parsed.data as ArtifactMeta };
      }
    } catch {
      // fall through to the default below
    }
  }

  return {
    content,
    meta: defaultArtifactMeta(
      match
        ? "artifact-meta block was present but did not match the expected schema."
        : "No artifact-meta block found in the response.",
    ),
  };
}

export const ARTIFACT_META_INSTRUCTIONS = `After the artifact body, end your response with a fenced block exactly
in this form (valid JSON, no comments, no trailing commas):

\`\`\`artifact-meta
{
  "status": "ok" | "blocked",
  "confidence": "high" | "medium" | "low",
  "evidence_quality": "high" | "medium" | "low",
  "decision": "go" | "no_go" | "conditional" | null,
  "claims": [
    { "type": "fact" | "assumption" | "estimate" | "inference" | "recommendation" | "decision",
      "text": "...", "source": "..." | null }
  ],
  "open_questions": ["..."],
  "reason": "..." | null
}
\`\`\`

Rules for this block:
- "confidence" is your overall confidence in this artifact; "evidence_quality" is
  specifically how well-sourced the claims behind it are (not the same thing - you can
  be confident in a well-reasoned ASSUMPTION while rating its evidence_quality low).
- Tag every non-trivial claim in "claims": FACT (directly sourced/observed), ASSUMPTION
  (unverified premise this work depends on), ESTIMATE (a quantified guess - name your
  method in "text"), INFERENCE (a conclusion drawn from facts), RECOMMENDATION, or
  DECISION (a course of action you actually chose). Never label an ASSUMPTION or
  ESTIMATE as a FACT.
- Set "decision" only if this artifact IS a Go/No-Go-style decision; otherwise null.
- Set "status": "blocked" only if you genuinely cannot produce a usable artifact at all
  (not merely incomplete information - state that as an ASSUMPTION claim instead), and
  give "reason".
- Do not fabricate a citation. If a claim has no real source, leave "source" null and
  make sure its "type" is not "fact".`;
