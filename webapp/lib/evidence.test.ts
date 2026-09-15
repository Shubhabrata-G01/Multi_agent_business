import { describe, it, expect } from "vitest";
import { extractEvidence } from "./evidence";
import type { ArtifactMeta, Claim } from "./types";

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

const ctx = { run_id: "r1", node_id: "saas.05", flow_step: "05", at: "2026-01-01T00:00:00Z" };

describe("extractEvidence", () => {
  it("promotes only claims that carry a real source", () => {
    const ev = extractEvidence(
      meta([
        { type: "fact", text: "Competitor charges $99", source: "https://competitor.example/pricing" },
        { type: "assumption", text: "Users prefer annual", source: null },
        { type: "estimate", text: "TAM ~ $2B", source: "Gartner 2026 market report" },
      ]),
      ctx,
    );
    expect(ev).toHaveLength(2);
    expect(ev.map((e) => e.text)).toEqual(["Competitor charges $99", "TAM ~ $2B"]);
    expect(ev.every((e) => e.strength === "cited")).toBe(true);
    expect(ev[0].run_id).toBe("r1");
    expect(ev[0].flow_step).toBe("05");
  });

  it("returns nothing when no claim is sourced", () => {
    expect(extractEvidence(meta([{ type: "assumption", text: "x", source: null }]), ctx)).toEqual([]);
    expect(extractEvidence(meta([]), ctx)).toEqual([]);
  });

  it("treats a whitespace-only source as unsourced", () => {
    expect(extractEvidence(meta([{ type: "fact", text: "x", source: "   " }]), ctx)).toEqual([]);
  });
});
