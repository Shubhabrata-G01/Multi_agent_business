import {
  getFlowSteps,
  getPrimaryAgentsForStep,
  getSupportingAgentsForStep,
  isEvidenceLedPhase,
  isGateStep,
  parseReturnToStep,
} from "../businessFlow";
import { inferRequiredMedium } from "../mediumValidator";
import type { Roadmap, WorkflowNode } from "../types";

// The first roadmap template: the existing 81-step software/SaaS business flow,
// adapted 1:1 into the Roadmap/WorkflowNode shape. This is deliberately a pure
// re-projection of the same source of truth (company/workflow/business-flow.json
// + registry.json) that the orchestrator used directly before Phase 0b - see
// company/architecture/12-business-os-evolution.md §3.4/§5. The adapter-fidelity
// test asserts the node sequence, gate flags, evidence-led flags, and
// primary/reviewer mappings reproduce exactly what the helpers return, so this
// refactor changes nothing observable about a run.
export const SOFTWARE_SAAS_V1_TEMPLATE_ID = "software-saas-v1";

/** Stable node id for a given flow step within this template. */
export function softwareSaasV1NodeId(flowStep: string): string {
  return `saas.${flowStep}`;
}

export function buildSoftwareSaasV1Roadmap(): Roadmap {
  const steps = getFlowSteps();
  const nodes: WorkflowNode[] = steps.map((s, idx) => {
    const gate = isGateStep(s);
    return {
      // WorkflowNode is a superset of FlowStepDef, so spread keeps every
      // original field (flow_step, business_phase, activity, primary_role,
      // supporting_roles, inputs, what_the_role_does, output_artifact,
      // passed_to, done_gate_criteria, loop_reentry_condition) verbatim.
      ...s,
      id: softwareSaasV1NodeId(s.flow_step),
      required_capabilities: getPrimaryAgentsForStep(s.flow_step).map((a) => a.id),
      reviewer_capabilities: getSupportingAgentsForStep(s.flow_step).map((a) => a.id),
      // Gate steps are Level-2 decision artifacts in the org design; everything
      // else is Level 0 in this template. Real per-node risk classification is a
      // later phase (capability packs); this preserves today's behavior, where
      // only gate steps run the Approver/Executor phase.
      risk_level: gate ? 2 : 0,
      is_gate: gate,
      evidence_led: isEvidenceLedPhase(s.business_phase),
      depends_on: idx > 0 ? [softwareSaasV1NodeId(steps[idx - 1].flow_step)] : [],
      loop_reentry_target: parseReturnToStep(s.loop_reentry_condition) ?? undefined,
      required_medium: inferRequiredMedium(s),
    };
  });
  return { template_id: SOFTWARE_SAAS_V1_TEMPLATE_ID, packs: [], nodes };
}
