import { afterAll, afterEach, describe, expect, it } from "vitest";

// STEP 8 items 1/2/5 - verifies the wiring from startRun's phaseScope param
// down into the persisted RunConfig.stop_after_flow_step, which is what
// executeRun's loop checks to decide whether to pause at a phase boundary
// (the pause branch itself mirrors the already-tested human-approval-hold
// branch's pattern - see lib/orchestrator.test.ts/approval.test.ts for the
// gate state machine's own coverage). Doesn't run a worker/provider calls -
// this only needs the Job/Run rows startRun itself writes.
const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("orchestrator phase-scope wiring", () => {
  const cleanupRunIds: string[] = [];

  afterEach(async () => {
    const { prisma } = await import("./prisma");
    if (cleanupRunIds.length) {
      await prisma.job.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
      await prisma.run.deleteMany({ where: { id: { in: cleanupRunIds } } });
    }
    cleanupRunIds.length = 0;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    await prisma.$disconnect();
  });

  it("startRun with phaseScope='discovery' sets stop_after_flow_step to the last Discovery step", async () => {
    const { startRun } = await import("./orchestrator");
    const { loadRun } = await import("./runStore");
    const { lastStepOfScope } = await import("./phaseScopes");
    const { buildRoadmapForProfile } = await import("./roadmap");

    const id = await startRun(
      "Phase-scope test idea",
      "anthropic",
      "claude-haiku-4-5-20251001",
      "sk-ant-fake-key",
      "assisted",
      undefined,
      "phasescope-owner",
      "phasescope-org",
      "discovery",
    );
    cleanupRunIds.push(id);

    const run = await loadRun(id);
    const expected = lastStepOfScope(buildRoadmapForProfile(undefined), "discovery");
    expect(run?.config?.phase_scope).toBe("discovery");
    expect(run?.config?.stop_after_flow_step).toBe(expected);
    expect(expected).toBe("06");
  });

  it("startRun with the default (no phaseScope arg) behaves exactly as 'full' - no boundary", async () => {
    const { startRun } = await import("./orchestrator");
    const { loadRun } = await import("./runStore");

    const id = await startRun(
      "Default scope test idea",
      "anthropic",
      "claude-haiku-4-5-20251001",
      "sk-ant-fake-key",
      "assisted",
      undefined,
      "phasescope-owner",
      "phasescope-org",
    );
    cleanupRunIds.push(id);

    const run = await loadRun(id);
    expect(run?.config?.phase_scope).toBe("full");
    expect(run?.config?.stop_after_flow_step).toBeNull();
  });
});
