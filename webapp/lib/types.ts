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
export type TaskRole = "creator" | "critic" | "approver" | "executor";

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
  // Set only on creator/revision tasks (parsed from the trailing artifact-meta
  // block) - null for critic/approver/executor tasks.
  meta: ArtifactMeta | null;
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

export type RunStatus = "running" | "completed" | "failed" | "stopped_no_go" | "held";

export type LLMProvider = "anthropic" | "groq" | "openrouter" | "gemini";

// One entry per gate evaluation - the run's actual execution path, since steps can
// now repeat or jump backward instead of always running 1..N once each.
export interface PathEntry {
  flow_step: string;
  attempt: number;
  decision: GateAction;
  reason: string | null;
  at: string;
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
  // Total step-executions (creator attempts) across the whole run, regardless
  // of which flow step - a hard ceiling independent of the per-step/per-target
  // bounds above, so no combination of retries/jumps can hang the run.
  total_executions: number;
}
