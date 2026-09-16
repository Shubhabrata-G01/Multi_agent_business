// Data retention and deletion (STEP 6 item 8). Postgres-only - filesystem
// mode's data is just files under runs/<id>/, deleted the same way any
// local file would be (no API surface needed for local dev).
import { prisma } from "./prisma";
import { getStorageBackend } from "./storageBackend";

/**
 * Permanently deletes a run and everything derived from it: artifact
 * versions (cascades via the FK), its durable job, usage/provider-error
 * events, and review-workspace comments/reviews. Irreversible - callers
 * (the DELETE /api/runs/[id] route) gate this behind an owner/admin role
 * check before calling it.
 */
export async function deleteRunData(runId: string): Promise<void> {
  if (getStorageBackend() !== "postgres") {
    throw new Error("Run deletion requires the PostgreSQL storage backend.");
  }
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { run_id: runId } }),
    prisma.stepReview.deleteMany({ where: { run_id: runId } }),
    prisma.usageEvent.deleteMany({ where: { run_id: runId } }),
    prisma.providerErrorEvent.deleteMany({ where: { run_id: runId } }),
    prisma.job.deleteMany({ where: { run_id: runId } }),
    // ArtifactVersion rows cascade automatically (onDelete: Cascade on the
    // Run relation), but deleting them explicitly first keeps this an
    // easy-to-read, ordered teardown rather than relying on cascade order.
    prisma.artifactVersion.deleteMany({ where: { run_id: runId } }),
    prisma.run.deleteMany({ where: { id: runId } }),
  ]);
}

/** Deletes every run (and its derived data) belonging to an organization -
 * the operation an "org offboarding" or GDPR-style account-deletion flow
 * would call. Membership/Organization rows themselves are left for the
 * caller to remove via Prisma directly (out of scope here - this module is
 * about RUN data, not account/membership lifecycle). */
export async function deleteOrganizationRunData(organizationId: string): Promise<number> {
  if (getStorageBackend() !== "postgres") {
    throw new Error("Run deletion requires the PostgreSQL storage backend.");
  }
  const runs = await prisma.run.findMany({ where: { organization_id: organizationId }, select: { id: true } });
  for (const run of runs) {
    await deleteRunData(run.id);
  }
  return runs.length;
}
