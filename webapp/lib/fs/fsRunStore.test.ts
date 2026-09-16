import fs from "fs";
import path from "path";
import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { loadRun, saveRun, listRuns, listRunsByOwner, resetFsRunCacheForTests } from "./fsRunStore";
import type { RunState } from "../types";

// Explicit filesystem-fallback behavior (STEP 2 item 6/8): this is the
// local-development-only backend used when STORAGE_BACKEND=filesystem or no
// DATABASE_URL is configured (see lib/storageBackend.ts). These tests write
// real files under runs/ using disposable test-fixture ids and clean up
// after themselves so they don't pollute real run data.
const RUNS_DIR = path.join(process.cwd(), "runs");
const createdIds: string[] = [];

function makeRun(partial: Partial<RunState> = {}): RunState {
  const id = partial.id ?? `test-fixture-${crypto.randomUUID()}`;
  createdIds.push(id);
  const now = new Date().toISOString();
  return {
    id,
    owner_id: "owner-1",
    idea: "idea",
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

afterEach(() => {
  resetFsRunCacheForTests();
  for (const id of createdIds.splice(0)) {
    const file = path.join(RUNS_DIR, `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

describe("fsRunStore (filesystem fallback)", () => {
  it("round-trips a run to a JSON file under runs/", async () => {
    const run = makeRun();
    await saveRun(run);

    const file = path.join(RUNS_DIR, `${run.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual(run);

    resetFsRunCacheForTests(); // force a real disk read, not the in-memory cache
    expect(await loadRun(run.id)).toEqual(run);
  });

  it("returns null for a run that has no file on disk", async () => {
    expect(await loadRun(`nonexistent-${crypto.randomUUID()}`)).toBeNull();
  });

  it("listRunsByOwner filters by owner_id, same as the PostgreSQL repository's contract", async () => {
    const mine = makeRun({ owner_id: "owner-fs-a" });
    const theirs = makeRun({ owner_id: "owner-fs-b" });
    await saveRun(mine);
    await saveRun(theirs);
    resetFsRunCacheForTests();

    const mineList = await listRunsByOwner("owner-fs-a");
    expect(mineList.map((r) => r.id)).toContain(mine.id);
    expect(mineList.map((r) => r.id)).not.toContain(theirs.id);
  });

  it("has NO concurrent-write protection - a later save silently wins (documents why this is dev-only)", async () => {
    const run = makeRun();
    await saveRun(run);

    const readerA = await loadRun(run.id);
    const readerB = await loadRun(run.id);
    readerA!.status = "held";
    readerB!.status = "cancelled";

    // Unlike lib/db/runRepository.ts's optimistic-concurrency check, this
    // backend has no version/CAS - whichever save runs last wins, silently.
    await saveRun(readerA!);
    await saveRun(readerB!); // does NOT throw, even though it clobbers A's write

    resetFsRunCacheForTests();
    const final = await loadRun(run.id);
    expect(final?.status).toBe("cancelled");
  });

  it("listRuns includes fixtures written to disk", async () => {
    const run = makeRun();
    await saveRun(run);
    resetFsRunCacheForTests();
    const all = await listRuns();
    expect(all.map((r) => r.id)).toContain(run.id);
  });
});
