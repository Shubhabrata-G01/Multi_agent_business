// In-process per-run job queue (Phase 2b seam). Every run's executeRun loop is
// enqueued here rather than started ad hoc, so a single run can never have two
// overlapping loops (e.g. a resume firing while a prior loop is still settling),
// while different runs stay concurrent. This is the SWAP POINT for a durable
// queue/worker: replace this module's internals with a real broker and the call
// sites (startRun/resumeRun) are unchanged.
//
// NB: durability itself - surviving a process restart - still requires that
// external broker + DB-backed state (Phase 2a/2b proper); this in-process
// version keeps the seam and the per-run serialization without new infra.

const chains = new Map<string, Promise<unknown>>();

/**
 * Enqueue a run's job to run after any in-flight job for the same id. The job is
 * expected to handle its own errors; the queue swallows anything that escapes so
 * one failure never breaks the chain. Returns the tail promise (for tests).
 */
export function enqueueRun(id: string, job: () => Promise<void>): Promise<void> {
  const prev = chains.get(id) ?? Promise.resolve();
  const next = prev.then(() => job()).catch(() => {});
  chains.set(id, next);
  // Drop the entry once settled, but only if nothing newer replaced it.
  void next.finally(() => {
    if (chains.get(id) === next) chains.delete(id);
  });
  return next;
}

/** Number of runs with a job currently queued/in-flight (diagnostics/tests). */
export function activeRunCount(): number {
  return chains.size;
}
