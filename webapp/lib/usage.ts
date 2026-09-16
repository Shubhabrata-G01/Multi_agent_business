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
