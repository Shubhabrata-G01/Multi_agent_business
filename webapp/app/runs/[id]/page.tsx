"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type TaskRole = "creator" | "critic" | "approver" | "executor";
type TaskVerdict = "approved" | "changes_requested" | "rejected" | null;
type StepStatus = "pending" | "running" | "done" | "blocked" | "error";

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
}

const ROLE_LABELS: Record<TaskRole, string> = {
  creator: "Creator",
  critic: "Critic",
  approver: "Approver",
  executor: "Executor",
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

interface RunState {
  id: string;
  idea: string;
  status: "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  current_step_index: number;
  total_steps: number;
  steps: StepResult[];
  error: string | null;
  provider: "anthropic" | "groq" | "openrouter" | "gemini";
  model: string;
  key_source: "user_provided" | "server_env";
}

const PROVIDER_LABELS: Record<RunState["provider"], string> = {
  anthropic: "Anthropic",
  groq: "Groq Cloud",
  openrouter: "OpenRouter",
  gemini: "Google Gemini",
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/runs/${params.id}`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data: RunState = await res.json();
        if (!cancelled) {
          setRun(data);
          if (data.status === "running") {
            timerRef.current = setTimeout(poll, 2500);
          }
        }
      } catch {
        if (!cancelled) {
          timerRef.current = setTimeout(poll, 4000);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [params.id]);

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

  return (
    <main>
      <a className="back-link" href="/">
        ← New idea
      </a>
      <h1>
        {run.status === "running"
          ? "Building…"
          : run.status === "completed"
            ? "Build complete"
            : "Build stopped"}
      </h1>
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

      {phases.map(([phase, steps]) => (
        <div className="phase-group" key={phase}>
          <div className="phase-title">{phase}</div>
          {steps.map((s) => (
            <details className="step" key={s.flow_step} open={s.status === "blocked" || s.status === "error"}>
              <summary>
                <span className="step-no">{s.flow_step}</span>
                <span className="step-activity">{s.activity}</span>
                <span className="step-agent">{s.agent_name}</span>
                {s.is_gate && <span className="badge pending">gate</span>}
                <span className={`badge ${s.status}`}>{s.status}</span>
              </summary>
              <div className="step-body">
                <div className="step-agent">
                  Output artifact: {s.output_artifact}
                </div>
                {s.reason && <div className="step-reason">{s.reason}</div>}
                {s.content && <pre>{s.content}</pre>}

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
