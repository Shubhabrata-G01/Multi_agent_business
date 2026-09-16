// Durable worker process (STEP 3) - `npm run worker`. Polls lib/jobs/
// jobRepository.ts for claimable jobs and drives orchestrator.ts's
// executeRun for each one. Runs as a separate OS process from the web
// server, specifically so a web-process restart/deploy never interrupts an
// in-flight run, and so a worker crash is recoverable (its lease expires and
// another worker - or its own restart - reclaims the job; see
// jobRepository.ts's claimNextJob).
import { executeRun, failRunOnUncaughtError } from "../orchestrator";
import { claimNextJob, completeJob, failJob, generateWorkerId, renewLease, type ClaimedJob } from "../jobs/jobRepository";
import { resolveApiKey } from "../providers";
import { getStorageBackend } from "../storageBackend";
import { prisma } from "../prisma";
import type { LLMProvider } from "../types";

const WORKER_ID = generateWorkerId();
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 4));
const POLL_INTERVAL_MS = Math.max(250, Number(process.env.WORKER_POLL_INTERVAL_MS || 2000));
const HEARTBEAT_INTERVAL_MS = Math.max(1000, Number(process.env.JOB_HEARTBEAT_MS || 30_000));
const SHUTDOWN_GRACE_MS = Math.max(0, Number(process.env.WORKER_SHUTDOWN_GRACE_MS || 30_000));

let shuttingDown = false;
const inFlight = new Map<string, Promise<void>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves the actual API key to execute with: the decrypted BYOK key
 * stored on the job, or (when the run uses a server-configured key) a fresh
 * resolve against this process's own env - see providerKeyBox.ts for why a
 * server key is never itself written to the Job row. */
function resolveJobApiKey(job: ClaimedJob): string {
  if (job.apiKeyOverride) return job.apiKeyOverride;
  return resolveApiKey(job.provider as LLMProvider, undefined).apiKey;
}

async function markRunFailedIfStillRunning(runId: string, message: string): Promise<void> {
  await failRunOnUncaughtError(runId, new Error(message));
}

async function processJob(job: ClaimedJob): Promise<void> {
  console.log(`[worker ${WORKER_ID}] claimed job ${job.id} for run ${job.run_id} (attempt ${job.attempts}/${job.max_attempts})`);

  const heartbeat = setInterval(() => {
    renewLease(job.id, WORKER_ID).catch((err) => {
      console.error(`[worker ${WORKER_ID}] lease renewal failed for job ${job.id}:`, err);
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const apiKey = resolveJobApiKey(job);
    await executeRun(job.run_id, job.provider as LLMProvider, job.model, apiKey);
    await completeJob(job.id);
    console.log(`[worker ${WORKER_ID}] job ${job.id} (run ${job.run_id}) completed`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const willRetry = await failJob(job.id, job.attempts, job.max_attempts, message);
    if (willRetry) {
      console.error(`[worker ${WORKER_ID}] job ${job.id} (run ${job.run_id}) failed, will retry: ${message}`);
    } else {
      console.error(`[worker ${WORKER_ID}] job ${job.id} (run ${job.run_id}) failed, attempts exhausted: ${message}`);
      await markRunFailedIfStillRunning(job.run_id, message);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

async function pollLoop(): Promise<void> {
  while (!shuttingDown) {
    if (inFlight.size >= CONCURRENCY) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    let job: ClaimedJob | null = null;
    try {
      job = await claimNextJob(WORKER_ID);
    } catch (err) {
      console.error(`[worker ${WORKER_ID}] claim failed:`, err);
    }
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    const claimed = job;
    const p = processJob(claimed).finally(() => inFlight.delete(claimed.id));
    inFlight.set(claimed.id, p);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker ${WORKER_ID}] received ${signal}, finishing ${inFlight.size} in-flight job(s) (grace ${SHUTDOWN_GRACE_MS}ms)...`);

  const grace = sleep(SHUTDOWN_GRACE_MS).then(() => "timeout" as const);
  const drained = Promise.all([...inFlight.values()]).then(() => "drained" as const);
  const outcome = await Promise.race([drained, grace]);
  if (outcome === "timeout" && inFlight.size > 0) {
    console.warn(
      `[worker ${WORKER_ID}] shutdown grace period elapsed with ${inFlight.size} job(s) still in flight - ` +
        `exiting anyway. Their leases will expire and another worker will resume them.`,
    );
  } else {
    console.log(`[worker ${WORKER_ID}] all in-flight jobs settled, exiting cleanly.`);
  }

  await prisma.$disconnect();
  process.exit(0);
}

async function main(): Promise<void> {
  const backend = getStorageBackend();
  if (backend !== "postgres") {
    throw new Error(
      "The durable worker requires the PostgreSQL storage backend (DATABASE_URL). " +
        "In filesystem mode (local development only), runs execute in-process instead - " +
        "no separate worker is needed or usable. See README.md's \"Storage backend\" section.",
    );
  }

  console.log(
    `[worker ${WORKER_ID}] starting - concurrency=${CONCURRENCY} pollInterval=${POLL_INTERVAL_MS}ms ` +
      `heartbeat=${HEARTBEAT_INTERVAL_MS}ms`,
  );

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await pollLoop();
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exitCode = 1;
});
