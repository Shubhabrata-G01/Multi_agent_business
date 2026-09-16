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
import { prisma } from "../prisma";
import { logger } from "../logger";
import { captureException } from "../errorTracking";
import { validateWorkerProductionConfig } from "../productionConfig";
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
  logger.info("worker claimed job", { workerId: WORKER_ID, jobId: job.id, runId: job.run_id, attempt: job.attempts, maxAttempts: job.max_attempts });

  const heartbeat = setInterval(() => {
    renewLease(job.id, WORKER_ID).catch((err) => {
      logger.error("lease renewal failed", { workerId: WORKER_ID, jobId: job.id }, err);
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const apiKey = resolveJobApiKey(job);
    await executeRun(job.run_id, job.provider as LLMProvider, job.model, apiKey);
    await completeJob(job.id);
    logger.info("worker completed job", { workerId: WORKER_ID, jobId: job.id, runId: job.run_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const willRetry = await failJob(job.id, job.attempts, job.max_attempts, message);
    if (willRetry) {
      logger.warn("job failed, will retry", { workerId: WORKER_ID, jobId: job.id, runId: job.run_id }, err);
    } else {
      logger.error("job failed, attempts exhausted", { workerId: WORKER_ID, jobId: job.id, runId: job.run_id }, err);
      await markRunFailedIfStillRunning(job.run_id, message);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

/** STEP 6 item 4: upserts this worker's heartbeat row every poll tick, so
 * the readiness endpoint (lib/health.ts) can tell a live worker fleet from
 * an empty one. Best-effort - a failure here never stops the poll loop. */
async function sendHeartbeat(): Promise<void> {
  try {
    await prisma.workerHeartbeat.upsert({
      where: { worker_id: WORKER_ID },
      create: { worker_id: WORKER_ID, concurrency: CONCURRENCY, in_flight: inFlight.size },
      update: { concurrency: CONCURRENCY, in_flight: inFlight.size },
    });
  } catch (err) {
    logger.error("heartbeat write failed", { workerId: WORKER_ID }, err);
  }
}

async function pollLoop(): Promise<void> {
  while (!shuttingDown) {
    await sendHeartbeat();
    if (inFlight.size >= CONCURRENCY) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    let job: ClaimedJob | null = null;
    try {
      job = await claimNextJob(WORKER_ID);
    } catch (err) {
      logger.error("claim failed", { workerId: WORKER_ID }, err);
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
  logger.info("worker shutting down", { workerId: WORKER_ID, signal, inFlight: inFlight.size, graceMs: SHUTDOWN_GRACE_MS });

  const grace = sleep(SHUTDOWN_GRACE_MS).then(() => "timeout" as const);
  const drained = Promise.all([...inFlight.values()]).then(() => "drained" as const);
  const outcome = await Promise.race([drained, grace]);
  if (outcome === "timeout" && inFlight.size > 0) {
    logger.warn("shutdown grace period elapsed with jobs still in flight - exiting anyway", {
      workerId: WORKER_ID,
      inFlight: inFlight.size,
    });
  } else {
    logger.info("worker exiting cleanly", { workerId: WORKER_ID });
  }

  try {
    await prisma.workerHeartbeat.delete({ where: { worker_id: WORKER_ID } });
  } catch {
    // Already gone or DB unreachable - not worth failing shutdown over.
  }
  await prisma.$disconnect();
  process.exit(0);
}

async function main(): Promise<void> {
  // Throws ProductionConfigError if the backend isn't PostgreSQL (the
  // worker needs it in every environment, not just production) or if
  // AUTH_SECRET is missing in production (STEP 7 items 5-6).
  const { warnings } = validateWorkerProductionConfig();
  for (const warning of warnings) {
    logger.warn(warning, { workerId: WORKER_ID });
  }

  logger.info("worker starting", {
    workerId: WORKER_ID,
    concurrency: CONCURRENCY,
    pollIntervalMs: POLL_INTERVAL_MS,
    heartbeatMs: HEARTBEAT_INTERVAL_MS,
  });

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await pollLoop();
}

main().catch(async (err) => {
  await captureException("worker fatal error", err, { workerId: WORKER_ID });
  process.exitCode = 1;
});
