import { describe, it, expect } from "vitest";
import { buildServicesV1Roadmap, SERVICES_V1_TEMPLATE_ID } from "./servicesV1";
import { roadmapIntegrityErrors, validateRoadmapIntegrity } from "../roadmapIntegrity";
import { getAgentById } from "../businessFlow";

describe("services-v1 template", () => {
  const roadmap = buildServicesV1Roadmap();

  it("has the template id and a compact, ordered node list", () => {
    expect(roadmap.template_id).toBe(SERVICES_V1_TEMPLATE_ID);
    expect(roadmap.nodes.length).toBeGreaterThanOrEqual(10);
    expect(roadmap.nodes[0].depends_on).toEqual([]);
  });

  it("references only real registry agents and sets required_medium on every node", () => {
    for (const n of roadmap.nodes) {
      expect(n.required_capabilities.every((id) => !!getAgentById(id))).toBe(true);
      expect(n.reviewer_capabilities.every((id) => !!getAgentById(id))).toBe(true);
      expect(n.required_medium).toBeDefined();
    }
  });

  it("has no integrity errors", () => {
    expect(roadmapIntegrityErrors(roadmap)).toEqual([]);
  });

  it("gives Operations a primary node, so it is NOT flagged by the ownership floor", () => {
    const floor = validateRoadmapIntegrity(roadmap).filter(
      (f) => f.check === "operational-ownership-floor",
    );
    expect(floor.map((f) => f.detail).join(" ")).not.toContain("Operations");
  });
});
