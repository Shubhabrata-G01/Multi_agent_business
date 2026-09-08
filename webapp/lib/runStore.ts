import fs from "fs";
import path from "path";
import type { RunState } from "./types";

const RUNS_DIR = path.join(process.cwd(), "runs");

function ensureDir() {
  if (!fs.existsSync(RUNS_DIR)) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
  }
}

function filePathFor(id: string): string {
  // id comes only from crypto.randomUUID() in orchestrator.ts, never from
  // user input, so no path-traversal sanitization is needed here.
  return path.join(RUNS_DIR, `${id}.json`);
}

// In-memory cache so status polling during an active run doesn't have to
// hit disk on every request; still persisted to disk after every step so
// progress survives a server restart. Entries expire after RUN_CACHE_TTL_MS
// so a cache entry that's gone stale relative to disk (e.g. a dev-mode
// module reload leaving a live request bound to an old module instance's
// cache - this app has hit exactly that once) self-heals within a bounded
// window instead of diverging from disk forever.
const RUN_CACHE_TTL_MS = Number(process.env.RUN_CACHE_TTL_MS || 20 * 60 * 1000);
const cache = new Map<string, { run: RunState; cachedAt: number }>();

export function saveRun(run: RunState): void {
  ensureDir();
  cache.set(run.id, { run, cachedAt: Date.now() });
  fs.writeFileSync(filePathFor(run.id), JSON.stringify(run, null, 2), "utf-8");
}

export function loadRun(id: string): RunState | null {
  const cached = cache.get(id);
  if (cached) {
    if (Date.now() - cached.cachedAt <= RUN_CACHE_TTL_MS) {
      return cached.run;
    }
    cache.delete(id);
  }
  const file = filePathFor(id);
  if (!fs.existsSync(file)) return null;
  const run = JSON.parse(fs.readFileSync(file, "utf-8")) as RunState;
  cache.set(id, { run, cachedAt: Date.now() });
  return run;
}

export function listRuns(): RunState[] {
  ensureDir();
  const files = fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      const id = f.replace(/\.json$/, "");
      return loadRun(id);
    })
    .filter((r): r is RunState => r !== null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
