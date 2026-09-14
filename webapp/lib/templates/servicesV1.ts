import { inferRequiredMedium } from "../mediumValidator";
import type { Roadmap, WorkflowNode } from "../types";

// The first non-SaaS base template: a services / agency business lifecycle
// (§5, Phase 1a). Authored directly as WorkflowNodes rather than adapted from
// business-flow.json (which is SaaS-specific). Deliberately compact and honest -
// a real services lifecycle, not a fabricated 81-step clone - staffed by agents
// that actually exist in the registry. Notably it gives Operations (BOM-001) a
// PRIMARY node (delivery methodology), which the SaaS flow never does.

export const SERVICES_V1_TEMPLATE_ID = "services-v1";

interface NodeDef {
  step: string;
  phase: string;
  activity: string;
  primary: string;
  reviewers: string[];
  artifact: string;
  what: string;
  done: string;
  inputs: string;
  is_gate?: boolean;
  evidence_led?: boolean;
  risk_level?: 0 | 1 | 2 | 3 | 4;
}

const NODES: NodeDef[] = [
  {
    step: "01", phase: "Inception", activity: "Define the agency's focus and ideal client",
    primary: "CEO-001", reviewers: ["CMO-001"], artifact: "Agency Concept & Focus",
    what: "Set the service focus, ideal-client profile, and differentiation thesis.",
    done: "A focused service concept and ideal-client profile are stated.", inputs: "Founder idea",
  },
  {
    step: "02", phase: "Problem Discovery", activity: "Research target clients and their problems",
    primary: "UXR-001", reviewers: ["PM-001"], artifact: "Client Problem Brief",
    what: "Interview/observe target clients to validate the problem and buying triggers.",
    done: "The client problem and buying triggers are evidenced, not assumed.", inputs: "Agency concept",
    evidence_led: true,
  },
  {
    step: "03", phase: "Market Validation", activity: "Validate positioning and niche",
    primary: "PMM-001", reviewers: ["CMO-001", "CEO-001"], artifact: "Positioning Statement",
    what: "Define and test positioning against competitor agencies and the target niche.",
    done: "Positioning is differentiated and validated against alternatives.", inputs: "Client problem brief",
    evidence_led: true,
  },
  {
    step: "04", phase: "Business Model", activity: "Design the service model and pricing",
    primary: "CFO-001", reviewers: ["CEO-001", "CRO-001"], artifact: "Service Model & Pricing",
    what: "Choose retainer/project/outcome pricing and model the unit economics of delivery.",
    done: "A pricing model with defensible per-engagement economics exists.", inputs: "Positioning",
  },
  {
    step: "05", phase: "Go / No-Go", activity: "Go/No-Go on launching the service line",
    primary: "CEO-001", reviewers: ["CFO-001"], artifact: "Go / No-Go Decision",
    what: "Decide whether to launch the service line based on demand and economics.",
    done: "A clear Go or No-Go with reasoning is recorded.", inputs: "Model, validation",
    is_gate: true, risk_level: 2,
  },
  {
    step: "06", phase: "Offering Design", activity: "Define the productized service offering",
    primary: "CPO-001", reviewers: ["PM-001", "BOM-001"], artifact: "Service Offering Spec",
    what: "Scope the offering into clear deliverables, boundaries, and acceptance criteria.",
    done: "Deliverables, exclusions, and acceptance criteria are specified.", inputs: "Go decision",
  },
  {
    step: "07", phase: "Delivery Operations", activity: "Design the delivery methodology and SOPs",
    primary: "BOM-001", reviewers: ["COO-001", "QA-001"], artifact: "Delivery Playbook",
    what: "Author the delivery methodology, SOPs, roles, and hand-off checklists for engagements.",
    done: "A repeatable delivery playbook with owners and SLAs exists.", inputs: "Offering spec",
  },
  {
    step: "08", phase: "Go-to-Market", activity: "Plan demand generation and channels",
    primary: "CMO-001", reviewers: ["PMM-001", "CONT-001"], artifact: "Go-to-Market Plan",
    what: "Define channels, content, and lead-generation motion for the service.",
    done: "A channel plan with a lead-gen motion and targets exists.", inputs: "Positioning, offering",
  },
  {
    step: "09", phase: "Sales", activity: "Build the sales process and proposal templates",
    primary: "CRO-001", reviewers: ["AE-001", "GC-001"], artifact: "Sales Playbook & Proposal Template",
    what: "Define the discovery-to-close process, proposal/SOW templates, and terms.",
    done: "A sales process and compliant proposal/SOW template exist.", inputs: "Pricing, offering",
    is_gate: true, risk_level: 2,
  },
  {
    step: "10", phase: "Delivery", activity: "Deliver the first client engagement",
    primary: "EM-001", reviewers: ["BOM-001", "QA-001"], artifact: "First Engagement Delivery",
    what: "Execute the first engagement against the playbook and capture what actually happened.",
    done: "The first engagement is delivered against acceptance criteria.", inputs: "Playbook, sale",
  },
  {
    step: "11", phase: "Quality", activity: "Review delivery quality and client satisfaction",
    primary: "QA-001", reviewers: ["HCS-001"], artifact: "Quality & Satisfaction Review",
    what: "Assess delivery quality and client satisfaction; feed defects back into the playbook.",
    done: "Quality and satisfaction are measured with actions to close gaps.", inputs: "Engagement delivery",
    evidence_led: true,
  },
  {
    step: "12", phase: "Retention", activity: "Plan retention, renewal, and expansion",
    primary: "HCS-001", reviewers: ["CSM-001", "CRO-001"], artifact: "Retention & Expansion Plan",
    what: "Define the renewal motion and account-expansion plan for delivered clients.",
    done: "A renewal and expansion plan per account exists.", inputs: "Satisfaction review",
  },
];

export function buildServicesV1Roadmap(): Roadmap {
  const nodes: WorkflowNode[] = NODES.map((d, idx) => {
    const node: WorkflowNode = {
      flow_step: d.step,
      business_phase: d.phase,
      activity: d.activity,
      primary_role: d.primary,
      supporting_roles: d.reviewers.join("; "),
      inputs: d.inputs,
      what_the_role_does: d.what,
      output_artifact: d.artifact,
      passed_to: "downstream steps",
      done_gate_criteria: d.done,
      loop_reentry_condition: "n/a",
      id: `svc.${d.step}`,
      required_capabilities: [d.primary],
      reviewer_capabilities: d.reviewers,
      risk_level: d.risk_level ?? (d.is_gate ? 2 : 0),
      is_gate: d.is_gate ?? false,
      evidence_led: d.evidence_led ?? false,
      depends_on: idx > 0 ? [`svc.${NODES[idx - 1].step}`] : [],
    };
    node.required_medium = inferRequiredMedium(node);
    return node;
  });
  return { template_id: SERVICES_V1_TEMPLATE_ID, packs: [], nodes };
}
