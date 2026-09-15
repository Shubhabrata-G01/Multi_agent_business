import { describe, it, expect } from "vitest";
import { CAPABILITY_KPIS, capabilityKpi } from "./capabilityKpis";
import { getAllAgents } from "./businessFlow";

describe("capability KPI map", () => {
  it("assigns a distinct KPI slug to every capability (no two share one)", () => {
    const values = Object.values(CAPABILITY_KPIS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("declares a KPI for every registry agent, so any node-owner has one", () => {
    for (const agent of getAllAgents()) {
      expect(capabilityKpi(agent.id), `missing KPI for ${agent.id}`).toBeTruthy();
    }
  });
});
