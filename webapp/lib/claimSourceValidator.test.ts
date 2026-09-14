import { describe, it, expect } from "vitest";
import { validateClaimSources } from "./claimSourceValidator";
import type { ArtifactMeta, Claim } from "./types";

const WEB_RESEARCH = "Web research (search + page fetch)";

function meta(claims: Claim[]): ArtifactMeta {
  return {
    status: "ok",
    confidence: "high",
    evidence_quality: "high",
    decision: null,
    claims,
    open_questions: [],
    reason: null,
    validation_notes: [],
  };
}

describe("validateClaimSources", () => {
  it("catches the PERF-001 case: a FACT sourced from a disconnected ad platform + CRM is downgraded", () => {
    const input = meta([
      {
        type: "fact",
        text: "Measured CAC is $55",
        source: "reconciled against ad-platform spend export and CRM qualification records",
      },
    ]);
    const { meta: out, violations } = validateClaimSources(input, []);
    expect(violations).toHaveLength(1);
    expect(violations[0].downgraded).toBe(true);
    expect(out.claims[0].type).toBe("assumption");
    expect(out.validation_notes.join(" ")).toMatch(/Downgraded a FACT/);
  });

  it("does NOT flag an honestly-labeled ESTIMATE that references the same data (the corrected PERF-001)", () => {
    const input = meta([
      {
        type: "estimate",
        text: "Measured CAC is ~$55",
        source: "manually compiled from spend and CRM qualification records; no ad-platform integration connected",
      },
    ]);
    const { meta: out, violations } = validateClaimSources(input, []);
    expect(violations).toHaveLength(0);
    expect(out.claims[0].type).toBe("estimate");
  });

  it("downgrades a FACT whose source is a URL when web research is not connected", () => {
    const input = meta([
      { type: "fact", text: "Competitor charges $99/mo", source: "https://competitor.example/pricing" },
    ]);
    const { meta: out, violations } = validateClaimSources(input, []);
    expect(violations).toHaveLength(1);
    expect(out.claims[0].type).toBe("assumption");
  });

  it("allows a FACT sourced from a URL when web research IS connected for the call", () => {
    const input = meta([
      { type: "fact", text: "Competitor charges $99/mo", source: "https://competitor.example/pricing" },
    ]);
    const { meta: out, violations } = validateClaimSources(input, [WEB_RESEARCH]);
    expect(violations).toHaveLength(0);
    expect(out.claims[0].type).toBe("fact");
  });

  it("leaves an unsourced FACT to validateArtifactMeta (no source = not this validator's job)", () => {
    const input = meta([{ type: "fact", text: "Users love it", source: null }]);
    const { violations } = validateClaimSources(input, []);
    expect(violations).toHaveLength(0);
  });

  it("does not flag a FACT sourced from an internal artifact with no tool/URL reference", () => {
    const input = meta([
      { type: "fact", text: "The MVP scope has 7 stories", source: "the approved MVP Delivery Plan (step 37)" },
    ]);
    const { violations } = validateClaimSources(input, []);
    expect(violations).toHaveLength(0);
  });

  it("handles multiple claims and only downgrades the offending FACTs", () => {
    const input = meta([
      { type: "fact", text: "CAC $55", source: "google ads export" },
      { type: "assumption", text: "Scales linearly", source: "internal estimate" },
      { type: "fact", text: "Runway 14 months", source: "the CFO financial model artifact" },
    ]);
    const { meta: out, violations } = validateClaimSources(input, []);
    expect(violations).toHaveLength(1);
    expect(out.claims[0].type).toBe("assumption"); // ad platform -> downgraded
    expect(out.claims[1].type).toBe("assumption"); // untouched (was already assumption)
    expect(out.claims[2].type).toBe("fact"); // internal artifact -> fine
  });

  it("is pure: it never mutates the input meta", () => {
    const input = meta([{ type: "fact", text: "CAC $55", source: "CRM closed-won records" }]);
    validateClaimSources(input, []);
    expect(input.claims[0].type).toBe("fact");
    expect(input.validation_notes).toHaveLength(0);
  });
});
