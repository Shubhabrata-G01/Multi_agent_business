import { inferRequiredMedium } from "./mediumValidator";
import type { BusinessProfile, Roadmap, WorkflowNode } from "./types";

// Capability packs (§3.5). A pack is a named bundle of extra workflow nodes that
// is merged into the base roadmap ONLY when the classifier's risk flags call for
// it - the core principle from the evolution analysis: fintech/health/marketplace
// capabilities are never global, they activate per-idea. A plain-SaaS profile
// (no risk flags) yields exactly the base roadmap with no packs.

interface PackNodeDef {
  slug: string; // unique within the pack
  business_phase: string;
  activity: string;
  primary: string; // registry agent id (Creator)
  reviewers: string[]; // registry agent ids (Critics)
  output_artifact: string;
  what_the_role_does: string;
  done_gate_criteria: string;
  inputs: string;
  evidence_led?: boolean;
  risk_level?: 0 | 1 | 2 | 3 | 4;
}

export interface CapabilityPack {
  id: string;
  title: string;
  // Business phase after whose last node the pack's nodes are inserted (so
  // compliance/controls land at the right point in the lifecycle).
  anchor_phase: string;
  nodes: PackNodeDef[];
}

// Registry agents referenced below all exist (GC-001, SEC-001, CFO-001, CTRL-001,
// PM-001, CPO-001, CMO-001, DE-001). Kept small and real - two nodes per pack.
export const PACKS: CapabilityPack[] = [
  {
    id: "fintech",
    title: "Financial services / fintech",
    anchor_phase: "Security",
    nodes: [
      {
        slug: "licensing",
        business_phase: "Regulatory Compliance",
        activity: "Assess licensing, registration, and regulatory obligations",
        primary: "GC-001",
        reviewers: ["SEC-001", "CFO-001"],
        output_artifact: "Regulatory & Licensing Assessment",
        what_the_role_does:
          "Identify the licenses, registrations, and regulatory regimes (e.g. money transmission, lending, securities) the business must satisfy per jurisdiction.",
        done_gate_criteria:
          "Applicable regimes are named with a compliance path or an explicit blocker escalated to the founder.",
        inputs: "Business profile, geography, business model",
        evidence_led: true,
        risk_level: 2,
      },
      {
        slug: "payments-controls",
        business_phase: "Regulatory Compliance",
        activity: "Define payments, KYC/AML, and financial controls",
        primary: "SEC-001",
        reviewers: ["GC-001", "CTRL-001"],
        output_artifact: "Payments & KYC/AML Controls Plan",
        what_the_role_does:
          "Specify KYC/AML, transaction-monitoring, fund-flow, and reconciliation controls appropriate to the model.",
        done_gate_criteria: "Controls map to the identified obligations and to a system of record.",
        inputs: "Regulatory assessment, architecture, data flows",
        risk_level: 2,
      },
    ],
  },
  {
    id: "regulated-health",
    title: "Regulated health / health-data",
    anchor_phase: "Security",
    nodes: [
      {
        slug: "phi-handling",
        business_phase: "Regulatory Compliance",
        activity: "Assess PHI / HIPAA data-handling requirements",
        primary: "SEC-001",
        reviewers: ["GC-001", "DE-001"],
        output_artifact: "PHI / HIPAA Data-Handling Assessment",
        what_the_role_does:
          "Determine what protected health information is handled and the safeguards, BAAs, and retention rules required.",
        done_gate_criteria: "PHI data flows are mapped with required safeguards and any BAAs named.",
        inputs: "Architecture, data flows, geography",
        evidence_led: true,
        risk_level: 2,
      },
      {
        slug: "clinical-compliance",
        business_phase: "Regulatory Compliance",
        activity: "Define clinical & regulatory compliance plan",
        primary: "GC-001",
        reviewers: ["SEC-001"],
        output_artifact: "Clinical & Regulatory Compliance Plan",
        what_the_role_does:
          "Identify applicable health regulations (HIPAA, FDA SaMD where relevant) and the compliance path.",
        done_gate_criteria: "Applicable regulations named with a compliance path or an escalated blocker.",
        inputs: "PHI assessment, product definition",
        risk_level: 2,
      },
    ],
  },
  {
    id: "physical-product",
    title: "Physical product / commerce",
    anchor_phase: "Business Model",
    nodes: [
      {
        slug: "sourcing",
        business_phase: "Supply Chain",
        activity: "Plan sourcing, bill of materials, and suppliers",
        primary: "BOM-001",
        reviewers: ["CFO-001", "GC-001"],
        output_artifact: "Sourcing & Supplier Plan",
        what_the_role_does:
          "Define the bill of materials, supplier options, lead times, MOQs, and landed-cost model.",
        done_gate_criteria: "A BOM, qualified suppliers, and a landed-cost model exist.",
        inputs: "Product definition, unit economics",
        evidence_led: true,
        risk_level: 1,
      },
      {
        slug: "fulfillment",
        business_phase: "Supply Chain",
        activity: "Plan manufacturing, fulfillment, and logistics",
        primary: "BOM-001",
        reviewers: ["CFO-001", "QA-001"],
        output_artifact: "Manufacturing & Fulfillment Plan",
        what_the_role_does:
          "Specify manufacturing, QA acceptance, warehousing, fulfillment, returns, and logistics.",
        done_gate_criteria: "A production-to-delivery flow with QA gates and returns handling exists.",
        inputs: "Sourcing plan",
        risk_level: 1,
      },
    ],
  },
  {
    id: "marketplace",
    title: "Two-sided marketplace",
    anchor_phase: "Business Model",
    nodes: [
      {
        slug: "liquidity",
        business_phase: "Marketplace Design",
        activity: "Design two-sided liquidity and take-rate strategy",
        primary: "CPO-001",
        reviewers: ["CMO-001", "CFO-001"],
        output_artifact: "Marketplace Liquidity & Take-Rate Strategy",
        what_the_role_does:
          "Define the supply/demand acquisition balance, cold-start plan, and take-rate/unit economics for both sides.",
        done_gate_criteria: "A cold-start plan and take-rate with defensible unit economics exist for both sides.",
        inputs: "Business model, market validation",
        evidence_led: true,
        risk_level: 1,
      },
      {
        slug: "trust-safety",
        business_phase: "Marketplace Design",
        activity: "Define trust, safety, and dispute-resolution plan",
        primary: "SEC-001",
        reviewers: ["GC-001", "PM-001"],
        output_artifact: "Trust, Safety & Dispute-Resolution Plan",
        what_the_role_does:
          "Specify identity/verification, fraud, content moderation, and dispute/refund handling for a two-sided market.",
        done_gate_criteria: "Trust-and-safety controls and a dispute-resolution flow are specified.",
        inputs: "Marketplace model, risk flags",
        risk_level: 1,
      },
    ],
  },
];

const PACK_BY_ID = new Map(PACKS.map((p) => [p.id, p]));

// A risk-flag kind that implies a pack even when suggested_pack is vague.
const KIND_TO_PACK: Record<string, string> = {
  payments: "fintech",
  "financial-custody": "fintech",
  "health-data": "regulated-health",
  "physical-safety": "physical-product",
};

/** Pack ids a profile activates, from its risk flags (suggested_pack match, or a
 * kind that implies one). Deduped, order-stable, only real packs. */
export function activatedPackIds(profile: BusinessProfile): string[] {
  const ids: string[] = [];
  for (const flag of profile.risk_flags) {
    const bySuggested = flag.suggested_pack.trim().toLowerCase();
    const candidate = PACK_BY_ID.has(bySuggested) ? bySuggested : KIND_TO_PACK[flag.kind];
    if (candidate && PACK_BY_ID.has(candidate) && !ids.includes(candidate)) {
      ids.push(candidate);
    }
  }
  return ids;
}

function finalizePackNode(packId: string, def: PackNodeDef): WorkflowNode {
  const id = `${packId}.${def.slug}`;
  const node: WorkflowNode = {
    // FlowStepDef fields
    flow_step: id, // synthetic, unique key (pack nodes aren't in the flow JSON)
    business_phase: def.business_phase,
    activity: def.activity,
    primary_role: def.primary,
    supporting_roles: def.reviewers.join("; "),
    inputs: def.inputs,
    what_the_role_does: def.what_the_role_does,
    output_artifact: def.output_artifact,
    passed_to: "downstream steps",
    done_gate_criteria: def.done_gate_criteria,
    loop_reentry_condition: "n/a",
    // WorkflowNode fields
    id,
    required_capabilities: [def.primary],
    reviewer_capabilities: def.reviewers,
    risk_level: def.risk_level ?? 2,
    is_gate: false,
    evidence_led: def.evidence_led ?? false,
    depends_on: [], // recomputed by composeRoadmap after insertion
  };
  node.required_medium = inferRequiredMedium(node);
  return node;
}

/**
 * Compose a per-idea roadmap: the base template plus any packs the profile's risk
 * flags activate. Pack nodes are inserted after their anchor phase; depends_on is
 * then recomputed linearly across the merged sequence so the graph stays valid.
 * With no profile or no activated packs, the base is returned unchanged (aside
 * from recording generated_from when a profile exists).
 */
export function composeRoadmap(base: Roadmap, profile: BusinessProfile | undefined): Roadmap {
  if (!profile) return base;
  const packIds = activatedPackIds(profile);
  if (packIds.length === 0) {
    return { ...base, generated_from: profile };
  }

  let nodes = [...base.nodes];
  for (const packId of packIds) {
    const pack = PACK_BY_ID.get(packId);
    if (!pack) continue;
    const packNodes = pack.nodes.map((d) => finalizePackNode(packId, d));
    // Insert right after the last node of the anchor phase; if absent, before the
    // final node so pack work still precedes wrap-up.
    let insertAt = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].business_phase === pack.anchor_phase) insertAt = i + 1;
    }
    if (insertAt < 0) insertAt = Math.max(0, nodes.length - 1);
    nodes = [...nodes.slice(0, insertAt), ...packNodes, ...nodes.slice(insertAt)];
  }

  // Recompute linear depends_on across the merged order (v1 graph is a chain).
  nodes = nodes.map((n, i) => ({
    ...n,
    depends_on: i > 0 ? [nodes[i - 1].id] : [],
  }));

  return {
    template_id: base.template_id,
    packs: packIds,
    nodes,
    generated_from: profile,
  };
}
