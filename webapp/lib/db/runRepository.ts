// PostgreSQL-backed run repository (see lib/storageBackend.ts). Normalizes
// id/owner/status/timestamps into real columns for indexed lookups (STEP 2
// item 3) and keeps the full RunState as JSONB in `data` - the orchestrator's
// state machine still reads/writes the same RunState shape it always has, so
// this repository is purely a persistence swap, not a data-model rewrite.
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { RunState } from "../types";

export class RunConflictError extends Error {
  constructor(id: string) {
    super(
      `Run ${id} was concurrently modified by another writer (optimistic-concurrency ` +
        `conflict). Reload the run and retry the operation.`,
    );
    this.name = "RunConflictError";
  }
}

// Tracks the DB row version each RunState instance was last loaded/saved at.
// Kept out-of-band (WeakMap keyed by object identity) rather than as a field
// on RunState so it never leaks into the JSON returned to API clients or
// written into ArtifactVersion snapshots. A RunState that was built fresh
// (e.g. orchestrator.ts's initRun) rather than loaded has no entry, which
// `save` below treats as "insert".
const versionOf = new WeakMap<RunState, number>();

// Serializes writes to the same run id within this process. Several
// concurrent StepTask writers can share one loaded RunState object (e.g.
// orchestrator.ts's runTask calls for parallel Critics all mutate the same
// `run` instance) - without this, two nearly-simultaneous saves would both
// read the same "expected version" and race on the same optimistic-
// concurrency check, so one would fail the CAS even though there's no real
// conflict (they're the same process cooperatively extending one object).
// Serializing here lets each queued save observe the version the previous
// one just committed, so only a genuinely different, out-of-date write (e.g.
// a concurrent cancelRun racing the executeRun loop) trips the CAS check.
const writeChains = new Map<string, Promise<unknown>>();

function serialize<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(id) ?? Promise.resolve();
  const settled = prev.then(
    () => undefined,
    () => undefined,
  );
  const result = settled.then(fn);
  const tracked = result.then(
    () => undefined,
    () => undefined,
  );
  writeChains.set(id, tracked);
  void tracked.finally(() => {
    if (writeChains.get(id) === tracked) writeChains.delete(id);
  });
  return result;
}

function rowToRun(row: { data: Prisma.JsonValue }): RunState {
  return row.data as unknown as RunState;
}

async function insert(run: RunState): Promise<void> {
  try {
    const row = await prisma.run.create({
      data: {
        id: run.id,
        owner_id: run.owner_id ?? "",
        status: run.status,
        created_at: new Date(run.created_at),
        updated_at: new Date(run.updated_at),
        data: run as unknown as Prisma.InputJsonValue,
        version: 1,
      },
    });
    versionOf.set(run, row.version);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new RunConflictError(run.id);
    }
    throw err;
  }
}

export async function createRun(run: RunState): Promise<void> {
  await serialize(run.id, () => insert(run));
}

export async function loadRun(id: string): Promise<RunState | null> {
  const row = await prisma.run.findUnique({ where: { id } });
  if (!row) return null;
  const run = rowToRun(row);
  versionOf.set(run, row.version);
  return run;
}

/**
 * Persists `run`, using optimistic concurrency: if `run` was previously
 * loaded/saved through this repository, the write only succeeds if the row's
 * version still matches what was last observed - otherwise it throws
 * RunConflictError rather than silently overwriting a newer write (STEP 2
 * item 1's "lost update" safeguard). A RunState that has never round-tripped
 * through this repository (a brand-new run from initRun) is inserted.
 */
export async function saveRun(run: RunState): Promise<void> {
  await serialize(run.id, async () => {
    const expected = versionOf.get(run);
    if (expected === undefined) {
      await insert(run);
      return;
    }
    const result = await prisma.run.updateMany({
      where: { id: run.id, version: expected },
      data: {
        owner_id: run.owner_id ?? "",
        status: run.status,
        updated_at: new Date(run.updated_at),
        data: run as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new RunConflictError(run.id);
    }
    versionOf.set(run, expected + 1);
  });
}

export async function listRuns(): Promise<RunState[]> {
  const rows = await prisma.run.findMany({ orderBy: { created_at: "desc" } });
  return rows.map((row) => {
    const run = rowToRun(row);
    versionOf.set(run, row.version);
    return run;
  });
}

export async function listRunsByOwner(ownerId: string): Promise<RunState[]> {
  const rows = await prisma.run.findMany({
    where: { owner_id: ownerId },
    orderBy: { created_at: "desc" },
  });
  return rows.map((row) => {
    const run = rowToRun(row);
    versionOf.set(run, row.version);
    return run;
  });
}

/** Test-only: exposes whether `run` currently has a tracked version, without
 * exposing the WeakMap itself. */
export function hasTrackedVersionForTests(run: RunState): boolean {
  return versionOf.get(run) !== undefined;
}
