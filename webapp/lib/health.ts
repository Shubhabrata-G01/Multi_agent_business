// Health checks (STEP 6 item 4) - used by app/api/health/live and
// app/api/health/ready. Kept as plain functions (not inlined in the routes)
// so they're independently unit-testable, including degraded-dependency
// cases (a bad prisma client, no worker heartbeats).
import type { PrismaClient } from "@prisma/client";
import { getStorageBackend, type StorageBackend } from "./storageBackend";

export interface DatabaseHealth {
  ok: boolean;
  error?: string;
}

export async function checkDatabaseHealth(client: Pick<PrismaClient, "$queryRaw">): Promise<DatabaseHealth> {
  try {
    await client.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// A worker that hasn't renewed its heartbeat in this long is considered
// gone - generously above WORKER_POLL_INTERVAL_MS's default (2s) so a
// briefly slow tick doesn't flap the health check.
const WORKER_HEARTBEAT_STALE_MS = Number(process.env.WORKER_HEARTBEAT_STALE_MS || 60_000);

export interface WorkerHealth {
  ok: boolean;
  active_workers: number;
  workers: { worker_id: string; concurrency: number; in_flight: number; last_seen_at: string }[];
}

export async function checkWorkerHealth(
  client: Pick<PrismaClient, "workerHeartbeat">,
): Promise<WorkerHealth> {
  const cutoff = new Date(Date.now() - WORKER_HEARTBEAT_STALE_MS);
  const rows = await client.workerHeartbeat.findMany({ where: { last_seen_at: { gte: cutoff } } });
  return {
    ok: rows.length > 0,
    active_workers: rows.length,
    workers: rows.map((r) => ({
      worker_id: r.worker_id,
      concurrency: r.concurrency,
      in_flight: r.in_flight,
      last_seen_at: r.last_seen_at.toISOString(),
    })),
  };
}

export interface ReadinessReport {
  ok: boolean;
  storage_backend: StorageBackend;
  database: DatabaseHealth | null;
  worker: WorkerHealth | null;
}

/**
 * Full readiness: database connectivity (Postgres backend only - filesystem
 * mode has none to check) and worker liveness (Postgres backend only -
 * filesystem mode runs in-process, no separate worker to check). A
 * filesystem-mode deployment is "ready" as long as the process is up at all,
 * consistent with it having no external dependencies to be ready FOR.
 */
export async function getReadiness(
  client: Pick<PrismaClient, "$queryRaw" | "workerHeartbeat">,
): Promise<ReadinessReport> {
  const backend = getStorageBackend();
  if (backend !== "postgres") {
    return { ok: true, storage_backend: backend, database: null, worker: null };
  }

  const [database, worker] = await Promise.all([checkDatabaseHealth(client), checkWorkerHealth(client)]);
  return {
    ok: database.ok && worker.ok,
    storage_backend: backend,
    database,
    worker,
  };
}
