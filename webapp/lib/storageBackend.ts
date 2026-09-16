// Selects which persistence backend lib/runStore.ts and lib/artifactStore.ts
// dispatch to. PostgreSQL is the production-safe backend and is used by
// default whenever DATABASE_URL is configured; the JSON-filesystem backend
// (webapp/lib/fs/*) is a local-development-only fallback that does not
// survive multi-instance deployment or give any durability/concurrency
// guarantees, so it requires explicit opt-in and is refused outright in
// production. See STEP 2 of the remediation plan / README.md "Storage
// backend" section.

export type StorageBackend = "postgres" | "filesystem";

let cached: StorageBackend | null = null;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resolves (and caches for the life of the process) which backend to use:
 * - STORAGE_BACKEND=filesystem forces the JSON-file backend, but is refused
 *   in production - filesystem mode has no durability across restarts, no
 *   concurrency protection, and does not work across multiple instances.
 * - Otherwise, DATABASE_URL present -> postgres.
 * - No DATABASE_URL: filesystem in development (with a loud console warning
 *   the first time), but a hard error in production - a production deploy
 *   must never silently fall back to the filesystem.
 */
export function getStorageBackend(): StorageBackend {
  if (cached) return cached;

  const explicit = process.env.STORAGE_BACKEND?.trim().toLowerCase();
  if (explicit && explicit !== "postgres" && explicit !== "filesystem") {
    throw new Error(
      `Invalid STORAGE_BACKEND '${explicit}'. Use "postgres" or "filesystem" (or unset it to auto-detect from DATABASE_URL).`,
    );
  }

  if (explicit === "filesystem") {
    if (isProduction()) {
      throw new Error(
        "STORAGE_BACKEND=filesystem is not allowed in production. Filesystem mode is a " +
          "local-development-only fallback: it has no durability across restarts, no " +
          "protection against concurrent writers, and does not work across multiple " +
          "instances. Configure DATABASE_URL and remove STORAGE_BACKEND to use PostgreSQL.",
      );
    }
    cached = "filesystem";
    console.warn(
      "[storage] Using the JSON-filesystem backend (STORAGE_BACKEND=filesystem). " +
        "This is a local-development fallback only and is not production-safe.",
    );
    return cached;
  }

  if (process.env.DATABASE_URL) {
    cached = "postgres";
    console.log("[storage] Using the PostgreSQL backend (DATABASE_URL is set).");
    return cached;
  }

  if (isProduction()) {
    throw new Error(
      "DATABASE_URL is required in production. Set it to a PostgreSQL connection string " +
        "(see README.md). Filesystem storage is not production-safe and cannot be enabled " +
        "in production even via STORAGE_BACKEND.",
    );
  }

  cached = "filesystem";
  console.warn(
    "[storage] No DATABASE_URL configured - falling back to the JSON-filesystem backend " +
      "for local development. This is not production-safe. Set DATABASE_URL to use " +
      "PostgreSQL, which is required in production.",
  );
  return cached;
}

/** Test-only: clears the cached backend decision so tests can exercise
 * different env-var combinations within the same process. */
export function resetStorageBackendCacheForTests(): void {
  cached = null;
}
