import { describe, it, expect } from "vitest";
import { creatorForNode, reviewersForNode, routeNode } from "./router";
import { getPrimaryAgentsForStep } from "./businessFlow";
import type { FlowStepDef, WorkflowNode } from "./types";

function node(partial: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    flow_step: "n1",
    business_phase: "Compliance",
    activity: "x",
    primary_role: "GC",
    supporting_roles: "SEC",
    inputs: "i",
    what_the_role_does: "w",
    output_artifact: "A",
    passed_to: "p",
    done_gate_criteria: "d",
    loop_reentry_condition: "n/a",
    id: "n1",
    required_capabilities: ["GC-001"],
    reviewer_capabilities: ["SEC-001", "CFO-001"],
    risk_level: 2,
    is_gate: false,
    evidence_led: false,
    depends_on: [],
    ...partial,
  };
}

describe("creatorForNode", () => {
  it("returns the first required capability that resolves to an agent", () => {
    expect(creatorForNode(node())?.id).toBe("GC-001");
  });

  it("skips unknown ids and picks the first real one", () => {
    expect(creatorForNode(node({ required_capabilities: ["NOPE-1", "CTO-001"] }))?.id).toBe("CTO-001");
  });

  it("returns undefined when no required capability resolves", () => {
    expect(creatorForNode(node({ required_capabilities: ["NOPE-1"] }))).toBeUndefined();
  });

  it("falls back to the flow's primary mapping for a legacy node", () => {
    const legacy = { flow_step: "13", business_phase: "Go / No-Go" } as FlowStepDef;
    expect(creatorForNode(legacy)?.id).toBe(getPrimaryAgentsForStep("13")[0]?.id);
  });
});

describe("reviewersForNode", () => {
  it("resolves reviewer capabilities, capped at max", () => {
    expect(reviewersForNode(node(), 1).map((a) => a.id)).toEqual(["SEC-001"]);
    expect(reviewersForNode(node(), 5).map((a) => a.id)).toEqual(["SEC-001", "CFO-001"]);
  });

  it("never returns the node's own creator as a reviewer of its own artifact", () => {
    const n = node({ required_capabilities: ["SEC-001"], reviewer_capabilities: ["SEC-001", "GC-001"] });
    expect(reviewersForNode(n, 5).map((a) => a.id)).toEqual(["GC-001"]);
  });

  it("skips unknown reviewer ids", () => {
    const n = node({ reviewer_capabilities: ["NOPE-1", "SEC-001"] });
    expect(reviewersForNode(n, 5).map((a) => a.id)).toEqual(["SEC-001"]);
  });
});

describe("routeNode", () => {
  it("reports dropped capability ids that did not resolve", () => {
    const r = routeNode(node({ required_capabilities: ["GC-001"], reviewer_capabilities: ["NOPE-9"] }), 5);
    expect(r.creator?.id).toBe("GC-001");
    expect(r.dropped).toContain("NOPE-9");
  });
});
