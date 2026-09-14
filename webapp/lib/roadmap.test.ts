import { describe, it, expect } from "vitest";
import { selectBaseTemplate, buildRoadmapForProfile } from "./roadmap";
import { SERVICES_V1_TEMPLATE_ID } from "./templates/servicesV1";
import { SOFTWARE_SAAS_V1_TEMPLATE_ID } from "./templates/softwareSaasV1";
import { roadmapIntegrityErrors } from "./roadmapIntegrity";
import type { BusinessProfile, RiskFlag } from "./types";

function profile(partial: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    idea: "x",
    industry: "b2b-saas",
    business_model: "subscription",
    geography: [],
    customer: "smb",
    maturity: "idea",
    capital_intensity: "low",
    risk_flags: [],
    constraints: [],
    confidence: "high",
    open_questions: [],
    validation_notes: [],
    ...partial,
  };
}

describe("selectBaseTemplate", () => {
  it("defaults to software-saas-v1 with no profile", () => {
    expect(selectBaseTemplate(undefined).template_id).toBe(SOFTWARE_SAAS_V1_TEMPLATE_ID);
  });

  it("selects software-saas-v1 for a SaaS profile", () => {
    expect(selectBaseTemplate(profile()).template_id).toBe(SOFTWARE_SAAS_V1_TEMPLATE_ID);
  });

  it("selects services-v1 for a services/agency business model", () => {
    expect(selectBaseTemplate(profile({ business_model: "services", industry: "marketing-agency" })).template_id).toBe(
      SERVICES_V1_TEMPLATE_ID,
    );
    expect(selectBaseTemplate(profile({ business_model: "consulting retainer" })).template_id).toBe(
      SERVICES_V1_TEMPLATE_ID,
    );
  });
});

describe("buildRoadmapForProfile", () => {
  it("composes packs onto the selected base and stays integrity-clean", () => {
    const flags: RiskFlag[] = [{ kind: "regulatory", detail: "", suggested_pack: "fintech" }];
    const r = buildRoadmapForProfile(profile({ risk_flags: flags }));
    expect(r.packs).toEqual(["fintech"]);
    expect(r.nodes.some((n) => n.id === "fintech.licensing")).toBe(true);
    expect(roadmapIntegrityErrors(r)).toEqual([]);
  });

  it("a plain-SaaS profile yields exactly the base template (no packs)", () => {
    const r = buildRoadmapForProfile(profile());
    expect(r.template_id).toBe(SOFTWARE_SAAS_V1_TEMPLATE_ID);
    expect(r.packs).toEqual([]);
  });
});
