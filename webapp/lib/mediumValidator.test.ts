import { describe, it, expect } from "vitest";
import { inferRequiredMedium, availableMedia, checkArtifactMedium } from "./mediumValidator";
import { buildSoftwareSaasV1Roadmap } from "./templates/softwareSaasV1";
import type { FlowStepDef } from "./types";

function step(partial: Partial<FlowStepDef> = {}): FlowStepDef {
  return {
    flow_step: "10",
    business_phase: "Development",
    activity: "do work",
    primary_role: "Engineer",
    supporting_roles: "QA",
    inputs: "x",
    what_the_role_does: "y",
    output_artifact: "Artifact",
    passed_to: "z",
    done_gate_criteria: "Specification is complete and reviewed.",
    loop_reentry_condition: "n/a",
    ...partial,
  };
}

describe("inferRequiredMedium", () => {
  it("detects a deployment step", () => {
    expect(inferRequiredMedium(step({ done_gate_criteria: "Deploy to production and confirm it is stable." }))).toBe("deployed");
  });

  it("detects a usability/prototype step (the DES-001 case)", () => {
    expect(
      inferRequiredMedium(step({ done_gate_criteria: "Design is validated via usability testing on a clickable prototype." })),
    ).toBe("live-prototype");
  });

  it("detects a telemetry/metric step", () => {
    expect(
      inferRequiredMedium(step({ done_gate_criteria: "Target metric or user problem improves, or hypothesis is rejected." })),
    ).toBe("telemetry");
  });

  it("detects an external-record step", () => {
    expect(inferRequiredMedium(step({ done_gate_criteria: "The books are reconciled to the bank statement." }))).toBe("external-record");
  });

  it("defaults to document for a plain spec/analysis step", () => {
    expect(inferRequiredMedium(step())).toBe("document");
  });
});

describe("availableMedia", () => {
  it("provides only document with no tool scopes", () => {
    const m = availableMedia([]);
    expect([...m]).toEqual(["document"]);
  });

  it("adds a medium when a matching tool scope is enabled", () => {
    expect(availableMedia(["figma-design"]).has("live-prototype")).toBe(true);
    expect(availableMedia(["cloud-deploy"]).has("deployed")).toBe(true);
  });
});

describe("checkArtifactMedium", () => {
  it("flags a shortfall and watermarks when the required medium can't be produced", () => {
    const r = checkArtifactMedium(step({ done_gate_criteria: "Deploy to production." }), []);
    expect(r.required).toBe("deployed");
    expect(r.shortfall).toBe(true);
    expect(r.watermark).toContain("document level");
    expect(r.note).toBeTruthy();
  });

  it("does not flag a document-level step", () => {
    const r = checkArtifactMedium(step(), []);
    expect(r.shortfall).toBe(false);
    expect(r.watermark).toBeNull();
  });

  it("does not flag when the required medium IS available via a tool scope", () => {
    const usability = step({ done_gate_criteria: "Validated via usability testing on a clickable prototype." });
    const r = checkArtifactMedium(usability, ["figma-design"]);
    expect(r.required).toBe("live-prototype");
    expect(r.shortfall).toBe(false);
  });

  it("watermarks the DES-001 usability step at document level when no design tool is connected", () => {
    const des = step({ done_gate_criteria: "Design is validated via usability testing on a clickable prototype." });
    const r = checkArtifactMedium(des, []);
    expect(r.shortfall).toBe(true);
    expect(r.watermark).toMatch(/document level, not operationally/i);
  });
});

describe("adapter sets required_medium on real nodes", () => {
  it("populates required_medium and includes at least one non-document step", () => {
    const roadmap = buildSoftwareSaasV1Roadmap();
    expect(roadmap.nodes.every((n) => n.required_medium !== undefined)).toBe(true);
    expect(roadmap.nodes.some((n) => n.required_medium !== "document")).toBe(true);
  });
});
