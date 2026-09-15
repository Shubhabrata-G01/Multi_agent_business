import { describe, it, expect } from "vitest";
import { parseBusinessProfile, buildClassifierUser } from "./classifier";

const IDEA = "A subscription tool that helps small accounting firms automate client onboarding.";

describe("parseBusinessProfile", () => {
  it("parses a well-formed fenced JSON profile", () => {
    const raw = "here you go\n```json\n" +
      JSON.stringify({
        idea: IDEA,
        industry: "b2b-saas",
        business_model: "subscription",
        geography: ["US"],
        customer: "small accounting firms",
        maturity: "idea",
        capital_intensity: "low",
        risk_flags: [],
        constraints: ["bootstrapped"],
        confidence: "high",
        open_questions: [],
      }) +
      "\n```";
    const p = parseBusinessProfile(IDEA, raw);
    expect(p.industry).toBe("b2b-saas");
    expect(p.business_model).toBe("subscription");
    expect(p.geography).toEqual(["US"]);
    expect(p.confidence).toBe("high");
    expect(p.risk_flags).toEqual([]);
    expect(p.validation_notes).toEqual([]);
  });

  it("parses bare JSON with no fence", () => {
    const raw = JSON.stringify({ idea: IDEA, industry: "marketplace", confidence: "medium" });
    const p = parseBusinessProfile(IDEA, raw);
    expect(p.industry).toBe("marketplace");
    expect(p.confidence).toBe("medium");
  });

  it("forces the idea back to the submitted text when the model paraphrased it", () => {
    const raw = JSON.stringify({ idea: "a totally different paraphrase", industry: "b2b-saas", confidence: "high" });
    const p = parseBusinessProfile(IDEA, raw);
    expect(p.idea).toBe(IDEA);
    expect(p.validation_notes.join(" ")).toMatch(/Reset 'idea'/);
  });

  it("falls back to a low-confidence default on non-JSON garbage", () => {
    const p = parseBusinessProfile(IDEA, "I'm not sure, could you clarify?");
    expect(p.confidence).toBe("low");
    expect(p.industry).toBe("unknown");
    expect(p.validation_notes.join(" ")).toMatch(/No JSON profile/);
  });

  it("coerces an invalid enum to a safe default rather than failing", () => {
    const raw = JSON.stringify({ idea: IDEA, maturity: "gigantic", capital_intensity: "astronomical", confidence: "high" });
    const p = parseBusinessProfile(IDEA, raw);
    expect(p.maturity).toBe("idea");
    expect(p.capital_intensity).toBe("medium");
  });

  it("adds a generic open question when confidence is low and none were given", () => {
    const raw = JSON.stringify({ idea: IDEA, confidence: "low", open_questions: [] });
    const p = parseBusinessProfile(IDEA, raw);
    expect(p.open_questions.length).toBeGreaterThan(0);
    expect(p.validation_notes.join(" ")).toMatch(/Added a generic open question/);
  });

  it("parses risk flags for a non-plain-SaaS idea", () => {
    const raw = JSON.stringify({
      idea: IDEA,
      industry: "fintech-lending",
      confidence: "high",
      risk_flags: [{ kind: "regulatory", detail: "consumer lending license", suggested_pack: "fintech" }],
    });
    const p = parseBusinessProfile(IDEA, raw);
    expect(p.risk_flags).toHaveLength(1);
    expect(p.risk_flags[0].kind).toBe("regulatory");
    expect(p.risk_flags[0].suggested_pack).toBe("fintech");
  });

  it("coerces an unknown risk-flag kind to 'other'", () => {
    const raw = JSON.stringify({
      idea: IDEA,
      confidence: "high",
      risk_flags: [{ kind: "aliens", detail: "x", suggested_pack: "y" }],
    });
    const p = parseBusinessProfile(IDEA, raw);
    expect(p.risk_flags[0].kind).toBe("other");
  });
});

describe("buildClassifierUser", () => {
  it("includes the idea", () => {
    expect(buildClassifierUser(IDEA)).toContain(IDEA);
  });
});
