import crypto from "crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { checkDatabaseHealth, checkWorkerHealth, getReadiness } from "./health";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describe("checkDatabaseHealth (degraded-dependency case)", () => {
  it("reports unhealthy when the query throws (DB unreachable)", async () => {
    const brokenClient = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("connection refused")),
    };
    const result = await checkDatabaseHealth(brokenClient as never);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

describe("checkWorkerHealth (degraded-dependency case)", () => {
  it("reports unhealthy when there are no heartbeat rows at all", async () => {
    const emptyClient = { workerHeartbeat: { findMany: vi.fn().mockResolvedValue([]) } };
    const result = await checkWorkerHealth(emptyClient as never);
    expect(result.ok).toBe(false);
    expect(result.active_workers).toBe(0);
  });

  it("reports healthy when at least one fresh heartbeat exists", async () => {
    const freshClient = {
      workerHeartbeat: {
        findMany: vi.fn().mockResolvedValue([
          { worker_id: "w1", concurrency: 4, in_flight: 1, last_seen_at: new Date() },
        ]),
      },
    };
    const result = await checkWorkerHealth(freshClient as never);
    expect(result.ok).toBe(true);
    expect(result.active_workers).toBe(1);
  });
});

describeIfDb("checkDatabaseHealth / checkWorkerHealth / getReadiness (real PostgreSQL)", () => {
  const cleanupWorkerIds: string[] = [];

  afterEach(async () => {
    const { prisma } = await import("./prisma");
    if (cleanupWorkerIds.length) {
      await prisma.workerHeartbeat.deleteMany({ where: { worker_id: { in: cleanupWorkerIds } } });
    }
    cleanupWorkerIds.length = 0;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    await prisma.$disconnect();
  });

  it("reports the real database as healthy", async () => {
    const { prisma } = await import("./prisma");
    const result = await checkDatabaseHealth(prisma);
    expect(result.ok).toBe(true);
  });

  it("getReadiness combines database + worker health on the PostgreSQL backend", async () => {
    const { prisma } = await import("./prisma");
    const workerId = `test-worker-${crypto.randomUUID()}`;
    cleanupWorkerIds.push(workerId);
    await prisma.workerHeartbeat.create({ data: { worker_id: workerId, concurrency: 2, in_flight: 0 } });

    const report = await getReadiness(prisma);
    expect(report.storage_backend).toBe("postgres");
    expect(report.database?.ok).toBe(true);
    expect(report.worker?.ok).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("getReadiness is not ok when no worker heartbeat exists", async () => {
    const { prisma } = await import("./prisma");
    // No heartbeat rows created in this test.
    const report = await getReadiness(prisma);
    expect(report.worker?.ok).toBe(false);
    expect(report.ok).toBe(false);
  });
});
