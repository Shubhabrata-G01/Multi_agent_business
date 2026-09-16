// Usage recording (STEP 4 item 8) - one UsageEvent row per provider call,
// written by orchestrator.ts's runTask right after a StepTask completes.
// Postgres-only (there is no usage table in filesystem mode - see
// lib/storageBackend.ts); recordUsage/getRunCostUsd are no-ops there, which
// is fine since filesystem mode has no quota enforcement either (dev-only).
import { prisma } from "./prisma";
import { estimateCostUsd } from "./pricing";
import { getStorageBackend } from "./storageBackend";
import type { LLMProvider } from "./types";

export interface UsageParams {
  runId: string;
  userId: string;
  organizationId: string;
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  retries?: number;
}

export async function recordUsage(params: UsageParams): Promise<void> {
  if (getStorageBackend() !== "postgres") return;
  const cost = estimateCostUsd(params.provider, params.model, params.inputTokens, params.outputTokens);
  await prisma.usageEvent.create({
    data: {
      run_id: params.runId,
      user_id: params.userId,
      organization_id: params.organizationId,
      provider: params.provider,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost_usd: cost,
      latency_ms: params.latencyMs ?? 0,
      retries: params.retries ?? 0,
    },
  });
}

export interface ProviderErrorParams {
  runId: string;
  userId: string;
  organizationId: string;
  provider: LLMProvider;
  model: string;
  error: string;
}

/** STEP 6: records a provider call that failed even after exhausting
 * runProviderTurn's retries - backs the "provider errors" metric. */
export async function recordProviderError(params: ProviderErrorParams): Promise<void> {
  if (getStorageBackend() !== "postgres") return;
  await prisma.providerErrorEvent.create({
    data: {
      run_id: params.runId,
      user_id: params.userId,
      organization_id: params.organizationId,
      provider: params.provider,
      model: params.model,
      error: params.error,
    },
  });
}

export async function getRunCostUsd(runId: string): Promise<number> {
  if (getStorageBackend() !== "postgres") return 0;
  const agg = await prisma.usageEvent.aggregate({
    where: { run_id: runId },
    _sum: { estimated_cost_usd: true },
  });
  return agg._sum.estimated_cost_usd ?? 0;
}

export interface RunUsageSummary {
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  provider_calls: number;
}

/** Live usage so far for a run (STEP 8 item 4) - polled by the run detail
 * page alongside run status. */
export async function getRunUsageSummary(runId: string): Promise<RunUsageSummary> {
  if (getStorageBackend() !== "postgres") {
    return { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, provider_calls: 0 };
  }
  const agg = await prisma.usageEvent.aggregate({
    where: { run_id: runId },
    _sum: { input_tokens: true, output_tokens: true, estimated_cost_usd: true },
    _count: true,
  });
  return {
    input_tokens: agg._sum.input_tokens ?? 0,
    output_tokens: agg._sum.output_tokens ?? 0,
    estimated_cost_usd: agg._sum.estimated_cost_usd ?? 0,
    provider_calls: agg._count,
  };
}

export async function getOrganizationMonthlyTokens(organizationId: string): Promise<number> {
  if (getStorageBackend() !== "postgres") return 0;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const agg = await prisma.usageEvent.aggregate({
    where: { organization_id: organizationId, created_at: { gte: startOfMonth } },
    _sum: { input_tokens: true, output_tokens: true },
  });
  return (agg._sum.input_tokens ?? 0) + (agg._sum.output_tokens ?? 0);
}
