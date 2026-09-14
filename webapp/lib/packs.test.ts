import { describe, it, expect } from "vitest";
import { activatedPackIds, composeRoadmap, PACKS } from "./packs";
import { buildSoftwareSaasV1Roadmap } from "./templates/softwareSaasV1";
import { roadmapIntegrityErrors } from "./roadmapIntegrity";
import type { BusinessProfile, RiskFlag } from "./types";

function profile(risk_flags: RiskFlag[]): BusinessProfile {
  return {
    idea: "x",
    industry: "unknown",
    business_model: "unknown",
    geography: [],
    customer: "unknown",
    maturity: "idea",
    capital_intensity: "medium",
    risk_flags,
    constraints: [],
    confidence: "high",
    open_questions: [],
    validation_notes: [],
  };
}

describe("activatedPackIds", () => {
  it("activates a pack from an exact suggested_pack match", () => {
    expect(activatedPackIds(profile([{ kind: "regulatory", detail: "", suggested_pack: "fintech" }]))).toEqual(["fintech"]);
  });

  it("activates a pack from a risk-flag kind when suggested_pack is vague", () => {
    expect(activatedPackIds(profile([{ kind: "health-data", detail: "", suggested_pack: "???" }]))).toEqual(["regulated-health"]);
  });

  it("returns no packs for a plain-SaaS profile with no risk flags", () => {
    expect(activatedPackIds(profile([]))).toEqual([]);
  });

  it("activates physical-product from a physical-safety kind", () => {
    expect(activatedPackIds(profile([{ kind: "physical-safety", detail: "", suggested_pack: "" }]))).toEqual([
      "physical-product",
    ]);
  });

  it("dedupes and ignores unknown packs", () => {
    expect(
      activatedPackIds(
        profile([
          { kind: "payments", detail: "", suggested_pack: "fintech" },
          { kind: "other", detail: "", suggested_pack: "fintech" },
          { kind: "other", detail: "", suggested_pack: "does-not-exist" },
        ]),
      ),
    ).toEqual(["fintech"]);
  });
});

describe("composeRoadmap", () => {
  const base = buildSoftwareSaasV1Roadmap();

  it("returns the base unchanged with no profile", () => {
    const r = composeRoadmap(base, undefined);
    expect(r.nodes).toHaveLength(base.nodes.length);
    expect(r.packs).toEqual([]);
    expect(r.generated_from).toBeUndefined();
  });

  it("records the profile but adds no nodes when no packs activate", () => {
    const r = composeRoadmap(base, profile([]));
    expect(r.nodes).toHaveLength(base.nodes.length);
    expect(r.packs).toEqual([]);
    expect(r.generated_from).toBeDefined();
  });

  it("injects a pack's nodes when its risk flag is present", () => {
    const r = composeRoadmap(base, profile([{ kind: "regulatory", detail: "", suggested_pack: "fintech" }]));
    const fintech = PACKS.find((p) => p.id === "fintech")!;
    expect(r.packs).toEqual(["fintech"]);
    expect(r.nodes).toHaveLength(base.nodes.length + fintech.nodes.length);
    expect(r.nodes.some((n) => n.id === "fintech.licensing")).toBe(true);
    expect(r.nodes.some((n) => n.id === "fintech.payments-controls")).toBe(true);
  });

  it("recomputes a valid linear depends_on chain across the merged roadmap", () => {
    const r = composeRoadmap(base, profile([{ kind: "regulatory", detail: "", suggested_pack: "fintech" }]));
    expect(r.nodes[0].depends_on).toEqual([]);
    for (let i = 1; i < r.nodes.length; i++) {
      expect(r.nodes[i].depends_on).toEqual([r.nodes[i - 1].id]);
    }
  });

  it("produces a composed roadmap with no integrity errors", () => {
    const r = composeRoadmap(base, profile([
      { kind: "regulatory", detail: "", suggested_pack: "fintech" },
      { kind: "health-data", detail: "", suggested_pack: "regulated-health" },
    ]));
    expect(r.packs).toEqual(["fintech", "regulated-health"]);
    expect(roadmapIntegrityErrors(r)).toEqual([]);
  });

  it("every pack node names real, distinct creator and reviewers (four-eyes)", () => {
    for (const pack of PACKS) {
      for (const n of pack.nodes) {
        expect(n.reviewers).not.toContain(n.primary);
        expect(n.reviewers.length).toBeGreaterThan(0);
      }
    }
  });
});
