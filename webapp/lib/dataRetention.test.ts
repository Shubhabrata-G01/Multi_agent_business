import crypto from "crypto";
import { afterAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("dataRetention (STEP 6 item 8)", () => {
  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    await prisma.$disconnect();
  });

  it("deleteRunData removes the run and every derived record", async () => {
    const { prisma } = await import("./prisma");
    const { deleteRunData } = await import("./dataRetention");
    const runId = `test-retention-run-${crypto.randomUUID()}`;

    await prisma.run.create({
      data: {
        id: runId,
        owner_id: "u1",
        organization_id: "o1",
        status: "completed",
        created_at: new Date(),
        updated_at: new Date(),
        data: {},
      },
    });
    await prisma.artifactVersion.create({
      data: {
        run_id: runId,
        flow_step: "01",
        attempt: 1,
        created_at: new Date(),
        agent_id: "AG-1",
        data: {},
      },
    });
    await prisma.job.create({ data: { run_id: runId, provider: "anthropic", model: "m" } });
    await prisma.usageEvent.create({
      data: {
        run_id: runId,
        user_id: "u1",
        organization_id: "o1",
        provider: "anthropic",
        model: "m",
        input_tokens: 10,
        output_tokens: 10,
        estimated_cost_usd: 0.01,
      },
    });
    await prisma.providerErrorEvent.create({
      data: { run_id: runId, user_id: "u1", organization_id: "o1", provider: "anthropic", model: "m", error: "x" },
    });
    await prisma.comment.create({
      data: { run_id: runId, flow_step: "01", attempt: 1, author_id: "u1", author_email: "u1@example.com", body: "hi" },
    });
    await prisma.stepReview.create({
      data: { run_id: runId, flow_step: "01", attempt: 1, status: "reviewed" },
    });

    await deleteRunData(runId);

    const [run, artifacts, job, usage, providerErrors, comments, reviews] = await Promise.all([
      prisma.run.findUnique({ where: { id: runId } }),
      prisma.artifactVersion.findMany({ where: { run_id: runId } }),
      prisma.job.findUnique({ where: { run_id: runId } }),
      prisma.usageEvent.findMany({ where: { run_id: runId } }),
      prisma.providerErrorEvent.findMany({ where: { run_id: runId } }),
      prisma.comment.findMany({ where: { run_id: runId } }),
      prisma.stepReview.findMany({ where: { run_id: runId } }),
    ]);

    expect(run).toBeNull();
    expect(artifacts).toHaveLength(0);
    expect(job).toBeNull();
    expect(usage).toHaveLength(0);
    expect(providerErrors).toHaveLength(0);
    expect(comments).toHaveLength(0);
    expect(reviews).toHaveLength(0);
  });

  it("throws a clear error on the filesystem backend", async () => {
    const { resetStorageBackendCacheForTests } = await import("./storageBackend");
    const { deleteRunData } = await import("./dataRetention");
    const originalDbUrl = process.env.DATABASE_URL;
    const originalBackend = process.env.STORAGE_BACKEND;
    process.env.STORAGE_BACKEND = "filesystem";
    resetStorageBackendCacheForTests();
    try {
      await expect(deleteRunData("whatever")).rejects.toThrow(/PostgreSQL/);
    } finally {
      process.env.STORAGE_BACKEND = originalBackend;
      process.env.DATABASE_URL = originalDbUrl;
      resetStorageBackendCacheForTests();
    }
  });
});
