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
}

export interface StepResult {
  flow_step: string;
  business_phase: string;
  activity: string;
  agent_id: string; // the Creator's agent id
  agent_name: string; // the Creator's agent name
  output_artifact: string;
  status: StepStatus; // overall step status
  content: string | null; // final accepted artifact text (post-revision), markdown
  reason: string | null; // populated when status is blocked/error
  started_at: string | null;
  finished_at: string | null;
  input_tokens: number | null; // summed across every task this step ran
  output_tokens: number | null;
  tasks: StepTask[]; // full creator/critic/approver/executor breakdown, in order
  is_gate: boolean; // whether this step ran the Approver/Executor phase
}

export type RunStatus = "running" | "completed" | "failed";

export type LLMProvider = "anthropic" | "groq" | "openrouter" | "gemini";

export interface RunState {
  id: string;
  idea: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  current_step_index: number; // 0-based index into steps[]
  total_steps: number;
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
}
