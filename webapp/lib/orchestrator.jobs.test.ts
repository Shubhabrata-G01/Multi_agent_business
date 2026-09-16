import { Prisma } from "@prisma/client";
import { afterAll, afterEach, describe, expect, it } from "vitest";

// Verifies the orchestrator's integration with the durable job queue (STEP 3
// items 7/10: cancellation and approval/resume behavior over the Job table)
// against a real PostgreSQL instance. Does NOT run a worker - no job here is
// ever actually claimed/executed, so these only cost a DB round-trip each,
// no provider calls.
const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("orchestrator <-> durable job queue integration", () => {
  const testRunIds: string[] = [];

  afterEach(async () => {
    const { prisma } = await import("./prisma");
    if (testRunIds.length > 0) {
      await prisma.job.deleteMany({ where: { run_id: { in: testRunIds } } });
      await prisma.run.deleteMany({ where: { id: { in: testRunIds } } });
    }
    testRunIds.length = 0;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    await prisma.$disconnect();
  });

  it("startRun enqueues a queued Job row scoped to the new run", async () => {
    const { startRun } = await import("./orchestrator");
    const { prisma } = await import("./prisma");

    const id = await startRun(
      "Job-queue integration test idea",
      "anthropic",
      "claude-haiku-4-5-20251001",
      "sk-ant-fake-key-for-enqueue-only",
      "assisted",
      undefined,
      "jobs-test-owner",
    );
    testRunIds.push(id);

    const job = await prisma.run.findUniqueOrThrow({ where: { id } }).then(() =>
      prisma.job.findUniqueOrThrow({ where: { run_id: id } }),
    );
    expect(job.status).toBe("queued");
    expect(job.provider).toBe("anthropic");
    expect(job.api_key_ciphertext).not.toBeNull(); // user-supplied key
    expect(job.attempts).toBe(0);
  });

  it("cancelRun marks both the run and its Job row cancelled", async () => {
    const { startRun, cancelRun } = await import("./orchestrator");
    const { prisma } = await import("./prisma");

    const id = await startRun(
      "Job-queue cancel test idea",
      "anthropic",
      "claude-haiku-4-5-20251001",
      "sk-ant-fake-key",
      "assisted",
      undefined,
      "jobs-test-owner",
    );
    testRunIds.push(id);

    await cancelRun(id);

    const run = await prisma.run.findUniqueOrThrow({ where: { id } });
    expect(run.status).toBe("cancelled");
    const job = await prisma.job.findUniqueOrThrow({ where: { run_id: id } });
    expect(job.status).toBe("cancelled");
    expect(job.api_key_ciphertext).toBeNull();
  });

  it("resumeRun re-enqueues a held run's job with a fresh attempt budget", async () => {
    const { startRun, resumeRun } = await import("./orchestrator");
    const { prisma } = await import("./prisma");
    const { failJob, claimNextJob } = await import("./jobs/jobRepository");

    const id = await startRun(
      "Job-queue resume test idea",
      "anthropic",
      "claude-haiku-4-5-20251001",
      "sk-ant-fake-key",
      "assisted",
      undefined,
      "jobs-test-owner",
    );
    testRunIds.push(id);

    // Simulate the job having failed out (as if the worker gave up) and the
    // run being left "held" so resumeRun's precondition is satisfied. Both
    // the normalized `status` column and the JSONB `data.status` field must
    // agree - loadRun() reads status from `data`, same as the real app.
    const claimed = await claimNextJob(`test-claim-${id}`);
    expect(claimed?.run_id).toBe(id);
    await failJob(claimed!.id, claimed!.attempts, 1, "simulated exhaustion");
    const beforeRow = await prisma.run.findUniqueOrThrow({ where: { id } });
    const beforeData = beforeRow.data as Record<string, unknown>;
    await prisma.run.update({
      where: { id },
      data: { status: "held", data: { ...beforeData, status: "held" } as Prisma.InputJsonValue },
    });

    await resumeRun(id, "sk-ant-fake-key-2");

    const job = await prisma.job.findUniqueOrThrow({ where: { run_id: id } });
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);
    expect(job.last_error).toBeNull();

    const run = await prisma.run.findUniqueOrThrow({ where: { id } });
    expect(run.status).toBe("running");
  });

  it("decideApproval's resume re-enqueues the job after an approve", async () => {
    const { startRun, decideApproval } = await import("./orchestrator");
    const { prisma } = await import("./prisma");

    const id = await startRun(
      "Job-queue approval test idea",
      "anthropic",
      "claude-haiku-4-5-20251001",
      "sk-ant-fake-key",
      "assisted",
      undefined,
      "jobs-test-owner",
    );
    testRunIds.push(id);

    // Simulate a run holding on a pending approval (as executeRun would
    // leave it at a Level-2+ gate in assisted mode).
    const run = await prisma.run.findUniqueOrThrow({ where: { id } });
    const data = run.data as Record<string, unknown> & { steps: unknown[]; version?: number };
    const approvalId = "approval-1";
    await prisma.run.update({
      where: { id },
      data: {
        status: "held",
        data: {
          ...data,
          status: "held",
          approvals: [
            {
              id: approvalId,
              run_id: id,
              flow_step: "01",
              node_id: "saas.01",
              attempt: 1,
              level: 2,
              activity: "Test gate",
              output_artifact: "Test Artifact",
              summary: "needs approval",
              status: "pending",
              created_at: new Date().toISOString(),
            },
          ],
        } as Prisma.InputJsonValue,
      },
    });

    await decideApproval(id, approvalId, "approve", "looks good", "sk-ant-fake-key-3", {
      id: "reviewer-1",
      email: "reviewer@example.com",
      role: "OWNER",
    });

    const job = await prisma.job.findUniqueOrThrow({ where: { run_id: id } });
    expect(job.status).toBe("queued");

    const finalRun = await prisma.run.findUniqueOrThrow({ where: { id } });
    expect(finalRun.status).toBe("running");
    const finalData = finalRun.data as { approvals: Array<{ status: string }> };
    expect(finalData.approvals[0].status).toBe("approved");
  });
});
