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
// progress survives a server restart.
const cache = new Map<string, RunState>();

export function saveRun(run: RunState): void {
  ensureDir();
  cache.set(run.id, run);
  fs.writeFileSync(filePathFor(run.id), JSON.stringify(run, null, 2), "utf-8");
}

export function loadRun(id: string): RunState | null {
  const cached = cache.get(id);
  if (cached) return cached;
  const file = filePathFor(id);
  if (!fs.existsSync(file)) return null;
  const run = JSON.parse(fs.readFileSync(file, "utf-8")) as RunState;
  cache.set(id, run);
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
