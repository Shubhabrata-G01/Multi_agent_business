import { describe, it, expect } from "vitest";
import {
  buildSoftwareSaasV1Roadmap,
  SOFTWARE_SAAS_V1_TEMPLATE_ID,
  softwareSaasV1NodeId,
} from "./softwareSaasV1";
import {
  getFlowSteps,
  getPrimaryAgentsForStep,
  getSupportingAgentsForStep,
  isEvidenceLedPhase,
  isGateStep,
  parseReturnToStep,
} from "../businessFlow";

// Adapter-fidelity suite: the whole point of Phase 0b is that moving the
// workflow behind a per-run roadmap changes NOTHING observable about a
// software-saas-v1 run. These tests are that guarantee - if the adapter ever
// drifts from the source flow + registry mappings, they fail.
describe("software-saas-v1 adapter fidelity", () => {
  const roadmap = buildSoftwareSaasV1Roadmap();
  const flow = getFlowSteps();

  it("uses the template id and emits one node per flow step, in order", () => {
    expect(roadmap.template_id).toBe(SOFTWARE_SAAS_V1_TEMPLATE_ID);
    expect(roadmap.packs).toEqual([]);
    expect(roadmap.nodes).toHaveLength(flow.length);
    expect(roadmap.nodes.map((n) => n.flow_step)).toEqual(flow.map((s) => s.flow_step));
  });

  it("preserves every FlowStepDef field verbatim on each node", () => {
    roadmap.nodes.forEach((node, i) => {
      const s = flow[i];
      expect(node.business_phase).toBe(s.business_phase);
      expect(node.activity).toBe(s.activity);
      expect(node.primary_role).toBe(s.primary_role);
      expect(node.supporting_roles).toBe(s.supporting_roles);
      expect(node.inputs).toBe(s.inputs);
      expect(node.what_the_role_does).toBe(s.what_the_role_does);
      expect(node.output_artifact).toBe(s.output_artifact);
      expect(node.passed_to).toBe(s.passed_to);
      expect(node.done_gate_criteria).toBe(s.done_gate_criteria);
      expect(node.loop_reentry_condition).toBe(s.loop_reentry_condition);
    });
  });

  it("derives gate/evidence/capabilities/loop-target exactly from the existing helpers", () => {
    roadmap.nodes.forEach((node, i) => {
      const s = flow[i];
      expect(node.is_gate).toBe(isGateStep(s));
      expect(node.evidence_led).toBe(isEvidenceLedPhase(s.business_phase));
      expect(node.required_capabilities).toEqual(
        getPrimaryAgentsForStep(s.flow_step).map((a) => a.id),
      );
      expect(node.reviewer_capabilities).toEqual(
        getSupportingAgentsForStep(s.flow_step).map((a) => a.id),
      );
      expect(node.loop_reentry_target).toBe(
        parseReturnToStep(s.loop_reentry_condition) ?? undefined,
      );
    });
  });

  it("assigns risk_level 2 to gate nodes and 0 otherwise, and links depends_on to the prior node", () => {
    roadmap.nodes.forEach((node, i) => {
      expect(node.risk_level).toBe(node.is_gate ? 2 : 0);
      if (i === 0) {
        expect(node.depends_on).toEqual([]);
      } else {
        expect(node.depends_on).toEqual([softwareSaasV1NodeId(flow[i - 1].flow_step)]);
      }
    });
  });

  it("gives every node a stable, unique id", () => {
    const ids = roadmap.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(softwareSaasV1NodeId(flow[0].flow_step));
  });
});
