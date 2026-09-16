// Production configuration validation (STEP 7 items 5-6). Called from
// instrumentation.ts (web process) and lib/worker/run.ts's main() (worker
// process) so both fail loudly and immediately on a missing/invalid
// required setting, rather than failing confusingly later (e.g. the first
// BYOK run mysteriously can't decrypt its key because AUTH_SECRET differs
// between processes, or the worker silently never claims anything because
// DATABASE_URL points at the wrong database).
import { getStorageBackend } from "./storageBackend";

export class ProductionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionConfigError";
  }
}

const PROVIDER_ENV_VARS = ["ANTHROPIC_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY"];

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Validated by both the web process (instrumentation.ts) and the worker
 * process (lib/worker/run.ts) - storage backend + AUTH_SECRET are required
 * by both; provider keys are an informational warning only (BYOK-only is a
 * valid, if less convenient, deployment). */
export function validateSharedProductionConfig(): { warnings: string[] } {
  const warnings: string[] = [];

  // Throws on its own (ProductionConfigError-equivalent) if DATABASE_URL is
  // missing in production, or STORAGE_BACKEND=filesystem is forced in
  // production - see lib/storageBackend.ts. Calling it here is what
  // actually triggers that check at startup rather than on first use.
  getStorageBackend();

  if (isProduction() && !process.env.AUTH_SECRET) {
    throw new ProductionConfigError(
      "AUTH_SECRET is required in production - it signs session cookies (auth.ts) and encrypts " +
        "BYOK provider keys in transit to the durable worker (lib/jobs/providerKeyBox.ts). Set it " +
        "to a long random value (e.g. `openssl rand -base64 32`).",
    );
  }

  if (isProduction() && !PROVIDER_ENV_VARS.some((v) => process.env[v])) {
    warnings.push(
      "No server-side provider API key is configured (ANTHROPIC_API_KEY/GROQ_API_KEY/" +
        "OPENROUTER_API_KEY/GEMINI_API_KEY) - every run will require the caller to supply their " +
        "own key (BYOK). This is a valid deployment choice, not an error, but confirm it's " +
        "intentional (see README.md's \"Prefer server-managed provider keys\" note).",
    );
  }

  return { warnings };
}

/** Web-process-only checks (instrumentation.ts). */
export function validateWebProductionConfig(): { warnings: string[] } {
  return validateSharedProductionConfig();
}

/** Worker-process-only checks (lib/worker/run.ts). The worker requires
 * PostgreSQL unconditionally (checked by its own main() already via
 * getStorageBackend() returning "filesystem" -> refuses to start), plus the
 * shared checks above (AUTH_SECRET, provider keys). */
export function validateWorkerProductionConfig(): { warnings: string[] } {
  const shared = validateSharedProductionConfig();
  if (getStorageBackend() !== "postgres") {
    throw new ProductionConfigError(
      "The durable worker requires the PostgreSQL storage backend (DATABASE_URL) in every " +
        "environment, not just production - see lib/worker/run.ts.",
    );
  }
  return shared;
}
