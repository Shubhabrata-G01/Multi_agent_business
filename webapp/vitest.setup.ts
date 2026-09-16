// Loads .env.local for local test runs (CI sets DATABASE_URL directly via
// the workflow env instead, so a missing file here is fine).
import path from "path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  // No .env.local (e.g. CI, or a contributor who hasn't set up local
  // Postgres yet) - tests that need DATABASE_URL skip themselves.
}
