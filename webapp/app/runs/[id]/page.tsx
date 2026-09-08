"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type TaskRole = "creator" | "critic" | "approver" | "executor";
type TaskVerdict = "approved" | "changes_requested" | "rejected" | null;
type StepStatus = "pending" | "running" | "done" | "blocked" | "error";
type Confidence = "high" | "medium" | "low";
type Decision = "go" | "no_go" | "conditional" | null;
type GateAction = "advance" | "retry_step" | "return_to_step" | "no_go_exit" | "held";

interface ArtifactMeta {
  status: "ok" | "blocked";
  confidence: Confidence;
  evidence_quality: Confidence;
  decision: Decision;
  claims: { type: string; text: string; source: string | null }[];
  open_questions: string[];
  reason: string | null;
}

interface StepTask {
  role: TaskRole;
  agent_id: string;
  agent_name: string;
  status: StepStatus;
  content: string | null;
  verdict: TaskVerdict;
  reason: string | null;
}

interface StepResult {
  flow_step: string;
  business_phase: string;
  activity: string;
  agent_id: string;
  agent_name: string;
  output_artifact: string;
  status: StepStatus;
  content: string | null;
  reason: string | null;
  tasks: StepTask[];
  is_gate: boolean;
  attempt: number;
  meta: ArtifactMeta | null;
  gate_decision: GateAction | null;
  gate_reason: string | null;
}

interface ArtifactVersion {
  attempt: number;
  agent_name: string;
  content: string;
  meta: ArtifactMeta;
  created_at: string;
  gate_decision: GateAction | null;
  gate_reason: string | null;
}

interface PathEntry {
  flow_step: string;
  attempt: number;
  decision: GateAction;
  reason: string | null;
  at: string;
}

const ROLE_LABELS: Record<TaskRole, string> = {
  creator: "Creator",
  critic: "Critic",
  approver: "Approver",
  executor: "Executor",
};

const GATE_ACTION_LABELS: Record<GateAction, string> = {
  advance: "advanced",
  retry_step: "retried",
  return_to_step: "reworked from an earlier step",
  no_go_exit: "No-Go — run stopped",
  held: "held for review",
};

function taskBadgeClass(task: StepTask): string {
  if (task.verdict === "approved") return "done";
  if (task.verdict === "changes_requested" || task.verdict === "rejected") return "blocked";
  return task.status;
}

function taskBadgeLabel(task: StepTask): string {
  if (task.verdict) return task.verdict.replace("_", " ");
  return task.status;
}

function confidenceBadgeClass(c: Confidence): string {
  if (c === "high") return "done";
  if (c === "medium") return "running";
  return "blocked";
}

interface RunState {
  id: string;
  idea: string;
  status: "running" | "completed" | "failed" | "stopped_no_go" | "held";
  created_at: string;
  updated_at: string;
  current_step_index: number;
  total_steps: number;
  steps: StepResult[];
  error: string | null;
  provider: "anthropic" | "groq" | "openrouter" | "gemini";
  model: string;
  key_source: "user_provided" | "server_env";
  path: PathEntry[];
}

const PROVIDER_LABELS: Record<RunState["provider"], string> = {
  anthropic: "Anthropic",
  groq: "Groq Cloud",
  openrouter: "OpenRouter",
  gemini: "Google Gemini",
};

const STATUS_LABELS: Record<RunState["status"], string> = {
  running: "Building…",
  completed: "Build complete",
  failed: "Build stopped",
  stopped_no_go: "Stopped — No-Go decision",
  held: "Paused at a stage gate",
};

function groupByPhase(steps: StepResult[]): [string, StepResult[]][] {
  const groups = new Map<string, StepResult[]>();
  for (const s of steps) {
    const list = groups.get(s.business_phase) ?? [];
    list.push(s);
    groups.set(s.business_phase, list);
  }
  return Array.from(groups.entries());
}

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<RunState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [versionsByStep, setVersionsByStep] = useState<Record<string, ArtifactVersion[]>>({});
  const [resumeKey, setResumeKey] = useState("");
  const [showResumeKeyInput, setShowResumeKeyInput] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  function poll() {
    fetch(`/api/runs/${params.id}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelledRef.current) setNotFound(true);
          return;
        }
        const data: RunState = await res.json();
        if (!cancelledRef.current) {
          setRun(data);
          if (data.status === "running") {
            timerRef.current = setTimeout(poll, 2500);
          }
        }
      })
      .catch(() => {
        if (!cancelledRef.current) {
          timerRef.current = setTimeout(poll, 4000);
        }
      });
  }

  useEffect(() => {
    cancelledRef.current = false;
    poll();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function loadVersions(flowStep: string) {
    if (versionsByStep[flowStep]) return;
    try {
      const res = await fetch(`/api/runs/${params.id}/artifacts?flow_step=${flowStep}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setVersionsByStep((prev) => ({ ...prev, [flowStep]: data.versions ?? [] }));
    } catch {
      // Best-effort - the step's current attempt is already shown either way.
    }
  }

  async function handleResume() {
    setResuming(true);
    setResumeError(null);
    try {
      const res = await fetch(`/api/runs/${params.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resumeKey ? { apiKey: resumeKey } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        if (typeof data.error === "string" && data.error.includes("No API key supplied")) {
          setShowResumeKeyInput(true);
          setResumeError("This run used a key you provided - enter it again to resume.");
        } else {
          setResumeError(data.error ?? "Failed to resume run.");
        }
        return;
      }
      setShowResumeKeyInput(false);
      poll();
    } catch {
      setResumeError("Failed to resume run.");
    } finally {
      setResuming(false);
    }
  }

  if (notFound) {
    return (
      <main>
        <a className="back-link" href="/">
          ← New idea
        </a>
        <h1>Run not found</h1>
      </main>
    );
  }

  if (!run) {
    return (
      <main>
        <a className="back-link" href="/">
          ← New idea
        </a>
        <h1>Loading…</h1>
      </main>
    );
  }

  const doneCount = run.steps.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / run.total_steps) * 100);
  const phases = groupByPhase(run.steps);
  const lastPathEntry = run.path.length ? run.path[run.path.length - 1] : null;

  return (
    <main>
      <a className="back-link" href="/">
        ← New idea
      </a>
      <h1>{STATUS_LABELS[run.status]}</h1>
      <p className="subtitle">{run.idea}</p>
      <p className="subtitle" style={{ marginTop: -20 }}>
        {PROVIDER_LABELS[run.provider] ?? run.provider} · {run.model} ·{" "}
        {run.key_source === "user_provided"
          ? "using the key you provided"
          : "using this server's configured key"}
      </p>

      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="subtitle" style={{ marginTop: -14 }}>
        {doneCount} / {run.total_steps} steps complete
        {run.status === "running" && " — refreshing automatically"}
      </p>

      {run.error && <div className="top-error">{run.error}</div>}

      {run.status === "stopped_no_go" && (
        <div className="top-error">
          The run reached a Go/No-Go gate and recorded a No-Go decision at step{" "}
          {lastPathEntry?.flow_step}. {lastPathEntry?.reason}
        </div>
      )}

      {run.status === "held" && (
        <div className="top-error">
          <div style={{ marginBottom: 8 }}>
            Paused at step {lastPathEntry?.flow_step}: {lastPathEntry?.reason} Resumable —
            picks up exactly where it left off.
          </div>
          {showResumeKeyInput && (
            <input
              type="password"
              placeholder="API key"
              value={resumeKey}
              onChange={(e) => setResumeKey(e.target.value)}
              style={{ marginRight: 8, padding: "4px 8px" }}
            />
          )}
          <button onClick={handleResume} disabled={resuming}>
            {resuming ? "Resuming…" : "Resume"}
          </button>
          {resumeError && <div className="step-reason">{resumeError}</div>}
        </div>
      )}

      {run.path.some((p) => p.decision !== "advance") && (
        <details className="step" style={{ marginBottom: 18 }}>
          <summary>
            <span className="step-activity">Execution path (non-linear events)</span>
          </summary>
          <div className="step-body">
            {run.path
              .filter((p) => p.decision !== "advance")
              .map((p, idx) => (
                <div key={idx} className="step-reason" style={{ color: "var(--text-dim)" }}>
                  Step {p.flow_step} (attempt {p.attempt}) {GATE_ACTION_LABELS[p.decision]}
                  {p.reason ? ` — ${p.reason}` : ""}
                </div>
              ))}
          </div>
        </details>
      )}

      {phases.map(([phase, steps]) => (
        <div className="phase-group" key={phase}>
          <div className="phase-title">{phase}</div>
          {steps.map((s) => (
            <details
              className="step"
              key={s.flow_step}
              open={s.status === "blocked" || s.status === "error"}
              onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open && s.attempt > 1) {
                  loadVersions(s.flow_step);
                }
              }}
            >
              <summary>
                <span className="step-no">{s.flow_step}</span>
                <span className="step-activity">{s.activity}</span>
                <span className="step-agent">{s.agent_name}</span>
                {s.is_gate && <span className="badge pending">gate</span>}
                {s.attempt > 1 && <span className="badge running">attempt {s.attempt}</span>}
                {s.meta && (
                  <span className={`badge ${confidenceBadgeClass(s.meta.confidence)}`}>
                    {s.meta.confidence} confidence
                  </span>
                )}
                <span className={`badge ${s.status}`}>{s.status}</span>
              </summary>
              <div className="step-body">
                <div className="step-agent">Output artifact: {s.output_artifact}</div>
                {s.meta && (
                  <div className="step-agent">
                    Evidence quality: {s.meta.evidence_quality}
                    {s.meta.decision ? ` · Decision: ${s.meta.decision}` : ""}
                    {s.meta.claims.length > 0 && ` · ${s.meta.claims.length} tagged claim(s)`}
                  </div>
                )}
                {s.gate_decision && s.gate_decision !== "advance" && (
                  <div className="step-reason">
                    Gate: {GATE_ACTION_LABELS[s.gate_decision]}
                    {s.gate_reason ? ` — ${s.gate_reason}` : ""}
                  </div>
                )}
                {s.reason && <div className="step-reason">{s.reason}</div>}
                {s.content && <pre>{s.content}</pre>}

                {s.attempt > 1 && (
                  <div className="task-list">
                    <div className="task-list-title">
                      Prior attempts ({(versionsByStep[s.flow_step]?.length ?? s.attempt) - 1})
                    </div>
                    {(versionsByStep[s.flow_step] ?? [])
                      .filter((v) => v.attempt < s.attempt)
                      .map((v) => (
                        <details className="task" key={v.attempt}>
                          <summary>
                            <span className="task-role">Attempt {v.attempt}</span>
                            <span className="task-agent">{v.agent_name}</span>
                            <span className={`badge ${confidenceBadgeClass(v.meta.confidence)}`}>
                              {v.meta.confidence}
                            </span>
                          </summary>
                          <div className="task-body">
                            {v.gate_decision && (
                              <div className="step-reason">
                                {GATE_ACTION_LABELS[v.gate_decision]}
                                {v.gate_reason ? ` — ${v.gate_reason}` : ""}
                              </div>
                            )}
                            <pre>{v.content}</pre>
                          </div>
                        </details>
                      ))}
                  </div>
                )}

                {s.tasks && s.tasks.length > 0 && (
                  <div className="task-list">
                    <div className="task-list-title">
                      Creator → Critic → Approver → Executor
                    </div>
                    {s.tasks.map((t, idx) => (
                      <details className="task" key={`${t.role}-${t.agent_id}-${idx}`}>
                        <summary>
                          <span className="task-role">{ROLE_LABELS[t.role]}</span>
                          <span className="task-agent">{t.agent_name}</span>
                          <span className={`badge ${taskBadgeClass(t)}`}>
                            {taskBadgeLabel(t)}
                          </span>
                        </summary>
                        <div className="task-body">
                          {t.reason && <div className="step-reason">{t.reason}</div>}
                          {t.content && <pre>{t.content}</pre>}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      ))}
    </main>
  );
}
