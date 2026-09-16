import crypto from "crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("quotas (STEP 4 items 6-7)", () => {
  const cleanupRunIds: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    if (cleanupRunIds.length) {
      await prisma.usageEvent.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
      await prisma.run.deleteMany({ where: { id: { in: cleanupRunIds } } });
    }
    await prisma.$disconnect();
  });

  async function makeRun(ownerId: string, organizationId: string, status = "running") {
    const { saveRun } = await import("./runStore");
    const id = `test-quota-run-${crypto.randomUUID()}`;
    cleanupRunIds.push(id);
    const now = new Date().toISOString();
    await saveRun({
      id,
      owner_id: ownerId,
      organization_id: organizationId,
      idea: "idea",
      status: status as never,
      created_at: now,
      updated_at: now,
      current_step_index: 0,
      total_steps: 1,
      steps: [],
      error: null,
      provider: "anthropic",
      model: "test-model",
      key_source: "server_env",
      step_attempts: {},
      jump_counts: {},
      path: [],
      total_executions: 0,
    });
    return id;
  }

  it("rejects starting a run once the org's concurrent-run limit is reached", async () => {
    vi.stubEnv("ORG_MAX_CONCURRENT_RUNS", "1");
    const { assertCanStartRun, QuotaExceededError } = await import("./quotas");
    const orgId = `org-quota-${crypto.randomUUID()}`;
    const userId = `user-quota-${crypto.randomUUID()}`;

    await makeRun(userId, orgId, "running"); // 1 active run - at the limit

    await expect(assertCanStartRun(userId, orgId)).rejects.toThrow(QuotaExceededError);
    await expect(assertCanStartRun(userId, orgId)).rejects.toThrow(/concurrent-run limit/);
  });

  it("does not count a completed/cancelled run against the concurrent-run limit", async () => {
    vi.stubEnv("ORG_MAX_CONCURRENT_RUNS", "1");
    const { assertCanStartRun } = await import("./quotas");
    const orgId = `org-quota-${crypto.randomUUID()}`;
    const userId = `user-quota-${crypto.randomUUID()}`;

    await makeRun(userId, orgId, "completed");
    await expect(assertCanStartRun(userId, orgId)).resolves.toBeUndefined();
  });

  it("rejects once the org's daily run limit is reached", async () => {
    vi.stubEnv("ORG_MAX_CONCURRENT_RUNS", "100");
    vi.stubEnv("USER_MAX_CONCURRENT_RUNS", "100");
    vi.stubEnv("ORG_MAX_DAILY_RUNS", "1");
    const { assertCanStartRun, QuotaExceededError } = await import("./quotas");
    const orgId = `org-quota-${crypto.randomUUID()}`;
    const userId = `user-quota-${crypto.randomUUID()}`;

    await makeRun(userId, orgId, "completed"); // still counts toward "today", even though done
    await expect(assertCanStartRun(userId, orgId)).rejects.toThrow(QuotaExceededError);
    await expect(assertCanStartRun(userId, orgId)).rejects.toThrow(/daily run limit/);
  });

  it("rejects once the org's monthly token budget is exhausted", async () => {
    vi.stubEnv("ORG_MAX_CONCURRENT_RUNS", "100");
    vi.stubEnv("USER_MAX_CONCURRENT_RUNS", "100");
    vi.stubEnv("ORG_MAX_DAILY_RUNS", "100");
    vi.stubEnv("USER_MAX_DAILY_RUNS", "100");
    vi.stubEnv("ORG_MONTHLY_TOKEN_BUDGET", "1000");

    const { assertCanStartRun, QuotaExceededError } = await import("./quotas");
    const { recordUsage } = await import("./usage");
    const orgId = `org-quota-${crypto.randomUUID()}`;
    const userId = `user-quota-${crypto.randomUUID()}`;
    const runId = await makeRun(userId, orgId, "completed");

    await recordUsage({
      runId,
      userId,
      organizationId: orgId,
      provider: "anthropic",
      model: "claude-opus-5",
      inputTokens: 600,
      outputTokens: 500, // 1100 total, over the 1000 budget
    });

    await expect(assertCanStartRun(userId, orgId)).rejects.toThrow(QuotaExceededError);
    await expect(assertCanStartRun(userId, orgId)).rejects.toThrow(/monthly token budget/);
  });

  it("allows starting a run when comfortably under every limit", async () => {
    const { assertCanStartRun } = await import("./quotas");
    const orgId = `org-quota-${crypto.randomUUID()}`;
    const userId = `user-quota-${crypto.randomUUID()}`;
    await expect(assertCanStartRun(userId, orgId)).resolves.toBeUndefined();
  });
});
