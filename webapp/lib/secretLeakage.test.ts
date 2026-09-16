import { afterAll, afterEach, describe, expect, it } from "vitest";

// STEP 4 item 15 - a user-supplied (BYOK) API key must never be persisted in
// plaintext anywhere: not in the Run row's JSONB `data` (which is what
// GET /api/runs/[id] returns verbatim - see app/api/runs/[id]/route.ts), and
// not in the Job row outside of its encrypted ciphertext column.
const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

const SECRET_KEY = "sk-ant-super-secret-do-not-leak-me-1234567890";

describeIfDb("secret (API key) leakage", () => {
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

  it("never writes the plaintext BYOK key into the Run row (data or any column)", async () => {
    const { startRun } = await import("./orchestrator");
    const { prisma } = await import("./prisma");

    const id = await startRun(
      "Secret-leakage test idea",
      "anthropic",
      "claude-haiku-4-5-20251001",
      SECRET_KEY,
      "assisted",
      undefined,
      "leak-test-owner",
      "leak-test-org",
    );
    cleanupRunIds.push(id);

    const row = await prisma.run.findUniqueOrThrow({ where: { id } });
    const rowJson = JSON.stringify(row);
    expect(rowJson).not.toContain(SECRET_KEY);

    // Also verify via the public read path (what GET /api/runs/[id] returns).
    const { loadRun } = await import("./runStore");
    const run = await loadRun(id);
    expect(JSON.stringify(run)).not.toContain(SECRET_KEY);
  });

  it("stores the BYOK key on the Job row only as ciphertext, never as plaintext", async () => {
    const { startRun } = await import("./orchestrator");
    const { prisma } = await import("./prisma");

    const id = await startRun(
      "Secret-leakage job test idea",
      "anthropic",
      "claude-haiku-4-5-20251001",
      SECRET_KEY,
      "assisted",
      undefined,
      "leak-test-owner",
      "leak-test-org",
    );
    cleanupRunIds.push(id);

    const job = await prisma.job.findUniqueOrThrow({ where: { run_id: id } });
    expect(job.api_key_ciphertext).not.toBeNull();
    expect(job.api_key_ciphertext).not.toContain(SECRET_KEY);
    // Every other column, and the ciphertext's own base64 form, must not
    // contain the raw key either.
    expect(JSON.stringify({ ...job, api_key_ciphertext: undefined })).not.toContain(SECRET_KEY);
  });

  it("does not write a server-configured (env) key to the Job row at all", async () => {
    const { startRun } = await import("./orchestrator");
    const { prisma } = await import("./prisma");

    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-server-side-env-key-should-never-be-in-db";
    try {
      const id = await startRun(
        "Server-key test idea",
        "anthropic",
        "claude-haiku-4-5-20251001",
        undefined, // no user-supplied key - falls back to server env
        "assisted",
        undefined,
        "leak-test-owner",
        "leak-test-org",
      );
      cleanupRunIds.push(id);

      const job = await prisma.job.findUniqueOrThrow({ where: { run_id: id } });
      expect(job.api_key_ciphertext).toBeNull();
    } finally {
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });
});
