// In-process, in-memory fixed-window rate limiter (STEP 4 item 5). Sufficient
// for a single web-process deployment; a horizontally-scaled deployment
// should back this with Redis/DB instead - checkRateLimit's signature is the
// seam, callers don't need to change.
import { NextResponse } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

interface Rule {
  windowMs: number;
  max: number;
}

const RULES = {
  signup: { windowMs: 60_000, max: 5 },
  login: { windowMs: 60_000, max: 10 },
  classify: { windowMs: 60_000, max: 20 },
  run_create: { windowMs: 60_000, max: 10 },
  resume: { windowMs: 60_000, max: 20 },
  approval: { windowMs: 60_000, max: 30 },
} satisfies Record<string, Rule>;

export type RateLimitName = keyof typeof RULES;

const buckets = new Map<string, Bucket>();

/**
 * Records one hit against `key` under `rule` and reports whether it's over
 * the limit. Framework-agnostic (no NextResponse) so it can be used from
 * contexts other than a route handler - e.g. auth.ts's Credentials
 * `authorize()` callback, which can't return an HTTP response directly.
 */
export function isRateLimited(key: string, rule: RateLimitName): boolean {
  const cfg = RULES[rule];
  const bucketKey = `${rule}:${key}`;
  const now = Date.now();

  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + cfg.windowMs };
    buckets.set(bucketKey, bucket);
  }
  bucket.count += 1;
  return bucket.count > cfg.max;
}

function retryAfterSeconds(key: string, rule: RateLimitName): number {
  const bucket = buckets.get(`${rule}:${key}`);
  if (!bucket) return 1;
  return Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
}

/**
 * Returns a 429 NextResponse if `key` has exceeded `rule`'s limit, else null
 * (caller proceeds normally). `key` should identify the actual requester -
 * an IP address for unauthenticated endpoints (signup/login), a user id for
 * authenticated ones.
 */
export function checkRateLimit(key: string, rule: RateLimitName): NextResponse | null {
  if (!isRateLimited(key, rule)) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds(key, rule)) } },
  );
}

/** Best-effort request IP for unauthenticated endpoints. Trusts
 * X-Forwarded-For (set by essentially every PaaS/proxy this would run
 * behind); falls back to a constant so requests without one still share a
 * (coarser) limit rather than bypassing it entirely. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

let cleanupTimer: ReturnType<typeof setInterval> | undefined;
function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 5 * 60_000);
  cleanupTimer.unref?.();
}
startCleanup();

/** Test-only. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
