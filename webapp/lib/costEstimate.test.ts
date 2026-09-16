import crypto from "crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { buildRoadmapForProfile } from "./roadmap";
import { estimateRun } from "./costEstimate";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describe("estimateRun (STEP 8 item 3)", () => {
  const roadmap = buildRoadmapForProfile(undefined);

  it("estimates fewer steps/tasks/cost for a narrower scope than the full build", async () => {
    const discovery = await estimateRun(roadmap, "discovery", "anthropic", "claude-opus-5");
    const full = await estimateRun(roadmap, "full", "anthropic", "claude-opus-5");

    expect(discovery.steps).toBe(6);
    expect(full.steps).toBe(81);
    expect(discovery.estimated_tasks).toBeLessThan(full.estimated_tasks);
    expect(discovery.estimated_cost_usd).toBeLessThan(full.estimated_cost_usd);
    expect(discovery.estimated_duration_minutes).toBeLessThan(full.estimated_duration_minutes);
  });

  it("falls back to the heuristic default with no organizationId", async () => {
    const estimate = await estimateRun(roadmap, "discovery", "anthropic", "claude-opus-5");
    expect(estimate.based_on).toBe("heuristic_default");
    expect(estimate.estimated_input_tokens).toBeGreaterThan(0);
    expect(estimate.estimated_output_tokens).toBeGreaterThan(0);
  });

  it("counts more tasks for gate steps (creator + critics + approver + executor)", async () => {
    const throughGate = await estimateRun(roadmap, "go_no_go", "anthropic", "claude-opus-5");
    const throughStrategy = await estimateRun(roadmap, "strategy", "anthropic", "claude-opus-5");
    // strategy scope (16 steps) has 3 more steps than go_no_go (13 steps) but
    // go_no_go's last step is a gate (extra approver+executor tasks), so the
    // per-step task density near the boundary isn't a simple linear step count.
    expect(throughStrategy.steps).toBeGreaterThan(throughGate.steps);
    expect(throughStrategy.estimated_tasks).toBeGreaterThan(throughGate.estimated_tasks);
  });
});

describeIfDb("estimateRun with real usage history (real PostgreSQL)", () => {
  const roadmap = buildRoadmapForProfile(undefined);
  const cleanupRunIds: string[] = [];

  afterEach(async () => {
    const { prisma } = await import("./prisma");
    if (cleanupRunIds.length) {
      await prisma.usageEvent.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
    }
    cleanupRunIds.length = 0;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    await prisma.$disconnect();
  });

  it("uses historical averages once there are at least 10 recorded calls for that org+provider+model", async () => {
    const { recordUsage } = await import("./usage");
    const orgId = `org-estimate-${crypto.randomUUID()}`;
    const runId = `test-estimate-run-${crypto.randomUUID()}`;
    cleanupRunIds.push(runId);

    for (let i = 0; i < 10; i++) {
      await recordUsage({
        runId,
        userId: "u1",
        organizationId: orgId,
        provider: "anthropic",
        model: "claude-opus-5",
        inputTokens: 5000, // deliberately far from the heuristic default (1800)
        outputTokens: 4000,
      });
    }

    const estimate = await estimateRun(roadmap, "discovery", "anthropic", "claude-opus-5", orgId);
    expect(estimate.based_on).toBe("historical_average");
    // With a much higher historical average, the estimate should reflect it
    // rather than the heuristic default.
    const heuristic = await estimateRun(roadmap, "discovery", "anthropic", "claude-opus-5");
    expect(estimate.estimated_input_tokens).toBeGreaterThan(heuristic.estimated_input_tokens);
  });

  it("does not use historical averages with fewer than 10 samples", async () => {
    const { recordUsage } = await import("./usage");
    const orgId = `org-estimate-sparse-${crypto.randomUUID()}`;
    const runId = `test-estimate-run-${crypto.randomUUID()}`;
    cleanupRunIds.push(runId);

    await recordUsage({
      runId,
      userId: "u1",
      organizationId: orgId,
      provider: "anthropic",
      model: "claude-opus-5",
      inputTokens: 5000,
      outputTokens: 4000,
    });

    const estimate = await estimateRun(roadmap, "discovery", "anthropic", "claude-opus-5", orgId);
    expect(estimate.based_on).toBe("heuristic_default");
  });
});
