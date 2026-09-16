// Estimated cost and duration BEFORE a run starts (STEP 8 item 3). Uses this
// organization's own historical per-call token averages when there's enough
// history to trust (>=10 prior calls on the same provider+model), falling
// back to a fixed heuristic otherwise - both are estimates, never a
// guarantee, and the UI must say so (see app/page.tsx).
import { prisma } from "./prisma";
import { estimateCostUsd } from "./pricing";
import { getStorageBackend } from "./storageBackend";
import { reviewersForNode } from "./router";
import { lastStepOfScope, type PhaseScope } from "./phaseScopes";
import type { LLMProvider, Roadmap, WorkflowNode } from "./types";

// Blended across Creator/Critic/Approver/Executor/Contributor - a Creator
// call dominates (full artifact, MAX_TOKENS-scale output) while
// Critic/Approver/Executor calls are much smaller (see orchestrator.ts's
// CRITIC_MAX_TOKENS/APPROVER_MAX_TOKENS/EXECUTOR_MAX_TOKENS), so this is
// deliberately well below a Creator call's own ceiling.
const HEURISTIC_INPUT_TOKENS_PER_TASK = 1800;
const HEURISTIC_OUTPUT_TOKENS_PER_TASK = 1200;
const HEURISTIC_SECONDS_PER_TASK = 20;
const MIN_HISTORICAL_SAMPLES = 10;
const MAX_CRITICS_PER_STEP = 6; // mirrors orchestrator.ts's own default

export interface RunEstimate {
  steps: number;
  estimated_tasks: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  estimated_duration_minutes: number;
  based_on: "historical_average" | "heuristic_default";
}

function scopedNodes(roadmap: Roadmap, scope: PhaseScope): WorkflowNode[] {
  const stop = lastStepOfScope(roadmap, scope);
  if (!stop) return roadmap.nodes;
  const idx = roadmap.nodes.findIndex((n) => n.flow_step === stop);
  return idx === -1 ? roadmap.nodes : roadmap.nodes.slice(0, idx + 1);
}

function estimatedTaskCount(nodes: WorkflowNode[]): number {
  let tasks = 0;
  for (const node of nodes) {
    tasks += 1; // Creator
    tasks += reviewersForNode(node, MAX_CRITICS_PER_STEP).length; // Critics
    if (node.is_gate) tasks += 2; // Approver + Executor
  }
  return tasks;
}

async function historicalAverages(
  organizationId: string,
  provider: LLMProvider,
  model: string,
): Promise<{ input: number; output: number } | null> {
  if (getStorageBackend() !== "postgres") return null;
  const agg = await prisma.usageEvent.aggregate({
    where: { organization_id: organizationId, provider, model },
    _avg: { input_tokens: true, output_tokens: true },
    _count: true,
  });
  if (agg._count < MIN_HISTORICAL_SAMPLES) return null;
  return { input: agg._avg.input_tokens ?? 0, output: agg._avg.output_tokens ?? 0 };
}

export async function estimateRun(
  roadmap: Roadmap,
  scope: PhaseScope,
  provider: LLMProvider,
  model: string,
  organizationId?: string,
): Promise<RunEstimate> {
  const nodes = scopedNodes(roadmap, scope);
  const tasks = estimatedTaskCount(nodes);

  const historical = organizationId ? await historicalAverages(organizationId, provider, model) : null;
  const perTaskInput = historical?.input ?? HEURISTIC_INPUT_TOKENS_PER_TASK;
  const perTaskOutput = historical?.output ?? HEURISTIC_OUTPUT_TOKENS_PER_TASK;

  const estimatedInputTokens = Math.round(tasks * perTaskInput);
  const estimatedOutputTokens = Math.round(tasks * perTaskOutput);

  return {
    steps: nodes.length,
    estimated_tasks: tasks,
    estimated_input_tokens: estimatedInputTokens,
    estimated_output_tokens: estimatedOutputTokens,
    estimated_cost_usd: estimateCostUsd(provider, model, estimatedInputTokens, estimatedOutputTokens),
    estimated_duration_minutes: Math.round((tasks * HEURISTIC_SECONDS_PER_TASK) / 60),
    based_on: historical ? "historical_average" : "heuristic_default",
  };
}
