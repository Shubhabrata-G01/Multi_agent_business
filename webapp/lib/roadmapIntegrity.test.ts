import { describe, it, expect } from "vitest";
import { validateRoadmapIntegrity, roadmapIntegrityErrors } from "./roadmapIntegrity";
import { buildSoftwareSaasV1Roadmap } from "./templates/softwareSaasV1";
import type { Roadmap, WorkflowNode } from "./types";

function makeNode(partial: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    flow_step: "01",
    business_phase: "Inception",
    activity: "do a thing",
    primary_role: "CEO",
    supporting_roles: "CTO",
    inputs: "x",
    what_the_role_does: "y",
    output_artifact: "Thing",
    passed_to: "z",
    done_gate_criteria: "done",
    loop_reentry_condition: "n/a",
    id: "n1",
    required_capabilities: ["CEO-001"],
    reviewer_capabilities: ["CTO-001"],
    risk_level: 0,
    is_gate: false,
    evidence_led: false,
    depends_on: [],
    ...partial,
  };
}

function makeRoadmap(nodes: WorkflowNode[]): Roadmap {
  return { template_id: "test", packs: [], nodes };
}

describe("validateRoadmapIntegrity on the real software-saas-v1 roadmap", () => {
  const findings = validateRoadmapIntegrity(buildSoftwareSaasV1Roadmap());
  const errors = findings.filter((f) => f.severity === "error");

  it("has no blocking errors", () => {
    expect(errors).toEqual([]);
  });

  it("warns about the two remaining co-primary steps (68, 70) and no others", () => {
    const multi = findings.filter((f) => f.check === "single-primary-owner");
    expect(multi.map((f) => f.node_id).sort()).toEqual(["saas.68", "saas.70"]);
    expect(multi.every((f) => f.severity === "warning")).toBe(true);
  });

  it("flags Legal/Security as lacking a single integrator", () => {
    const integ = findings.filter((f) => f.check === "named-integrator");
    expect(integ).toHaveLength(1);
    expect(integ[0].detail).toContain("Legal / Security");
  });

  it("does NOT flag Operations/Finance/Design (they share one common head)", () => {
    const integ = findings.filter((f) => f.check === "named-integrator");
    const detail = integ.map((f) => f.detail).join(" ");
    expect(detail).not.toContain("Operations");
    expect(detail).not.toContain("Finance");
    expect(detail).not.toContain("Design / UX");
  });

  it("flags Operations (and only Operations among operational teams) as owning no primary node", () => {
    const floor = findings.filter((f) => f.check === "operational-ownership-floor");
    expect(floor).toHaveLength(1);
    expect(floor[0].severity).toBe("warning");
    expect(floor[0].detail).toContain("Operations");
  });
});

describe("validateRoadmapIntegrity structural checks", () => {
  it("errors on a node with no primary owner", () => {
    const f = validateRoadmapIntegrity(makeRoadmap([makeNode({ required_capabilities: [] })]));
    expect(f.some((x) => x.check === "single-primary-owner" && x.severity === "error")).toBe(true);
  });

  it("warns on a node with multiple primary owners", () => {
    const f = validateRoadmapIntegrity(
      makeRoadmap([makeNode({ required_capabilities: ["CEO-001", "COO-001"] })]),
    );
    const owner = f.find((x) => x.check === "single-primary-owner");
    expect(owner?.severity).toBe("warning");
  });

  it("errors when the primary owner also reviews its own artifact (four-eyes)", () => {
    const f = validateRoadmapIntegrity(
      makeRoadmap([makeNode({ required_capabilities: ["CEO-001"], reviewer_capabilities: ["CEO-001"] })]),
    );
    expect(f.some((x) => x.check === "four-eyes" && x.severity === "error")).toBe(true);
  });

  it("errors on an unknown capability id", () => {
    const f = validateRoadmapIntegrity(
      makeRoadmap([makeNode({ reviewer_capabilities: ["NOPE-999"] })]),
    );
    expect(f.some((x) => x.check === "known-capabilities" && x.severity === "error")).toBe(true);
  });

  it("errors on a dangling depends_on reference", () => {
    const f = validateRoadmapIntegrity(makeRoadmap([makeNode({ depends_on: ["saas.999"] })]));
    expect(f.some((x) => x.check === "graph-refs" && x.severity === "error")).toBe(true);
  });

  it("errors on a loop_reentry_target that matches no node's flow step", () => {
    const f = validateRoadmapIntegrity(
      makeRoadmap([makeNode({ flow_step: "01", loop_reentry_target: "999" })]),
    );
    expect(f.some((x) => x.check === "graph-refs" && x.severity === "error")).toBe(true);
  });

  it("roadmapIntegrityErrors returns only error-severity findings", () => {
    const roadmap = makeRoadmap([makeNode({ required_capabilities: [] })]);
    const errs = roadmapIntegrityErrors(roadmap);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.every((e) => e.severity === "error")).toBe(true);
  });
});
