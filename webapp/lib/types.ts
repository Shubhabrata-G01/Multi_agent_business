export interface RegistryAgent {
  id: string;
  name: string;
  aliases: string[];
  team: string;
  reports_to: string;
  can_delegate_to: string[];
  directly_supports_raw: string[];
  flow_primary_steps: string[];
  flow_supporting_steps: string[];
  file: string; // e.g. "/company/agents/executive/CEO-001.md"
}

export interface FlowStepDef {
  flow_step: string;
  business_phase: string;
  activity: string;
  primary_role: string;
  supporting_roles: string;
  inputs: string;
  what_the_role_does: string;
  output_artifact: string;
  passed_to: string;
  done_gate_criteria: string;
  loop_reentry_condition: string;
}

export type StepStatus = "pending" | "running" | "done" | "blocked" | "error";

// The four separated functions from
// company/architecture/08-four-eyes-and-critic-mode.md: the same agent may hold more
// than one of these across different steps, but a single step never lets one agent
// play more than one role on its own artifact.
// "contributor" is a specialist agent that authors its own labeled sub-artifact
// on a step (see STEP_CONTRIBUTORS in orchestrator.ts) - distinct from "critic",
// which only reviews another agent's work and never creates its own.
export type TaskRole = "creator" | "critic" | "approver" | "executor" | "contributor";

// Only set on critic/approver tasks - null for creator/executor, which don't render a
// verdict.
export type TaskVerdict = "approved" | "changes_requested" | "rejected" | null;

export interface StepTask {
  role: TaskRole;
  agent_id: string;
  agent_name: string;
  status: StepStatus;
  content: string | null; // artifact text, review findings, or execution directive
  verdict: TaskVerdict;
  reason: string | null; // populated when status is blocked/error
  started_at: string | null;
  finished_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  // Set only on creator/revision/contributor tasks (parsed from the trailing
  // artifact-meta block) - null for critic/approver/executor tasks.
  meta: ArtifactMeta | null;
  // The model that actually produced this task's response - roles can be
  // routed to a different model than the run's primary one (see
  // ECONOMY_MODEL_OVERRIDE in orchestrator.ts), so this is per-task, not just
  // read off RunState.model.
  model: string;
}

// company/architecture/09-quality-and-confidence-standards.md's claim taxonomy.
export type ClaimType =
  | "fact"
  | "assumption"
  | "estimate"
  | "inference"
  | "recommendation"
  | "decision";

export interface Claim {
  type: ClaimType;
  text: string;
  source: string | null;
}

// Structured evidence block every Creator/revision response must end with (see
// webapp/lib/artifactMeta.ts) - replaces the old free-text "STATUS: OK" line for
// creator calls specifically.
export interface ArtifactMeta {
  status: "ok" | "blocked";
  confidence: "high" | "medium" | "low";
  evidence_quality: "high" | "medium" | "low";
  decision: "go" | "no_go" | "conditional" | null; // only meaningful on gate steps
  claims: Claim[];
  open_questions: string[];
  reason: string | null; // set when status is "blocked"
  // Filled in by validateArtifactMeta() (webapp/lib/artifactMeta.ts) - what a
  // deterministic post-check changed and why (e.g. downgrading an unsourced
  // FACT claim to ASSUMPTION). Never a silent rewrite - empty if nothing was
  // changed.
  validation_notes: string[];
}

// What evaluateGate() decided after a step's Creator(+Critic+Approver) finished -
// see webapp/lib/orchestrator.ts.
export type GateAction =
  | "advance"
  | "retry_step"
  | "return_to_step"
  | "no_go_exit"
  | "held";

export interface StepResult {
  flow_step: string;
  business_phase: string;
  activity: string;
  agent_id: string; // the Creator's agent id
  agent_name: string; // the Creator's agent name
  output_artifact: string;
  status: StepStatus; // overall status of the CURRENT attempt
  content: string | null; // final accepted artifact text (post-revision), markdown
  reason: string | null; // populated when status is blocked/error
  started_at: string | null;
  finished_at: string | null;
  input_tokens: number | null; // summed across every task this attempt ran
  output_tokens: number | null;
  tasks: StepTask[]; // current attempt's creator/critic/approver/executor breakdown
  is_gate: boolean; // whether this step runs the Approver/Executor phase
  attempt: number; // 1-based; >1 means this step was retried/reworked
  meta: ArtifactMeta | null; // latest Creator attempt's structured evidence block
  gate_decision: GateAction | null; // what evaluateGate() decided for this attempt
  gate_reason: string | null;
}

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "stopped_no_go"
  | "held"
  | "cancelled";

export type LLMProvider = "anthropic" | "groq" | "openrouter" | "gemini";

// How a run treats the org's Human Approval Requirements
// (company/architecture/05-permissions-and-hitl.md). See
// company/architecture/12-business-os-evolution.md §3.1.
// - "simulation": the legacy behavior - agents self-decide even Level 2+ actions
//   and the run never pauses for a human. Produces plans/drafts only; no real
//   side effects. Reproduces exactly what every run did before this field existed.
// - "assisted": approval-gated. Agents must NOT assert a Level 2+ decision as made;
//   they prepare it and mark it PENDING_HUMAN_APPROVAL. This is the safe default
//   for new runs. (Hard runtime enforcement - pausing the run and emitting an
//   ApprovalRequest - is a later phase; in 0a the runtime notice is the control.)
export type ExecutionMode = "simulation" | "assisted";

// The kind of evidence a step's done-criteria actually require. "document" is
// always producible (a plan/spec/analysis). The others need a real capability
// the run may or may not have: a design tool, a deploy pipeline, telemetry, or
// an external system of record. See 12-business-os-evolution.md §7.1(2).
export type Medium =
  | "document"
  | "live-prototype"
  | "deployed"
  | "telemetry"
  | "external-record";

// A WorkflowNode is a strict superset of FlowStepDef (so the existing 81-step
// flow maps 1:1 into software-saas-v1 with zero data loss and the engine keeps
// reading the same fields) plus the precomputed routing/gate fields the
// orchestrator and the future compose-time integrity checks need. See
// company/architecture/12-business-os-evolution.md §3.4.
export interface WorkflowNode extends FlowStepDef {
  id: string; // stable within a roadmap, e.g. "saas.05"
  // Registry agent ids that can serve this node. In 0a/0b these are exactly the
  // existing registry primary/supporting mappings; capability-based matching
  // (Phase 1a) evolves how they're chosen, not the shape.
  required_capabilities: string[]; // Creator candidate agent ids
  reviewer_capabilities: string[]; // Critic agent ids
  risk_level: 0 | 1 | 2 | 3 | 4; // maps to 05-permissions-and-hitl.md HITL levels
  is_gate: boolean; // precomputed isGateStep()
  evidence_led: boolean; // precomputed isEvidenceLedPhase()
  depends_on: string[]; // node ids that must be done first (linear v1: the prior node)
  loop_reentry_target?: string; // flow_step from parseReturnToStep(), if any
  required_medium?: Medium; // evidence medium the done-criteria imply (§7.1(2))
}

// The composed/loaded workflow graph a single run walks. software-saas-v1 is a
// template (generated_from unset); a per-idea roadmap sets generated_from.
export interface Roadmap {
  template_id: string;
  packs: string[];
  nodes: WorkflowNode[];
}

// What a run is parameterized by, beyond provider/model/key. See §3.2.
export interface RunConfig {
  mode: ExecutionMode;
  roadmap: Roadmap;
  budget: {
    max_total_tokens: number;
    max_total_executions: number;
    max_usd?: number;
  };
  enabled_tool_scopes: string[]; // tool-registry ids this run may use; empty in simulation
}

// One entry per gate evaluation - the run's actual execution path, since steps can
// now repeat or jump backward instead of always running 1..N once each.
export interface PathEntry {
  flow_step: string;
  attempt: number;
  decision: GateAction;
  reason: string | null;
  at: string;
}

// A human-approval gate raised in assisted mode when a Level-2+ (gate) node is
// ready to proceed. The run holds until a human approves or rejects it. See
// company/architecture/12-business-os-evolution.md §3.6 and 1c.
export interface ApprovalRequest {
  id: string;
  run_id: string;
  flow_step: string;
  node_id: string;
  attempt: number; // the step attempt whose artifact this approval covers
  level: number; // the node's risk_level (2-4)
  activity: string; // human-readable step name
  output_artifact: string;
  summary: string; // why approval is needed
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_by?: string; // "founder" (the human) or an authorized approver
  decided_at?: string;
  reason?: string; // decision note (esp. on reject)
}

export interface RunState {
  id: string;
  idea: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  current_step_index: number; // index into steps[] the run is (or was, if paused) executing
  total_steps: number; // number of distinct flow steps (unaffected by retries)
  steps: StepResult[];
  error: string | null;
  provider: LLMProvider;
  model: string;
  // How this run treats human-approval gates (see ExecutionMode). Optional
  // because runs created before this field existed have no value on disk - those
  // legacy runs are treated as "simulation" (their original behavior) on resume.
  // New runs always set it, defaulting to the safer "assisted".
  mode?: ExecutionMode;
  // The per-run configuration (roadmap + budget + mode + tool scopes). Optional
  // because runs created before Phase 0b have no config on disk - those legacy
  // runs fall back to the global 81-step flow and the module-level budget
  // ceilings, i.e. exactly their original behavior. New runs always set it.
  config?: RunConfig;
  // Where the API key for this run came from - NEVER the key itself, and
  // never even a prefix of it. Lets the UI show "using your key" vs
  // "using the server's configured key" so which credential is active is
  // never a silent surprise (see the ambient-key incident this is a direct
  // response to).
  key_source: "user_provided" | "server_env";
  // Bounded-loop bookkeeping (see evaluateGate in orchestrator.ts) - how many
  // times each flow step has been retried in place, and how many times each
  // flow step has been re-entered as a return_to_step target.
  step_attempts: Record<string, number>;
  jump_counts: Record<string, number>;
  path: PathEntry[];
  // Human-approval gates raised for this run (assisted mode). Optional because
  // simulation runs and pre-1c runs have none. A run holding with a pending
  // entry here is "awaiting approval" and resumes only via approve/reject.
  approvals?: ApprovalRequest[];
  // Total step-executions (creator attempts) across the whole run, regardless
  // of which flow step - a hard ceiling independent of the per-step/per-target
  // bounds above, so no combination of retries/jumps can hang the run.
  total_executions: number;
}
