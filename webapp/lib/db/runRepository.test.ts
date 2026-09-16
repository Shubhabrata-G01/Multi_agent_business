import crypto from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { RunState } from "../types";

// These exercise the real PostgreSQL repository against DATABASE_URL (loaded
// from .env.local by vitest.setup.ts, or set directly in CI - see
// .github/workflows/ci.yml). If neither is configured (e.g. a contributor
// without local Postgres/Docker set up), the suite skips itself rather than
// failing the whole run - see README.md's "Storage backend" section for how
// to stand up a local Postgres for this.
const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("PostgreSQL runRepository", () => {
  let prisma: (typeof import("../prisma"))["prisma"];
  let repo: typeof import("./runRepository");

  const testRunIds: string[] = [];

  function makeRun(partial: Partial<RunState> = {}): RunState {
    const id = partial.id ?? `test-run-${crypto.randomUUID()}`;
    testRunIds.push(id);
    const now = new Date().toISOString();
    return {
      id,
      owner_id: "owner-1",
      idea: "A test idea",
      status: "running",
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
      ...partial,
    };
  }

  beforeEach(async () => {
    ({ prisma } = await import("../prisma"));
    repo = await import("./runRepository");
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("../prisma");
    if (testRunIds.length > 0) {
      await prisma.run.deleteMany({ where: { id: { in: testRunIds } } });
    }
    await prisma.$disconnect();
  });

  it("round-trips a run through save/load, mapping normalized columns and the JSONB payload", async () => {
    const run = makeRun({ status: "running", owner_id: "owner-alpha" });
    await repo.saveRun(run);

    const row = await prisma.run.findUnique({ where: { id: run.id } });
    expect(row?.owner_id).toBe("owner-alpha");
    expect(row?.status).toBe("running");
    expect(row?.version).toBe(1);

    const loaded = await repo.loadRun(run.id);
    expect(loaded).toEqual(run);
  });

  it("scopes listRunsByOwner to only that owner's runs", async () => {
    const mine = makeRun({ owner_id: "owner-scoped-a" });
    const theirs = makeRun({ owner_id: "owner-scoped-b" });
    await repo.saveRun(mine);
    await repo.saveRun(theirs);

    const mineList = await repo.listRunsByOwner("owner-scoped-a");
    expect(mineList.map((r) => r.id)).toContain(mine.id);
    expect(mineList.map((r) => r.id)).not.toContain(theirs.id);
  });

  it("returns null for a run that was never created", async () => {
    expect(await repo.loadRun(`nonexistent-${crypto.randomUUID()}`)).toBeNull();
  });

  it("rejects a save based on a stale version (optimistic-concurrency / lost-update protection)", async () => {
    const run = makeRun();
    await repo.saveRun(run); // version 1

    // Two independent readers load the same row...
    const readerA = await repo.loadRun(run.id);
    const readerB = await repo.loadRun(run.id);
    expect(readerA).not.toBeNull();
    expect(readerB).not.toBeNull();

    // ...A writes first and succeeds...
    readerA!.status = "held";
    readerA!.updated_at = new Date().toISOString();
    await repo.saveRun(readerA!);

    // ...B's write is now based on a stale version and must be rejected
    // rather than silently clobbering A's update.
    readerB!.status = "cancelled";
    readerB!.updated_at = new Date().toISOString();
    await expect(repo.saveRun(readerB!)).rejects.toThrow(repo.RunConflictError);

    // A's update stands.
    const final = await repo.loadRun(run.id);
    expect(final?.status).toBe("held");
  });

  it("serializes concurrent saves of the SAME loaded object without spurious conflicts", async () => {
    // Mirrors orchestrator.ts's runTask: several concurrent "tasks" mutate
    // and save the same in-memory RunState instance (e.g. parallel Critics).
    // None of these should throw - they're cooperating on one object, not
    // racing independent readers.
    const run = makeRun();
    await repo.saveRun(run);
    const loaded = await repo.loadRun(run.id);
    expect(loaded).not.toBeNull();

    const mutateAndSave = async (label: string) => {
      loaded!.path.push({ flow_step: label, attempt: 1, decision: "advance", reason: null, at: new Date().toISOString() });
      await repo.saveRun(loaded!);
    };

    await Promise.all([mutateAndSave("a"), mutateAndSave("b"), mutateAndSave("c")]);

    const final = await repo.loadRun(run.id);
    expect(final?.path.map((p) => p.flow_step).sort()).toEqual(["a", "b", "c"]);
  });

  it("inserts a brand-new (never-loaded) RunState via saveRun", async () => {
    const run = makeRun();
    await repo.saveRun(run); // never went through loadRun first
    expect(await repo.loadRun(run.id)).toEqual(run);
  });
});
