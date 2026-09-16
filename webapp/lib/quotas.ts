// Per-user and per-organization quotas (STEP 4 items 6-7). Postgres-only
// (filesystem mode has no Run/UsageEvent table to query against - see
// lib/storageBackend.ts - and is dev-only anyway, so it's simply
// unenforced there rather than approximated).
import { prisma } from "./prisma";
import { getStorageBackend } from "./storageBackend";
import { getOrganizationMonthlyTokens } from "./usage";

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export interface QuotaConfig {
  orgMaxConcurrentRuns: number;
  orgMaxDailyRuns: number;
  orgMonthlyTokenBudget: number;
  orgMaxRunCostUsd: number;
  userMaxConcurrentRuns: number;
  userMaxDailyRuns: number;
}

export function getQuotaConfig(): QuotaConfig {
  return {
    orgMaxConcurrentRuns: Number(process.env.ORG_MAX_CONCURRENT_RUNS || 3),
    orgMaxDailyRuns: Number(process.env.ORG_MAX_DAILY_RUNS || 20),
    orgMonthlyTokenBudget: Number(process.env.ORG_MONTHLY_TOKEN_BUDGET || 5_000_000),
    orgMaxRunCostUsd: Number(process.env.ORG_MAX_RUN_COST_USD || 20),
    userMaxConcurrentRuns: Number(process.env.USER_MAX_CONCURRENT_RUNS || 2),
    userMaxDailyRuns: Number(process.env.USER_MAX_DAILY_RUNS || 10),
  };
}

const ACTIVE_STATUSES = ["running", "held"];

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Throws QuotaExceededError (caller surfaces this as HTTP 429) if starting a
 * new run would exceed any per-user or per-organization ceiling. Checked
 * before a run is created (STEP 4 item 7's "before execution" half); the
 * per-run cost ceiling's "during execution" half is enforced inside
 * orchestrator.ts's executeRun loop via getRunCostUsd.
 */
export async function assertCanStartRun(userId: string, organizationId: string): Promise<void> {
  if (getStorageBackend() !== "postgres") return;

  const cfg = getQuotaConfig();
  const today = startOfTodayUtc();

  const [orgConcurrent, userConcurrent, orgToday, userToday, monthlyTokens] = await Promise.all([
    prisma.run.count({ where: { organization_id: organizationId, status: { in: ACTIVE_STATUSES } } }),
    prisma.run.count({ where: { owner_id: userId, status: { in: ACTIVE_STATUSES } } }),
    prisma.run.count({ where: { organization_id: organizationId, created_at: { gte: today } } }),
    prisma.run.count({ where: { owner_id: userId, created_at: { gte: today } } }),
    getOrganizationMonthlyTokens(organizationId),
  ]);

  if (orgConcurrent >= cfg.orgMaxConcurrentRuns) {
    throw new QuotaExceededError(
      `Your organization has reached its concurrent-run limit (${cfg.orgMaxConcurrentRuns}). Wait for a run to finish, or cancel one, before starting another.`,
    );
  }
  if (userConcurrent >= cfg.userMaxConcurrentRuns) {
    throw new QuotaExceededError(
      `You have reached your concurrent-run limit (${cfg.userMaxConcurrentRuns}).`,
    );
  }
  if (orgToday >= cfg.orgMaxDailyRuns) {
    throw new QuotaExceededError(
      `Your organization has reached its daily run limit (${cfg.orgMaxDailyRuns}).`,
    );
  }
  if (userToday >= cfg.userMaxDailyRuns) {
    throw new QuotaExceededError(`You have reached your daily run limit (${cfg.userMaxDailyRuns}).`);
  }
  if (monthlyTokens >= cfg.orgMonthlyTokenBudget) {
    throw new QuotaExceededError(
      `Your organization has reached its monthly token budget (${cfg.orgMonthlyTokenBudget.toLocaleString()} tokens). It resets at the start of next month.`,
    );
  }
}
