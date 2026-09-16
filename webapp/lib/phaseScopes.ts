// Phased execution (STEP 8 items 1/2/5): lets a user run only part of the
// 81-step flow instead of always committing to the full build. Phases in
// company/workflow/business-flow.json are contiguous blocks of flow_step
// (verified: every step of a given business_phase is adjacent - see
// lib/phaseScopes.test.ts), so "run through phase X" is just "truncate the
// roadmap's node list after the last step whose business_phase is X."
//
// The flow's own 26 fine-grained phases don't map one-to-one onto the 8
// coarse scopes a user actually wants to pick from, so each scope names the
// LAST fine-grained phase it runs through. "finance" is the one honest
// compromise: this flow has no standalone late-stage finance phase reachable
// without the fuller build, so it's defined as "run far enough to know if
// the business is profitable" (through Profitability), not an isolated slice.
import type { Roadmap } from "./types";

export type PhaseScope =
  | "discovery"
  | "validation"
  | "go_no_go"
  | "strategy"
  | "product"
  | "engineering"
  | "finance"
  | "full";

export interface PhaseScopeDef {
  id: PhaseScope;
  label: string;
  description: string;
  /** The last business_phase this scope runs through; null = no limit ("full"). */
  throughPhase: string | null;
}

export const PHASE_SCOPES: PhaseScopeDef[] = [
  {
    id: "discovery",
    label: "Discovery only",
    description: "Capture the idea and frame the problem (Inception + Problem Discovery).",
    throughPhase: "Problem Discovery",
  },
  {
    id: "validation",
    label: "Validation only",
    description: "Through market validation and business model.",
    throughPhase: "Business Model",
  },
  {
    id: "go_no_go",
    label: "Go / No-Go",
    description: "Everything needed to reach the initial go/no-go decision gate.",
    throughPhase: "Go / No-Go",
  },
  {
    id: "strategy",
    label: "Strategy",
    description: "Through product strategy.",
    throughPhase: "Product Strategy",
  },
  {
    id: "product",
    label: "Product",
    description: "Through product discovery, product definition, and UX design.",
    throughPhase: "UX Design",
  },
  {
    id: "engineering",
    label: "Engineering",
    description: "Through architecture, technical design, development, and quality.",
    throughPhase: "Quality",
  },
  {
    id: "finance",
    label: "Finance / viability",
    description:
      "The full build through profitability analysis - this flow's financial modeling spans " +
      "Business Model through Profitability, so this means \"far enough to know if it's " +
      "profitable,\" not an isolated finance-only slice.",
    throughPhase: "Profitability",
  },
  {
    id: "full",
    label: "Full company build",
    description: "All steps, Inception through Expansion.",
    throughPhase: null,
  },
];

const SCOPE_BY_ID = new Map(PHASE_SCOPES.map((s) => [s.id, s]));

export function isPhaseScope(value: unknown): value is PhaseScope {
  return typeof value === "string" && SCOPE_BY_ID.has(value as PhaseScope);
}

/** The last flow_step a given scope should run through, for this specific
 * roadmap (a services-template roadmap may not contain every phase the
 * software template does - returns null, meaning "no limit found," if the
 * scope's named phase isn't present in this roadmap at all). */
export function lastStepOfScope(roadmap: Roadmap, scope: PhaseScope): string | null {
  const def = SCOPE_BY_ID.get(scope);
  if (!def || !def.throughPhase) return null;
  let last: string | null = null;
  for (const node of roadmap.nodes) {
    if (node.business_phase === def.throughPhase) last = node.flow_step;
  }
  return last;
}
