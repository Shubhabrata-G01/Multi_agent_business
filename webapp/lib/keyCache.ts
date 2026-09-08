// Short-lived, in-memory-only cache of a run's user-supplied API key, so
// clicking Resume/Restart within a short window of starting or last
// resuming a run doesn't require re-pasting the key every time.
//
// This is NOT the same trust boundary as RunState: the key here is never
// written to runs/<id>.json or anywhere on disk, and never leaves this
// process - see the "ambient-key incident" comment on RunState.key_source
// in webapp/lib/types.ts for why keys are otherwise never persisted at all.
// This cache is a deliberate, bounded (TTL-expiring) exception made purely
// for resume/restart convenience, not a change to that policy.
const KEY_CACHE_TTL_MS = Number(process.env.RUN_CACHE_TTL_MS || 20 * 60 * 1000);
const cache = new Map<string, { key: string; cachedAt: number }>();

export function cacheApiKey(runId: string, apiKey: string): void {
  cache.set(runId, { key: apiKey, cachedAt: Date.now() });
}

export function getCachedApiKey(runId: string): string | null {
  const cached = cache.get(runId);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > KEY_CACHE_TTL_MS) {
    cache.delete(runId);
    return null;
  }
  return cached.key;
}

export function clearCachedApiKey(runId: string): void {
  cache.delete(runId);
}
