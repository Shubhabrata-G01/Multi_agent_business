import crypto from "crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("PostgreSQL jobRepository", () => {
  let prisma: (typeof import("../prisma"))["prisma"];
  let repo: typeof import("./jobRepository");
  const testRunIds: string[] = [];

  function newRunId(): string {
    const id = `test-job-run-${crypto.randomUUID()}`;
    testRunIds.push(id);
    return id;
  }

  async function ensureRunRow(runId: string): Promise<void> {
    // Job.run_id has no FK to Run in this schema (jobs are keyed by run id,
    // not a relation), so job tests don't need a Run row to exist - but we
    // still track ids for cleanup of the Job rows themselves.
    void runId;
  }

  beforeEach(async () => {
    ({ prisma } = await import("../prisma"));
    repo = await import("./jobRepository");
  });

  afterEach(async () => {
    // Each test claims "the next job" via ORDER BY available_at ASC - a
    // leftover queued row from an earlier test would otherwise get claimed
    // ahead of a later test's own job. Clearing after every test keeps each
    // one's claimNextJob() deterministic.
    if (!hasDb || testRunIds.length === 0) return;
    await prisma.job.deleteMany({ where: { run_id: { in: testRunIds } } });
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("../prisma");
    if (testRunIds.length > 0) {
      await prisma.job.deleteMany({ where: { run_id: { in: testRunIds } } });
    }
    await prisma.$disconnect();
  });

  it("enqueues a job as queued and available immediately", async () => {
    const runId = newRunId();
    await ensureRunRow(runId);
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", undefined);

    const row = await prisma.job.findUniqueOrThrow({ where: { run_id: runId } });
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.api_key_ciphertext).toBeNull();
  });

  it("encrypts a user-supplied key and claimNextJob decrypts it back", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", "sk-ant-super-secret-key");

    const row = await prisma.job.findUniqueOrThrow({ where: { run_id: runId } });
    expect(row.api_key_ciphertext).not.toBeNull();
    expect(row.api_key_ciphertext).not.toContain("sk-ant-super-secret-key");

    const claimed = await repo.claimNextJob("test-worker-1");
    expect(claimed?.run_id).toBe(runId);
    expect(claimed?.apiKeyOverride).toBe("sk-ant-super-secret-key");
  });

  it("prevents two workers from claiming the same job (duplicate worker prevention)", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", undefined);

    const [a, b] = await Promise.all([
      repo.claimNextJob("worker-a"),
      repo.claimNextJob("worker-b"),
    ]);
    const claimedThisRun = [a, b].filter((j) => j?.run_id === runId);
    expect(claimedThisRun).toHaveLength(1);

    const row = await prisma.job.findUniqueOrThrow({ where: { run_id: runId } });
    expect(row.status).toBe("running");
    expect(["worker-a", "worker-b"]).toContain(row.locked_by);
  });

  it("does not claim a job whose available_at is in the future", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", undefined);
    await prisma.job.update({
      where: { run_id: runId },
      data: { available_at: new Date(Date.now() + 60_000) },
    });

    // Claim repeatedly; our job should never come back (something else could
    // also be queued from another test, so we only assert on our own run id).
    for (let i = 0; i < 3; i++) {
      const claimed = await repo.claimNextJob(`probe-${i}`);
      expect(claimed?.run_id).not.toBe(runId);
    }
  });

  it("retries with backoff when attempts remain, and fails terminally once exhausted", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", undefined);
    await prisma.job.update({ where: { run_id: runId }, data: { max_attempts: 2 } });

    const claimed = await repo.claimNextJob("retry-worker");
    expect(claimed).not.toBeNull();

    const willRetry = await repo.failJob(claimed!.id, claimed!.attempts, claimed!.max_attempts, "transient error");
    expect(willRetry).toBe(true);

    const afterFirstFailure = await prisma.job.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(afterFirstFailure.status).toBe("queued");
    expect(afterFirstFailure.last_error).toBe("transient error");
    expect(afterFirstFailure.available_at.getTime()).toBeGreaterThan(Date.now() - 1000);

    // Second attempt exhausts max_attempts (2).
    const reclaimed = await prisma.job.update({
      where: { id: claimed!.id },
      data: { attempts: 2, available_at: new Date() },
    });
    const willRetryAgain = await repo.failJob(reclaimed.id, reclaimed.attempts, reclaimed.max_attempts, "still failing");
    expect(willRetryAgain).toBe(false);

    const final = await prisma.job.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(final.status).toBe("failed");
    expect(final.last_error).toBe("still failing");
  });

  it("reclaims a job whose lease has expired (crash/restart recovery)", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", undefined);
    const claimed = await repo.claimNextJob("dying-worker");
    expect(claimed?.run_id).toBe(runId);

    // Simulate the worker dying without ever renewing its lease.
    await prisma.job.update({
      where: { id: claimed!.id },
      data: { lease_expires_at: new Date(Date.now() - 1000) },
    });

    const reclaimed = await repo.claimNextJob("rescuer-worker");
    expect(reclaimed?.run_id).toBe(runId);

    const row = await prisma.job.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(row.locked_by).toBe("rescuer-worker");
    expect(row.attempts).toBe(2); // incremented on both the original claim and the reclaim
  });

  it("renewLease extends the lease only for the worker that holds it", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", undefined);
    const claimed = await repo.claimNextJob("lease-worker");
    const before = await prisma.job.findUniqueOrThrow({ where: { id: claimed!.id } });

    await repo.renewLease(claimed!.id, "someone-else");
    const unaffected = await prisma.job.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(unaffected.lease_expires_at?.getTime()).toBe(before.lease_expires_at?.getTime());

    await repo.renewLease(claimed!.id, "lease-worker");
    const extended = await prisma.job.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(extended.lease_expires_at!.getTime()).toBeGreaterThan(before.lease_expires_at!.getTime());
  });

  it("completeJob clears the ciphertext and lease", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", "sk-ant-key");
    const claimed = await repo.claimNextJob("finisher");
    await repo.completeJob(claimed!.id);

    const row = await prisma.job.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(row.status).toBe("done");
    expect(row.api_key_ciphertext).toBeNull();
    expect(row.locked_by).toBeNull();
  });

  it("completeJob does not throw when the job row no longer exists (deleted mid-execution)", async () => {
    // Regression test: a run can be deleted while its job is still
    // in-flight (lib/dataRetention.ts's DELETE /api/runs/[id]). Previously
    // completeJob used prisma.job.update() (throws P2025 on a missing row),
    // which crashed the entire worker process with an unhandled rejection -
    // found via a live test. It must be a graceful no-op instead.
    await expect(repo.completeJob("nonexistent-job-id")).resolves.toBeUndefined();
  });

  it("failJob does not throw when the job row no longer exists (deleted mid-execution)", async () => {
    await expect(repo.failJob("nonexistent-job-id", 1, 5, "some error")).resolves.toBe(true);
    await expect(repo.failJob("nonexistent-job-id", 5, 5, "some error")).resolves.toBe(false);
  });

  it("cancelJob marks a queued or running job cancelled and clears its key", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", "sk-ant-key");
    await repo.cancelJob(runId);

    const row = await prisma.job.findUniqueOrThrow({ where: { run_id: runId } });
    expect(row.status).toBe("cancelled");
    expect(row.api_key_ciphertext).toBeNull();

    // A cancelled job is never claimable again.
    const claimed = await repo.claimNextJob("late-worker");
    expect(claimed?.run_id).not.toBe(runId);
  });

  it("resets attempts/backoff/error on re-enqueue (resume is a fresh attempt budget)", async () => {
    const runId = newRunId();
    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", undefined);
    const claimed = await repo.claimNextJob("first-attempt");
    await repo.failJob(claimed!.id, claimed!.attempts, 1, "gave up");

    let row = await prisma.job.findUniqueOrThrow({ where: { run_id: runId } });
    expect(row.status).toBe("failed");

    await repo.enqueueJob(runId, "anthropic", "claude-haiku-4-5-20251001", undefined);
    row = await prisma.job.findUniqueOrThrow({ where: { run_id: runId } });
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.last_error).toBeNull();
  });
});
