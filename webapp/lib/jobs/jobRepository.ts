// Durable job queue repository (STEP 3) - backs the standalone worker
// process (lib/worker/run.ts, `npm run worker`). One Job row per run;
// claiming is an atomic `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP
// LOCKED)` so two workers can never claim the same row (item 4), and the
// same WHERE clause also reclaims a "running" job whose lease has expired
// (item 6 - lease recovery after a worker crash/restart, item 3).
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { decryptProviderKey, encryptProviderKey } from "./providerKeyBox";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface ClaimedJob {
  id: string;
  run_id: string;
  provider: string;
  model: string;
  /** Decrypted BYOK key, or undefined when this run uses a server-env key
   * (the caller should re-resolve that itself - see lib/jobs/dispatch.ts). */
  apiKeyOverride: string | undefined;
  attempts: number;
  max_attempts: number;
}

const LEASE_SECONDS = Number(process.env.JOB_LEASE_SECONDS || 120);
const BASE_BACKOFF_MS = Number(process.env.JOB_RETRY_BASE_MS || 5_000);
const MAX_BACKOFF_MS = Number(process.env.JOB_RETRY_MAX_MS || 5 * 60_000);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS || 5);

/**
 * Enqueues (or re-enqueues, on resume) a run's execution as a durable job.
 * Resets attempts/backoff/lease on every call - an explicit start/resume is
 * a fresh attempt budget, not a continuation of a prior one's retry count.
 */
export async function enqueueJob(
  runId: string,
  provider: string,
  model: string,
  userSuppliedApiKey: string | undefined,
): Promise<void> {
  const ciphertext = userSuppliedApiKey ? encryptProviderKey(userSuppliedApiKey) : null;
  await prisma.job.upsert({
    where: { run_id: runId },
    create: {
      run_id: runId,
      provider,
      model,
      api_key_ciphertext: ciphertext,
      status: "queued",
      attempts: 0,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      available_at: new Date(),
    },
    update: {
      provider,
      model,
      api_key_ciphertext: ciphertext,
      status: "queued",
      attempts: 0,
      last_error: null,
      available_at: new Date(),
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
    },
  });
}

interface ClaimRow {
  id: string;
  run_id: string;
  provider: string;
  model: string;
  api_key_ciphertext: string | null;
  attempts: number;
  max_attempts: number;
}

/**
 * Atomically claims the next runnable job: one that's queued and due
 * (`available_at <= now()`), OR one that's "running" but whose lease expired
 * (the worker holding it died without renewing - see renewLease). `FOR
 * UPDATE SKIP LOCKED` means a concurrent claim from another worker skips a
 * row already being claimed rather than blocking on it, so N workers polling
 * simultaneously never double-claim or deadlock on each other.
 */
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimRow[]>(Prisma.sql`
    UPDATE "Job" SET
      status = 'running',
      locked_by = ${workerId},
      locked_at = now(),
      lease_expires_at = now() + (interval '1 second' * ${LEASE_SECONDS}),
      attempts = attempts + 1,
      updated_at = now()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE (status = 'queued' AND available_at <= now())
         OR (status = 'running' AND lease_expires_at < now())
      ORDER BY available_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, run_id, provider, model, api_key_ciphertext, attempts, max_attempts
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    run_id: row.run_id,
    provider: row.provider,
    model: row.model,
    apiKeyOverride: row.api_key_ciphertext ? decryptProviderKey(row.api_key_ciphertext) : undefined,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
  };
}

/** Extends a held job's lease - called on a heartbeat interval while a
 * worker is actively executing it, so a long-running execution (many steps,
 * each a real provider call) never has its lease expire out from under it
 * and get double-claimed by another worker. Only affects rows still locked
 * by this exact worker, so a worker that already lost the job (e.g. it was
 * already reclaimed after a prior expiry) can't resurrect its lease. */
export async function renewLease(jobId: string, workerId: string): Promise<void> {
  await prisma.job.updateMany({
    where: { id: jobId, locked_by: workerId },
    data: { lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000) },
  });
}

export async function completeJob(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "done", api_key_ciphertext: null, locked_by: null, lease_expires_at: null },
  });
}

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/**
 * Records a job execution failure. Bounded retry with exponential backoff
 * (item 5): if attempts remain, re-queues with `available_at` pushed out;
 * once attempts are exhausted, marks the job terminally failed. Returns
 * whether it will retry, so the caller knows whether it still needs to also
 * transition the run itself to a visible failed state.
 */
export async function failJob(
  jobId: string,
  attempts: number,
  maxAttempts: number,
  error: string,
): Promise<boolean> {
  if (attempts >= maxAttempts) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        last_error: error,
        api_key_ciphertext: null,
        locked_by: null,
        lease_expires_at: null,
      },
    });
    return false;
  }
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "queued",
      last_error: error,
      available_at: new Date(Date.now() + backoffMs(attempts)),
      locked_by: null,
      lease_expires_at: null,
    },
  });
  return true;
}

/** Best-effort: marks a run's job cancelled so a queued-but-unclaimed job
 * never starts, and a currently-running one is no longer eligible for
 * lease-expiry retry once it naturally exits (executeRun's own status check
 * already stops it within one iteration - see orchestrator.ts). */
export async function cancelJob(runId: string): Promise<void> {
  await prisma.job.updateMany({
    where: { run_id: runId, status: { in: ["queued", "running"] } },
    data: { status: "cancelled", api_key_ciphertext: null, locked_by: null, lease_expires_at: null },
  });
}

export function generateWorkerId(): string {
  return `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
}
