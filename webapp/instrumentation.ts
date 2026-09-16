// Next.js server-startup hook (stable since Next 15, runs once per server
// process in the Node.js runtime - see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
// STEP 2 item 6 / STEP 7 items 5-6: fail startup loudly on missing/invalid
// production configuration rather than failing confusingly later.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getStorageBackend } = await import("./lib/storageBackend");
  const { validateWebProductionConfig } = await import("./lib/productionConfig");

  const backend = getStorageBackend();
  console.log(`[startup] storage backend: ${backend}`);

  const { warnings } = validateWebProductionConfig();
  for (const warning of warnings) {
    console.warn(`[startup] ${warning}`);
  }
}
