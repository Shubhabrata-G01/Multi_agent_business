import crypto from "crypto";
import {
  ARTIFACT_META_INSTRUCTIONS,
  defaultArtifactMeta,
  parseArtifactMeta,
} from "./artifactMeta";
import { recordGateDecision, saveArtifactVersion } from "./artifactStore";
import {
  getAgentById,
  getAgentSpecText,
  getFlowSteps,
  getNextStepDef,
  getPrimaryAgentsForStep,
  getSupportingAgentsForStep,
  isEvidenceLedPhase,
  isGateStep,
  parseReturnToStep,
} from "./businessFlow";
import { runProviderTurn, resolveApiKey, PROVIDER_LABELS } from "./providers";
import { loadRun, saveRun } from "./runStore";
import type {
  ArtifactMeta,
  FlowStepDef,
  GateAction,
  LLMProvider,
  RegistryAgent,
  RunState,
  StepResult,
  StepTask,
  TaskRole,
  TaskVerdict,
} from "./types";

const MAX_RUN_STEPS = Number(process.env.MAX_RUN_STEPS || 81);
// Per-role token budgets. Creator calls regenerate a full artifact; Critic/
// Approver calls only review one and render a verdict; Executor calls render
// a short handoff directive - none of those three need anywhere near the
// Creator's budget, which keeps the added calls cheap in tokens even though
// they add materially to call count.
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS || 8000);
const CRITIC_MAX_TOKENS = Number(process.env.LLM_CRITIC_MAX_TOKENS || 2000);
const APPROVER_MAX_TOKENS = Number(process.env.LLM_APPROVER_MAX_TOKENS || 1500);
const EXECUTOR_MAX_TOKENS = Number(process.env.LLM_EXECUTOR_MAX_TOKENS || 800);
// Caps how many supporting agents get invoked as Critics on a single step.
// registry.json's flow_supporting_steps reverse-mapping tops out at 6 agents
// for any one step today; this is an easy dial to trade coverage for cost if
// that changes.
const MAX_CRITICS_PER_STEP = Number(process.env.MAX_CRITICS_PER_STEP || 6);
// How many immediately preceding artifacts get passed to the model in full;
// everything older is passed as a one-line snippet. Keeps per-call context
// (and cost) roughly bounded even as steps repeat instead of growing unbounded.
const FULL_CONTEXT_WINDOW = 4;
const SNIPPET_LENGTH = 220;

// Bounded-loop parameters for the state machine (see evaluateGate below). Each
// is independently bounded, and MAX_TOTAL_STEP_EXECUTIONS is a hard ceiling on
// top of both so no combination of retries/jumps can hang a run.
const MAX_RETRIES_PER_STEP = Number(process.env.MAX_RETRIES_PER_STEP || 2);
const MAX_JUMPS_PER_TARGET = Number(process.env.MAX_JUMPS_PER_TARGET || 1);
const MAX_TOTAL_STEP_EXECUTIONS = Number(process.env.MAX_TOTAL_STEP_EXECUTIONS || 200);

function runtimeNotice(provider: LLMProvider, roleInstructions: string): string {
  return `---

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

${roleInstructions}`;
}

function buildSystemPrompt(agentSpecText: string, provider: LLMProvider): string {
  return `${agentSpecText}

${runtimeNotice(
  provider,
  `Respond with the requested artifact, in full, as Markdown - no preamble, no
"Here is the artifact" framing.

${ARTIFACT_META_INSTRUCTIONS}`,
)}`;
}

function buildCriticSystemPrompt(agentSpecText: string, provider: LLMProvider): string {
  return `${agentSpecText}

${runtimeNotice(
  provider,
  `You are acting as REVIEWER/CRITIC on another agent's artifact, not as its
creator - per company/architecture/08-four-eyes-and-critic-mode.md, a
review is not a rubber stamp. Evaluate the artifact against whichever of
these apply to its type: correctness, completeness (edge cases/failure
states/exclusions), assumptions (stated and still valid?), evidence (cited
or asserted?), risks, cost, security, scalability, business alignment,
user value, compliance, maintainability. If you find nothing wrong, state
explicitly which of these you checked and why each passed - not just
"looks good." You do not fix the artifact yourself, only review it.

Respond with your findings as Markdown, then end with exactly one of these
two lines, on its own line:
VERDICT: APPROVED
VERDICT: CHANGES_REQUESTED | REASON: <one sentence>
Use CHANGES_REQUESTED only for a real, specific, checkable problem - not
stylistic preference.`,
)}`;
}

function buildApproverSystemPrompt(agentSpecText: string, provider: LLMProvider): string {
  return `${agentSpecText}

${runtimeNotice(
  provider,
  `You are acting as APPROVER on a Level-2+ decision artifact produced by
someone who reports to you - per
company/architecture/05-permissions-and-hitl.md, the creator fully prepared
this and stops at the gate; you decide whether it's authorized to proceed.
You are not re-doing the work, only judging whether it's sound enough to
authorize: are the stated assumptions and risks acceptable, is the
recommendation consistent with company strategy/budget/policy as you
understand it, is anything materially missing.

Respond with your reasoning as Markdown, then end with exactly one of these
two lines, on its own line:
APPROVAL: APPROVED
APPROVAL: REJECTED | REASON: <one sentence>`,
)}`;
}

function buildExecutorSystemPrompt(agentSpecText: string, provider: LLMProvider): string {
  return `${agentSpecText}

${runtimeNotice(
  provider,
  `You are acting as EXECUTOR: an approved decision is being handed to you
to act on, per the structured handoff shape in
company/architecture/02-communication-protocol.md. Do not restate or
regenerate the artifact you were handed. Produce a short Execution
Directive (a few sentences, not a full document) naming: what you are
doing with this now, the specific next action and its owner, and the
acceptance criteria that will tell the sender this handoff is complete.

Respond with the Execution Directive as Markdown, then end with exactly one
of these two lines, on its own line:
STATUS: OK
STATUS: BLOCKED | REASON: <one sentence>`,
)}`;
}

function summarize(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_LENGTH
    ? oneLine.slice(0, SNIPPET_LENGTH) + "…"
    : oneLine;
}

function renderPriorArtifacts(idea: string, priorSteps: StepResult[]): string {
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

EARLIER ARTIFACTS (summarized):
${olderBlock}

MOST RECENT ARTIFACTS (full text):
${recentBlock}`;
}

function buildUserMessage(
  idea: string,
  step: FlowStepDef,
  priorSteps: StepResult[],
  criticAgents: RegistryAgent[],
): string {
  const criticLine = criticAgents.length
    ? `Supporting/reviewing roles for context: ${step.supporting_roles} - after you
produce this artifact, ${criticAgents.map((a) => a.name).join(", ")} will
independently review it this run and may send it back with findings.`
    : `Supporting/reviewing roles for context: ${step.supporting_roles} (none of
them are registered as a reviewer for this specific step in this run).`;

  return `${renderPriorArtifacts(idea, priorSteps)}

You are executing End-to-End Business Flow step ${step.flow_step} - "${step.activity}" (Business Phase: ${step.business_phase}).

Primary role per the org design: ${step.primary_role}
${criticLine}

Task: ${step.what_the_role_does}
Inputs this step normally draws on: ${step.inputs}
Expected output artifact: "${step.output_artifact}"
Done/gate criteria: ${step.done_gate_criteria}

Produce the "${step.output_artifact}" artifact now.`;
}

interface Finding {
  agent_name: string;
  role: TaskRole;
  content: string | null;
  reason: string | null;
}

function renderFindings(findings: Finding[]): string {
  return findings
    .map(
      (f) =>
        `### ${f.agent_name} (${f.role}) - requested changes\n${f.reason ? `Reason: ${f.reason}\n\n` : ""}${f.content ?? "(no detail given)"}`,
    )
    .join("\n\n---\n\n");
}

function buildRevisionUserMessage(
  step: FlowStepDef,
  originalContent: string,
  findings: Finding[],
): string {
  return `You previously produced this "${step.output_artifact}" artifact for step
${step.flow_step} - "${step.activity}":

---

${originalContent}

---

One or more reviewers sent it back with findings. You get exactly one
revision pass - incorporate what's correct, or explicitly explain in the
revised artifact why you're keeping something as-is if you disagree. This
is your only chance to revise before the step proceeds either way.

${renderFindings(findings)}

Produce the complete, revised "${step.output_artifact}" artifact now (the
full artifact, not a diff).`;
}

/**
 * Used for a retry_step gate decision (see evaluateGate): unlike a revision,
 * this is a genuinely fresh attempt at the whole step, not a patch of the
 * prior text - company/architecture/09-quality-and-confidence-standards.md's
 * point is that low evidence quality gets *better evidence*, not more
 * confident wording of the same guess.
 */
function buildRetryUserMessage(
  idea: string,
  step: FlowStepDef,
  priorSteps: StepResult[],
  criticAgents: RegistryAgent[],
  attemptNumber: number,
  priorAttemptReason: string,
): string {
  return `${buildUserMessage(idea, step, priorSteps, criticAgents)}

---

This is attempt ${attemptNumber} at this step. The previous attempt was sent
back: ${priorAttemptReason}

This phase (${step.business_phase}) is treated as evidence-led, not
artifact-led - do not just restate the prior attempt with more confident
language. Either bring genuinely stronger evidence/reasoning, or honestly
report lower confidence/evidence_quality if the underlying uncertainty is
real; a low-confidence artifact that says so plainly is more useful than a
falsely confident one. Produce a fresh "${step.output_artifact}" now.`;
}

function buildCriticUserMessage(step: FlowStepDef, artifact: string): string {
  return `Step ${step.flow_step} - "${step.activity}" (${step.business_phase}).
Done/gate criteria for this artifact: ${step.done_gate_criteria}

The artifact under review, "${step.output_artifact}":

---

${artifact}`;
}

function buildApproverUserMessage(step: FlowStepDef, artifact: string): string {
  return `Step ${step.flow_step} - "${step.activity}" (${step.business_phase}) is a
Level-2+ decision gate. Done/gate criteria: ${step.done_gate_criteria}

The prepared "${step.output_artifact}" awaiting your approval:

---

${artifact}`;
}

function buildExecutorUserMessage(
  step: FlowStepDef,
  nextStep: FlowStepDef,
  artifact: string,
): string {
  return `Step ${step.flow_step} - "${step.activity}" was just approved. Its
"${step.output_artifact}" artifact is below. Per the business flow, this
hands off into step ${nextStep.flow_step} - "${nextStep.activity}", which
you own.

---

${artifact}`;
}

interface ParsedLabel {
  value: string | undefined;
  content: string;
  reason: string | null;
}

function parseLabeledResponse(text: string, label: string, values: string[]): ParsedLabel {
  const re = new RegExp(
    `${label}:\\s*(${values.join("|")})\\s*(?:\\|\\s*REASON:\\s*(.*))?\\s*$`,
    "i",
  );
  const match = text.match(re);
  return {
    value: match?.[1]?.toUpperCase(),
    content: match ? text.slice(0, match.index).trim() : text.trim(),
    reason: match?.[2]?.trim() || null,
  };
}

function newTask(role: TaskRole, agent: RegistryAgent): StepTask {
  return {
    role,
    agent_id: agent.id,
    agent_name: agent.name,
    status: "running",
    content: null,
    verdict: null,
    reason: null,
    started_at: new Date().toISOString(),
    finished_at: null,
    input_tokens: null,
    output_tokens: null,
    meta: null,
  };
}

interface RunTaskLabel {
  label: "STATUS" | "VERDICT" | "APPROVAL" | "ARTIFACT_META";
  values?: string[];
  verdictMap?: Record<string, TaskVerdict>;
}

/**
 * Runs one LLM call for a single Creator/Critic/Approver/Executor task,
 * pushes the task onto the step's tasks[] (as "running" immediately, so
 * polling clients see it start), then fills it in and saves again once the
 * call resolves. Provider errors propagate to the caller, which decides
 * whether that's fatal to the run. Creator/revision calls (label
 * "ARTIFACT_META") are parsed via the structured evidence schema instead of
 * the simple label-line parser the other three roles use.
 */
async function runTask(
  run: RunState,
  stepIndex: number,
  role: TaskRole,
  agent: RegistryAgent,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  provider: LLMProvider,
  model: string,
  apiKey: string,
  labelConfig: RunTaskLabel,
): Promise<StepTask> {
  const task = newTask(role, agent);
  run.steps[stepIndex].tasks.push(task);
  saveRun(run);

  try {
    const result = await runProviderTurn(provider, {
      apiKey,
      model,
      systemPrompt,
      userMessage,
      maxTokens,
    });

    task.input_tokens = result.inputTokens;
    task.output_tokens = result.outputTokens;
    task.finished_at = new Date().toISOString();

    if (labelConfig.label === "ARTIFACT_META") {
      const { content, meta } = parseArtifactMeta(result.text);
      task.content = content;
      task.meta = meta;
      task.reason = meta.reason;
      task.status = meta.status === "blocked" ? "blocked" : "done";
    } else {
      const { value, content, reason } = parseLabeledResponse(
        result.text,
        labelConfig.label,
        labelConfig.values ?? [],
      );
      task.content = content;
      task.reason = reason;

      if (labelConfig.label === "STATUS") {
        task.status = value === "BLOCKED" ? "blocked" : "done";
      } else {
        const verdict = value ? labelConfig.verdictMap?.[value] ?? null : "approved";
        task.verdict = verdict;
        task.status = "done";
      }
    }
  } catch (err) {
    task.status = "error";
    task.reason = err instanceof Error ? err.message : String(err);
    task.finished_at = new Date().toISOString();
    saveRun(run);
    throw new Error(`${role} task (${agent.id}) failed: ${task.reason}`);
  }

  saveRun(run);
  return task;
}

interface GateResult {
  action: GateAction;
  target?: string; // only set for return_to_step
  reason: string | null;
}

/**
 * Decides what happens after a step's Creator(+Critic+Approver) has produced
 * its final content for this attempt. This is the state-machine core: most
 * steps (the ~70 that are neither an evidence-led phase nor a gate) keep
 * exactly the previous pass's behavior (one bounded revision, then advance
 * regardless) - the new retry/rework/no-go/hold paths only activate for
 * discovery/validation/QA/PMF phases and the explicit Go/No-Go-style gate
 * steps, matching what the business flow's own loop_reentry_condition text
 * actually asks for.
 */
function evaluateGate(
  step: FlowStepDef,
  meta: ArtifactMeta,
  criticTasks: StepTask[],
  approverTask: StepTask | null,
  stepAttempts: Record<string, number>,
  jumpCounts: Record<string, number>,
): GateResult {
  const priorAttempts = stepAttempts[step.flow_step] ?? 0;
  const evidenceLed = isEvidenceLedPhase(step.business_phase);
  const gate = isGateStep(step);
  const reviewStillFailing =
    criticTasks.some((t) => t.verdict === "changes_requested") ||
    approverTask?.verdict === "rejected";

  if (gate && meta.decision === "no_go") {
    return {
      action: "no_go_exit",
      reason: meta.reason ?? "Creator recorded a No-Go decision.",
    };
  }

  if (reviewStillFailing && evidenceLed && priorAttempts < MAX_RETRIES_PER_STEP) {
    return {
      action: "retry_step",
      reason: `Reviewer(s) still not satisfied after revision on an evidence-led phase (${step.business_phase}).`,
    };
  }

  if (
    evidenceLed &&
    meta.confidence === "low" &&
    meta.evidence_quality === "low" &&
    priorAttempts < MAX_RETRIES_PER_STEP
  ) {
    return {
      action: "retry_step",
      reason: "Creator self-reported low confidence and low evidence quality on an evidence-led phase.",
    };
  }

  if (reviewStillFailing) {
    const target = parseReturnToStep(step.loop_reentry_condition);
    if (target && (jumpCounts[target] ?? 0) < MAX_JUMPS_PER_TARGET) {
      return {
        action: "return_to_step",
        target,
        reason: `Loop re-entry condition: "${step.loop_reentry_condition}"`,
      };
    }
  }

  if (reviewStillFailing && (evidenceLed || gate)) {
    return {
      action: "held",
      reason: "Retry/rework bounds exhausted with reviewer(s) still not satisfied.",
    };
  }

  return { action: "advance", reason: null };
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
      tasks: [],
      is_gate: isGateStep(s),
      attempt: 0,
      meta: null,
      gate_decision: null,
      gate_reason: null,
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
    step_attempts: {},
    jump_counts: {},
    path: [],
    total_executions: 0,
  };
}

/**
 * Walks the business flow as a graph rather than a fixed 1..N list: a
 * program counter (run.current_step_index) that evaluateGate can advance,
 * hold in place (retry_step), or move backward (return_to_step), always
 * reading/writing through the persisted RunState so a paused ("held") run
 * can be resumed later from exactly where it left off (see resumeRun).
 */
async function executeRun(
  id: string,
  provider: LLMProvider,
  model: string,
  apiKey: string,
): Promise<void> {
  const flowSteps = getFlowSteps().slice(0, MAX_RUN_STEPS);
  const flowIndexByStep = new Map(flowSteps.map((s, idx) => [s.flow_step, idx]));

  for (;;) {
    const run = loadRun(id);
    if (!run) return; // deleted mid-run; nothing to do
    if (run.status !== "running") return;
    if (run.current_step_index >= flowSteps.length) break;

    if (run.total_executions >= MAX_TOTAL_STEP_EXECUTIONS) {
      run.status = "held";
      run.error = null;
      run.updated_at = new Date().toISOString();
      saveRun(run);
      return;
    }

    const pc = run.current_step_index;
    const stepDef = flowSteps[pc];
    const stepResult = run.steps[pc];
    const priorAttempts = run.step_attempts[stepDef.flow_step] ?? 0;
    const attemptNumber = priorAttempts + 1;

    run.total_executions += 1;
    stepResult.attempt = attemptNumber;
    stepResult.status = "running";
    stepResult.tasks = [];
    stepResult.meta = null;
    stepResult.gate_decision = null;
    stepResult.gate_reason = null;
    stepResult.started_at = new Date().toISOString();
    run.updated_at = stepResult.started_at;
    saveRun(run);

    try {
      const creatorAgent = getAgentById(stepResult.agent_id);
      if (!creatorAgent) {
        throw new Error(`Unknown creator agent id: ${stepResult.agent_id}`);
      }
      const criticAgents = getSupportingAgentsForStep(stepDef.flow_step).slice(
        0,
        MAX_CRITICS_PER_STEP,
      );
      const gate = stepResult.is_gate;
      const creatorSpec = getAgentSpecText(creatorAgent.id);
      const creatorSystem = buildSystemPrompt(creatorSpec, provider);

      // 1. CREATOR
      const priorPathEntry = [...run.path].reverse().find(
        (p) => p.flow_step === stepDef.flow_step,
      );
      const creatorUser =
        attemptNumber > 1
          ? buildRetryUserMessage(
              run.idea,
              stepDef,
              run.steps.slice(0, pc),
              criticAgents,
              attemptNumber,
              priorPathEntry?.reason ?? "Reviewer(s) requested changes.",
            )
          : buildUserMessage(run.idea, stepDef, run.steps.slice(0, pc), criticAgents);

      const creatorTask = await runTask(
        run,
        pc,
        "creator",
        creatorAgent,
        creatorSystem,
        creatorUser,
        MAX_TOKENS,
        provider,
        model,
        apiKey,
        { label: "ARTIFACT_META" },
      );

      if (creatorTask.status === "blocked") {
        stepResult.status = "blocked";
        stepResult.reason = creatorTask.reason || "Agent reported it could not proceed.";
        stepResult.finished_at = new Date().toISOString();
        run.status = "failed";
        run.error = `Blocked at step ${stepResult.flow_step} (${stepResult.activity}): ${stepResult.reason}`;
        run.updated_at = stepResult.finished_at;
        saveRun(run);
        return;
      }

      let workingContent = creatorTask.content ?? "";
      let creatorMeta: ArtifactMeta =
        creatorTask.meta ?? defaultArtifactMeta("Creator task completed without a parsed meta block.");

      // 2. CRITICS (parallel)
      let criticTasks: StepTask[] = [];
      if (criticAgents.length > 0) {
        criticTasks = await Promise.all(
          criticAgents.map((critic) =>
            runTask(
              run,
              pc,
              "critic",
              critic,
              buildCriticSystemPrompt(getAgentSpecText(critic.id), provider),
              buildCriticUserMessage(stepDef, workingContent),
              CRITIC_MAX_TOKENS,
              provider,
              model,
              apiKey,
              {
                label: "VERDICT",
                values: ["APPROVED", "CHANGES_REQUESTED"],
                verdictMap: { APPROVED: "approved", CHANGES_REQUESTED: "changes_requested" },
              },
            ),
          ),
        );

        const requestedChanges = criticTasks.filter((t) => t.verdict === "changes_requested");
        if (requestedChanges.length > 0) {
          const findings: Finding[] = requestedChanges.map((t) => ({
            agent_name: t.agent_name,
            role: t.role,
            content: t.content,
            reason: t.reason,
          }));
          const revisionTask = await runTask(
            run,
            pc,
            "creator",
            creatorAgent,
            creatorSystem,
            buildRevisionUserMessage(stepDef, workingContent, findings),
            MAX_TOKENS,
            provider,
            model,
            apiKey,
            { label: "ARTIFACT_META" },
          );
          if (revisionTask.status === "done" && revisionTask.content) {
            workingContent = revisionTask.content;
            creatorMeta = revisionTask.meta ?? creatorMeta;
          }
          // A blocked/failed revision falls back to the pre-revision
          // artifact rather than aborting the run - one review round not
          // landing shouldn't take down a whole run; evaluateGate below
          // still sees the unresolved critic verdicts either way.
        }
      }

      // 3. APPROVER (gate steps only, when the creator has a resolvable manager)
      let approverTask: StepTask | null = null;
      if (gate) {
        const approverAgent = creatorAgent.reports_to
          ? getAgentById(creatorAgent.reports_to)
          : undefined;
        if (approverAgent) {
          approverTask = await runTask(
            run,
            pc,
            "approver",
            approverAgent,
            buildApproverSystemPrompt(getAgentSpecText(approverAgent.id), provider),
            buildApproverUserMessage(stepDef, workingContent),
            APPROVER_MAX_TOKENS,
            provider,
            model,
            apiKey,
            {
              label: "APPROVAL",
              values: ["APPROVED", "REJECTED"],
              verdictMap: { APPROVED: "approved", REJECTED: "rejected" },
            },
          );

          if (approverTask.verdict === "rejected") {
            const revisionTask = await runTask(
              run,
              pc,
              "creator",
              creatorAgent,
              creatorSystem,
              buildRevisionUserMessage(stepDef, workingContent, [
                {
                  agent_name: approverTask.agent_name,
                  role: "approver",
                  content: approverTask.content,
                  reason: approverTask.reason,
                },
              ]),
              MAX_TOKENS,
              provider,
              model,
              apiKey,
              { label: "ARTIFACT_META" },
            );
            if (revisionTask.status === "done" && revisionTask.content) {
              workingContent = revisionTask.content;
              creatorMeta = revisionTask.meta ?? creatorMeta;
            }
          }
        }

        // 4. EXECUTOR (gate steps only, when a next step exists)
        const nextStepDef = getNextStepDef(stepDef.flow_step);
        if (nextStepDef) {
          const executorAgent = getPrimaryAgentsForStep(nextStepDef.flow_step)[0];
          if (executorAgent) {
            await runTask(
              run,
              pc,
              "executor",
              executorAgent,
              buildExecutorSystemPrompt(getAgentSpecText(executorAgent.id), provider),
              buildExecutorUserMessage(stepDef, nextStepDef, workingContent),
              EXECUTOR_MAX_TOKENS,
              provider,
              model,
              apiKey,
              { label: "STATUS", values: ["OK", "BLOCKED"] },
            );
            // Non-fatal either way: the Execution Directive supplements the
            // step's artifact, it doesn't replace it.
          }
        }
      }

      stepResult.content = workingContent;
      stepResult.meta = creatorMeta;
      stepResult.input_tokens = stepResult.tasks.reduce(
        (sum, t) => sum + (t.input_tokens ?? 0),
        0,
      );
      stepResult.output_tokens = stepResult.tasks.reduce(
        (sum, t) => sum + (t.output_tokens ?? 0),
        0,
      );
      stepResult.status = "done";
      stepResult.finished_at = new Date().toISOString();

      saveArtifactVersion({
        run_id: id,
        flow_step: stepDef.flow_step,
        output_artifact: stepDef.output_artifact,
        attempt: attemptNumber,
        agent_id: creatorAgent.id,
        agent_name: creatorAgent.name,
        content: workingContent,
        meta: creatorMeta,
        model,
        provider,
        created_at: stepResult.finished_at,
        gate_decision: null,
        gate_reason: null,
      });

      const gateResult = evaluateGate(
        stepDef,
        creatorMeta,
        criticTasks,
        approverTask,
        run.step_attempts,
        run.jump_counts,
      );
      stepResult.gate_decision = gateResult.action;
      stepResult.gate_reason = gateResult.reason;
      recordGateDecision(id, stepDef.flow_step, attemptNumber, gateResult.action, gateResult.reason);

      run.path.push({
        flow_step: stepDef.flow_step,
        attempt: attemptNumber,
        decision: gateResult.action,
        reason: gateResult.reason,
        at: stepResult.finished_at,
      });
      run.updated_at = stepResult.finished_at;

      switch (gateResult.action) {
        case "no_go_exit":
          run.status = "stopped_no_go";
          saveRun(run);
          return;
        case "held":
          run.status = "held";
          saveRun(run);
          return;
        case "retry_step":
          run.step_attempts[stepDef.flow_step] = priorAttempts + 1;
          saveRun(run);
          continue;
        case "return_to_step": {
          const target = gateResult.target as string;
          run.jump_counts[target] = (run.jump_counts[target] ?? 0) + 1;
          run.current_step_index = flowIndexByStep.get(target) ?? pc;
          saveRun(run);
          continue;
        }
        case "advance":
        default:
          run.current_step_index = pc + 1;
          saveRun(run);
          continue;
      }
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

/**
 * Resumes a "held" run from exactly the step it paused at
 * (run.current_step_index, run.step_attempts, run.jump_counts, and
 * run.total_executions are all read back from disk by executeRun). Since the
 * API key is never persisted, resuming needs one supplied again (or falls
 * back to the server env var, same as a fresh run).
 */
export function resumeRun(id: string, suppliedApiKey: string | undefined): void {
  const run = loadRun(id);
  if (!run) {
    throw new Error("Run not found");
  }
  if (run.status !== "held") {
    throw new Error(`Run is not held (current status: ${run.status})`);
  }

  const { apiKey, source } = resolveApiKey(run.provider, suppliedApiKey);
  run.status = "running";
  run.key_source = source;
  run.error = null;
  run.updated_at = new Date().toISOString();
  saveRun(run);

  executeRun(id, run.provider, run.model, apiKey).catch((err) => {
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
}
