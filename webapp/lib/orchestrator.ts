import crypto from "crypto";
import {
  getAgentSpecText,
  getFlowSteps,
  getPrimaryAgentsForStep,
} from "./businessFlow";
import { runProviderTurn, resolveApiKey, PROVIDER_LABELS } from "./providers";
import { loadRun, saveRun } from "./runStore";
import type { LLMProvider, RunState, StepResult } from "./types";

const MAX_RUN_STEPS = Number(process.env.MAX_RUN_STEPS || 81);
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS || 8000);
// How many immediately preceding artifacts get passed to the model in full;
// everything older is passed as a one-line snippet. Keeps per-call context
// (and cost) roughly bounded even at step 81 instead of growing unbounded.
const FULL_CONTEXT_WINDOW = 4;
const SNIPPET_LENGTH = 220;

function buildSystemPrompt(agentSpecText: string, provider: LLMProvider): string {
  return `${agentSpecText}

---

## Runtime notice (read this)

You are being invoked headlessly through the ${PROVIDER_LABELS[provider]} API
as one step in an automated, unattended pipeline that is building a real
business end to end from a single idea, autonomously, with no human
reviewing each step before the next one runs. You have NO filesystem
access, NO tools, and cannot read any other file mentioned in your spec
above (including the company/architecture/ and company/workflow/ documents
it references) - rely only on your spec above and the context given to you
in the user message. Because this run is fully autonomous, do not defer a
decision to "a human" or pause for approval even where your spec's Human
Approval Requirements section would normally require it in a
human-operated version of this organization - make the best call yourself,
state it as a clear DECISION with your reasoning and confidence, and move
the business forward. Note any real-world risk of that autonomy in your
output rather than silently absorbing it.

Respond with ONLY the requested artifact, in full, as Markdown - no
preamble, no "Here is the artifact" framing. End your response with exactly
one of these two lines, on its own line:
STATUS: OK
STATUS: BLOCKED | REASON: <one sentence>
Use BLOCKED only if you genuinely cannot produce a usable artifact at all
from the context given - not merely because information is incomplete
(state assumptions instead).`;
}

function summarize(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_LENGTH
    ? oneLine.slice(0, SNIPPET_LENGTH) + "…"
    : oneLine;
}

function buildUserMessage(
  idea: string,
  step: ReturnType<typeof getFlowSteps>[number],
  priorSteps: StepResult[],
): string {
  const done = priorSteps.filter((s) => s.status === "done" && s.content);
  const recent = done.slice(-FULL_CONTEXT_WINDOW);
  const older = done.slice(0, Math.max(0, done.length - FULL_CONTEXT_WINDOW));

  const olderBlock = older.length
    ? older
        .map(
          (s) =>
            `- Step ${s.flow_step} (${s.activity}) by ${s.agent_name} -> "${s.output_artifact}": ${summarize(s.content ?? "")}`,
        )
        .join("\n")
    : "(none yet)";

  const recentBlock = recent.length
    ? recent
        .map(
          (s) =>
            `#### Step ${s.flow_step} - ${s.activity} (by ${s.agent_name}) - Artifact: "${s.output_artifact}"\n\n${s.content}`,
        )
        .join("\n\n---\n\n")
    : "(none yet - this is the first step)";

  return `BUSINESS IDEA (as originally submitted):
${idea}

You are executing End-to-End Business Flow step ${step.flow_step} - "${step.activity}" (Business Phase: ${step.business_phase}).

Primary role per the org design: ${step.primary_role}
Supporting/reviewing roles for context (not separately invoked in this run): ${step.supporting_roles}

Task: ${step.what_the_role_does}
Inputs this step normally draws on: ${step.inputs}
Expected output artifact: "${step.output_artifact}"
Done/gate criteria: ${step.done_gate_criteria}

EARLIER ARTIFACTS (summarized):
${olderBlock}

MOST RECENT ARTIFACTS (full text):
${recentBlock}

Produce the "${step.output_artifact}" artifact now.`;
}

function initRun(
  id: string,
  idea: string,
  provider: LLMProvider,
  model: string,
  keySource: "user_provided" | "server_env",
): RunState {
  const flowSteps = getFlowSteps().slice(0, MAX_RUN_STEPS);
  const steps: StepResult[] = flowSteps.map((s) => {
    const primaryAgents = getPrimaryAgentsForStep(s.flow_step);
    const agent = primaryAgents[0];
    return {
      flow_step: s.flow_step,
      business_phase: s.business_phase,
      activity: s.activity,
      agent_id: agent?.id ?? "UNKNOWN",
      agent_name: agent?.name ?? s.primary_role,
      output_artifact: s.output_artifact,
      status: "pending",
      content: null,
      reason: null,
      started_at: null,
      finished_at: null,
      input_tokens: null,
      output_tokens: null,
    };
  });

  const now = new Date().toISOString();
  return {
    id,
    idea,
    status: "running",
    created_at: now,
    updated_at: now,
    current_step_index: 0,
    total_steps: steps.length,
    steps,
    error: null,
    provider,
    model,
    key_source: keySource,
  };
}

async function executeRun(
  id: string,
  provider: LLMProvider,
  model: string,
  apiKey: string,
): Promise<void> {
  const flowSteps = getFlowSteps();

  for (let i = 0; i < MAX_RUN_STEPS; i++) {
    const run = loadRun(id);
    if (!run) return; // deleted mid-run; nothing to do
    if (run.status !== "running") return;

    const stepDef = flowSteps[i];
    const stepResult = run.steps[i];
    run.current_step_index = i;
    stepResult.status = "running";
    stepResult.started_at = new Date().toISOString();
    run.updated_at = stepResult.started_at;
    saveRun(run);

    try {
      const specText = getAgentSpecText(stepResult.agent_id);
      const system = buildSystemPrompt(specText, provider);
      const user = buildUserMessage(run.idea, stepDef, run.steps.slice(0, i));

      const result = await runProviderTurn(provider, {
        apiKey,
        model,
        systemPrompt: system,
        userMessage: user,
        maxTokens: MAX_TOKENS,
      });

      const statusMatch = result.text.match(
        /STATUS:\s*(OK|BLOCKED)\s*(?:\|\s*REASON:\s*(.*))?\s*$/i,
      );
      const blocked = statusMatch?.[1]?.toUpperCase() === "BLOCKED";
      const content = statusMatch
        ? result.text.slice(0, statusMatch.index).trim()
        : result.text.trim();

      stepResult.content = content;
      stepResult.input_tokens = result.inputTokens;
      stepResult.output_tokens = result.outputTokens;
      stepResult.finished_at = new Date().toISOString();

      if (blocked) {
        stepResult.status = "blocked";
        stepResult.reason = statusMatch?.[2]?.trim() || "Agent reported it could not proceed.";
        run.status = "failed";
        run.error = `Blocked at step ${stepResult.flow_step} (${stepResult.activity}): ${stepResult.reason}`;
        run.updated_at = stepResult.finished_at;
        saveRun(run);
        return;
      }

      stepResult.status = "done";
      run.updated_at = stepResult.finished_at;
      saveRun(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stepResult.status = "error";
      stepResult.reason = message;
      stepResult.finished_at = new Date().toISOString();
      run.status = "failed";
      run.error = `Error at step ${stepResult.flow_step} (${stepResult.activity}): ${message}`;
      run.updated_at = stepResult.finished_at;
      saveRun(run);
      return;
    }
  }

  const finalRun = loadRun(id);
  if (finalRun && finalRun.status === "running") {
    finalRun.status = "completed";
    finalRun.updated_at = new Date().toISOString();
    saveRun(finalRun);
  }
}

/**
 * Starts a new autonomous business-build run and returns its id
 * immediately. Execution continues in the background (fire-and-forget);
 * poll GET /api/runs/[id] for progress. Errors during execution are
 * captured onto the run record rather than thrown here, since the caller
 * has already returned by the time they can occur.
 *
 * The resolved API key is held only in this function's closure and passed
 * directly into each provider call - it is never written into the RunState
 * that gets persisted to runs/<id>.json, so it never touches disk or the
 * GET /api/runs/[id] response.
 */
export function startRun(
  idea: string,
  provider: LLMProvider,
  model: string,
  suppliedApiKey: string | undefined,
): string {
  const { apiKey, source } = resolveApiKey(provider, suppliedApiKey);

  const id = crypto.randomUUID();
  const run = initRun(id, idea, provider, model, source);
  saveRun(run);

  executeRun(id, provider, model, apiKey).catch((err) => {
    const run2 = loadRun(id);
    if (run2) {
      run2.status = "failed";
      run2.error =
        "Unexpected orchestrator error: " +
        (err instanceof Error ? err.message : String(err));
      run2.updated_at = new Date().toISOString();
      saveRun(run2);
    }
  });

  return id;
}
