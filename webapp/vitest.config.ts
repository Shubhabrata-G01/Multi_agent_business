import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./*" so tests can import
      // route-handler modules (which use the "@/" alias) directly, e.g. to
      // mock next-auth's auth() for lib/apiAuth.ts tests.
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // Several test files share the same real PostgreSQL instance (lib/db/*,
    // lib/jobs/*, lib/orchestrator.jobs.test.ts) and lib/jobs/jobRepository's
    // claimNextJob() deliberately claims "whichever job is next in the whole
    // table" - exactly what it needs to do in production, but it means two
    // test files enqueuing/claiming jobs in parallel worker processes can
    // steal each other's rows. Running files sequentially avoids that
    // without weakening the repository's real claim semantics.
    fileParallelism: false,
  },
});
