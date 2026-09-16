// Next.js server-startup hook (stable since Next 15, runs once per server
// process in the Node.js runtime - see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
// STEP 2 item 6: fail startup loudly rather than silently falling back to a
// non-production-safe storage backend. Extended in STEP 7 with the fuller
// production config validator (AUTH_SECRET, provider keys, worker config).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getStorageBackend } = await import("./lib/storageBackend");
  const backend = getStorageBackend(); // throws in production if misconfigured - see lib/storageBackend.ts
  console.log(`[startup] storage backend: ${backend}`);

  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    throw new Error(
      "AUTH_SECRET is required in production (used to sign session tokens - see README.md).",
    );
  }
}
