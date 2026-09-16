import { describe, expect, it } from "vitest";
import { buildRoadmapForProfile } from "./roadmap";
import { isPhaseScope, lastStepOfScope, PHASE_SCOPES } from "./phaseScopes";

describe("phaseScopes (STEP 8 items 1/2/5)", () => {
  const roadmap = buildRoadmapForProfile(undefined); // software-saas-v1, 81 steps

  it("every phase's steps are contiguous in the real roadmap (the truncation assumption)", () => {
    const seenPhases = new Set<string>();
    let currentPhase: string | null = null;
    for (const node of roadmap.nodes) {
      if (node.business_phase !== currentPhase) {
        // Moving to a new phase - it must never be one we've already left.
        expect(seenPhases.has(node.business_phase)).toBe(false);
        seenPhases.add(node.business_phase);
        currentPhase = node.business_phase;
      }
    }
  });

  it("lastStepOfScope finds the final step of each named phase", () => {
    expect(lastStepOfScope(roadmap, "discovery")).toBe("06");
    expect(lastStepOfScope(roadmap, "validation")).toBe("12");
    expect(lastStepOfScope(roadmap, "go_no_go")).toBe("13");
    expect(lastStepOfScope(roadmap, "strategy")).toBe("16");
    expect(lastStepOfScope(roadmap, "product")).toBe("28");
    expect(lastStepOfScope(roadmap, "engineering")).toBe("50");
    expect(lastStepOfScope(roadmap, "finance")).toBe("74");
  });

  it("full scope has no limit", () => {
    expect(lastStepOfScope(roadmap, "full")).toBeNull();
  });

  it("scopes are monotonically increasing in step count", () => {
    const order: (keyof typeof PHASE_SCOPES)[] = [];
    let previous = 0;
    for (const scope of PHASE_SCOPES) {
      if (!scope.throughPhase) continue; // "full" has no limit, skip
      const last = lastStepOfScope(roadmap, scope.id);
      expect(last).not.toBeNull();
      const stepNum = Number(last);
      expect(stepNum).toBeGreaterThan(previous);
      previous = stepNum;
      order.push(scope.id as never);
    }
  });

  it("isPhaseScope validates known ids and rejects unknown ones", () => {
    expect(isPhaseScope("discovery")).toBe(true);
    expect(isPhaseScope("full")).toBe(true);
    expect(isPhaseScope("nonexistent")).toBe(false);
    expect(isPhaseScope(42)).toBe(false);
    expect(isPhaseScope(undefined)).toBe(false);
  });

  it("every scope has a non-empty label and description", () => {
    for (const scope of PHASE_SCOPES) {
      expect(scope.label.length).toBeGreaterThan(0);
      expect(scope.description.length).toBeGreaterThan(0);
    }
  });
});
