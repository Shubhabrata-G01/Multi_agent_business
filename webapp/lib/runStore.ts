// Dispatches to the PostgreSQL run repository (lib/db/runRepository.ts) or
// the JSON-filesystem fallback (lib/fs/fsRunStore.ts) based on
// lib/storageBackend.ts. Every operation is async and must be awaited by
// callers - see STEP 2 of the remediation plan ("no fire-and-forget database
// writes"). This module intentionally has no persistence logic of its own.
import { getStorageBackend } from "./storageBackend";
import * as fsStore from "./fs/fsRunStore";
import * as pgStore from "./db/runRepository";
import type { RunState } from "./types";

export { RunConflictError } from "./db/runRepository";

function backend() {
  return getStorageBackend() === "postgres" ? pgStore : fsStore;
}

export async function saveRun(run: RunState): Promise<void> {
  return backend().saveRun(run);
}

export async function loadRun(id: string): Promise<RunState | null> {
  return backend().loadRun(id);
}

export async function listRuns(): Promise<RunState[]> {
  return backend().listRuns();
}

/** Owner-scoped run lookup (STEP 2 item 1) - lets the /api/runs list route
 * push the ownership filter down to an indexed query on PostgreSQL instead
 * of loading every run and filtering in JS. */
export async function listRunsByOwner(ownerId: string): Promise<RunState[]> {
  return backend().listRunsByOwner(ownerId);
}
