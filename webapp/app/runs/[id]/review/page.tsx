"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type TaskRole = "creator" | "critic" | "approver" | "executor" | "contributor";
type Confidence = "high" | "medium" | "low";
type ClaimType = "fact" | "assumption" | "estimate" | "inference" | "recommendation" | "decision";
type ApprovalState = "pending" | "approved" | "rejected";
type ReviewStatus = "assigned" | "reviewed" | "changes_requested";

interface ReviewRow {
  task_id: string;
  flow_step: string;
  business_phase: string;
  activity: string;
  attempt: number;
  role: TaskRole;
  agent_id: string;
  agent_name: string;
  model: string;
  status: string;
  verdict: string | null;
  content: string | null;
  reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  confidence: Confidence | null;
  evidence_quality: Confidence | null;
  claim_types: ClaimType[];
  unresolved_assumptions: number;
  is_gate: boolean;
  gate_decision: string | null;
  blocked_or_error: boolean;
  review_status: ReviewStatus | null;
  reviewer_email: string | null;
  comment_count: number;
}

interface Comment {
  id: string;
  author_email: string;
  body: string;
  created_at: string;
}

interface Filters {
  role: string;
  confidence: string;
  evidence_quality: string;
  claim_type: string;
  approval_state: string;
  blocked_or_error: boolean;
  unresolved_assumptions: boolean;
  review_status: string;
  q: string;
}

const EMPTY_FILTERS: Filters = {
  role: "",
  confidence: "",
  evidence_quality: "",
  claim_type: "",
  approval_state: "",
  blocked_or_error: false,
  unresolved_assumptions: false,
  review_status: "",
  q: "",
};

const ROLE_LABELS: Record<TaskRole, string> = {
  creator: "Creator",
  critic: "Critic",
  approver: "Approver",
  executor: "Executor",
  contributor: "Contributor",
};

function statusBadgeClass(row: ReviewRow): string {
  if (row.review_status === "reviewed") return "done";
  if (row.review_status === "changes_requested") return "blocked";
  if (row.blocked_or_error) return "blocked";
  return row.status;
}

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.role) params.set("role", filters.role);
  if (filters.confidence) params.set("confidence", filters.confidence);
  if (filters.evidence_quality) params.set("evidence_quality", filters.evidence_quality);
  if (filters.claim_type) params.set("claim_type", filters.claim_type);
  if (filters.approval_state) params.set("approval_state", filters.approval_state);
  if (filters.blocked_or_error) params.set("blocked_or_error", "true");
  if (filters.unresolved_assumptions) params.set("unresolved_assumptions", "true");
  if (filters.review_status) params.set("review_status", filters.review_status);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  return params.toString();
}

export default function ReviewDashboardPage() {
  const params = useParams<{ id: string }>();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [commentsByStep, setCommentsByStep] = useState<Record<string, Comment[]>>({});
  const [draftComment, setDraftComment] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/runs/${params.id}/review?${buildQuery(filters)}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load review data.");
          return;
        }
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => setError("Failed to load review data."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, JSON.stringify(filters)]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadComments(flowStep: string) {
    if (commentsByStep[flowStep]) return;
    try {
      const res = await fetch(`/api/runs/${params.id}/comments?flow_step=${flowStep}`, { cache: "no-store" });
      const data = await res.json();
      setCommentsByStep((prev) => ({ ...prev, [flowStep]: data.comments ?? [] }));
    } catch {
      // best-effort
    }
  }

  async function submitComment(flowStep: string, attempt: number) {
    const body = (draftComment[flowStep] ?? "").trim();
    if (!body) return;
    setBusyKey(`comment-${flowStep}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/runs/${params.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowStep, attempt, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Failed to add comment.");
        return;
      }
      setCommentsByStep((prev) => ({ ...prev, [flowStep]: [...(prev[flowStep] ?? []), data.comment] }));
      setDraftComment((prev) => ({ ...prev, [flowStep]: "" }));
      load();
    } catch {
      setActionError("Failed to add comment.");
    } finally {
      setBusyKey(null);
    }
  }

  async function reviewAction(
    flowStep: string,
    attempt: number,
    action: "assign" | "mark_reviewed" | "request_changes",
  ) {
    const key = `${action}-${flowStep}`;
    setBusyKey(key);
    setActionError(null);
    try {
      const res = await fetch(`/api/runs/${params.id}/steps/${flowStep}/review-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Action failed.");
        return;
      }
      load();
    } catch {
      setActionError("Action failed.");
    } finally {
      setBusyKey(null);
    }
  }

  function exportUrl(format: "json" | "markdown" | "csv"): string {
    return `/api/runs/${params.id}/export?format=${format}`;
  }

  const phases = Array.from(new Set(rows.map((r) => r.business_phase)));
  const agents = Array.from(new Set(rows.map((r) => r.agent_id)));

  return (
    <main>
      <a className="back-link" href={`/runs/${params.id}`}>
        ← Back to run
      </a>
      <h1>Review workspace</h1>
      <p className="subtitle">
        Every task output across every step and attempt for this run — filter, search, comment, and
        export.
      </p>

      <div className="top-error" style={{ background: "var(--panel-2)", borderColor: "var(--accent)" }}>
        <strong>Advisory notice:</strong> everything below is AI-generated output. Only Level-2+ gate
        decisions with a recorded approval below carry human sign-off — treat every other claim as
        advisory until independently verified.
      </div>

      <div className="field-row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <div className="field">
          <label>Search</label>
          <input
            type="text"
            placeholder="Search content/reason…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}>
            <option value="">Any</option>
            {Object.entries(ROLE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Confidence</label>
          <select
            value={filters.confidence}
            onChange={(e) => setFilters((f) => ({ ...f, confidence: e.target.value }))}
          >
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="field">
          <label>Evidence quality</label>
          <select
            value={filters.evidence_quality}
            onChange={(e) => setFilters((f) => ({ ...f, evidence_quality: e.target.value }))}
          >
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="field">
          <label>Claim type</label>
          <select
            value={filters.claim_type}
            onChange={(e) => setFilters((f) => ({ ...f, claim_type: e.target.value }))}
          >
            <option value="">Any</option>
            <option value="fact">Fact</option>
            <option value="assumption">Assumption</option>
            <option value="estimate">Estimate</option>
            <option value="inference">Inference</option>
            <option value="recommendation">Recommendation</option>
            <option value="decision">Decision</option>
          </select>
        </div>
        <div className="field">
          <label>Approval state</label>
          <select
            value={filters.approval_state}
            onChange={(e) => setFilters((f) => ({ ...f, approval_state: e.target.value }))}
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="field">
          <label>Review status</label>
          <select
            value={filters.review_status}
            onChange={(e) => setFilters((f) => ({ ...f, review_status: e.target.value }))}
          >
            <option value="">Any</option>
            <option value="none">Not reviewed</option>
            <option value="assigned">Assigned</option>
            <option value="reviewed">Reviewed</option>
            <option value="changes_requested">Changes requested</option>
          </select>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={filters.blocked_or_error}
              onChange={(e) => setFilters((f) => ({ ...f, blocked_or_error: e.target.checked }))}
            />
            Blocked/error only
          </label>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={filters.unresolved_assumptions}
              onChange={(e) => setFilters((f) => ({ ...f, unresolved_assumptions: e.target.checked }))}
            />
            Unresolved assumptions only
          </label>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
        </div>
      </div>

      <div className="field-row" style={{ marginBottom: 16 }}>
        <a href={exportUrl("json")}>
          <button type="button">Export JSON audit bundle</button>
        </a>
        <a href={exportUrl("markdown")}>
          <button type="button">Export Markdown</button>
        </a>
        <a href={exportUrl("csv")}>
          <button type="button">Export artifact index (CSV)</button>
        </a>
      </div>

      {actionError && <div className="step-reason">{actionError}</div>}
      {error && <div className="top-error">{error}</div>}
      {loading && <p className="subtitle">Loading…</p>}
      {!loading && !error && (
        <p className="subtitle" style={{ marginTop: -8 }}>
          Showing {rows.length} of {total} task output(s)
          {phases.length > 0 && ` across ${phases.length} phase(s) and ${agents.length} agent(s)`}.
        </p>
      )}

      <div className="task-list">
        {rows.map((row) => (
          <details className="task" key={row.task_id}>
            <summary onClick={() => loadComments(row.flow_step)}>
              <span className="task-role">
                {row.flow_step} · {ROLE_LABELS[row.role]}
              </span>
              <span className="task-agent">
                {row.agent_name} · {row.business_phase}
              </span>
              {row.confidence && (
                <span className={`badge ${row.confidence === "high" ? "done" : row.confidence === "medium" ? "running" : "blocked"}`}>
                  {row.confidence} confidence
                </span>
              )}
              {row.unresolved_assumptions > 0 && (
                <span className="badge pending">{row.unresolved_assumptions} assumption(s)</span>
              )}
              {row.comment_count > 0 && <span className="badge pending">{row.comment_count} comment(s)</span>}
              <span className={`badge ${statusBadgeClass(row)}`}>
                {row.review_status ?? row.verdict ?? row.status}
              </span>
            </summary>
            <div className="task-body">
              <div className="step-agent">
                {row.activity} · attempt {row.attempt} · model {row.model}
                {row.is_gate && " · gate step"}
              </div>
              {row.reason && <div className="step-reason">{row.reason}</div>}
              {row.content && (
                <pre>
                  {expandedTaskId === row.task_id || row.content.length <= 600
                    ? row.content
                    : `${row.content.slice(0, 600)}…`}
                </pre>
              )}
              {row.content && row.content.length > 600 && (
                <button
                  type="button"
                  onClick={() => setExpandedTaskId(expandedTaskId === row.task_id ? null : row.task_id)}
                >
                  {expandedTaskId === row.task_id ? "Show less" : "Show full content"}
                </button>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={busyKey === `assign-${row.flow_step}`}
                  onClick={() => reviewAction(row.flow_step, row.attempt, "assign")}
                >
                  Assign to me
                </button>
                <button
                  type="button"
                  disabled={busyKey === `mark_reviewed-${row.flow_step}`}
                  onClick={() => reviewAction(row.flow_step, row.attempt, "mark_reviewed")}
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  disabled={busyKey === `request_changes-${row.flow_step}`}
                  onClick={() => reviewAction(row.flow_step, row.attempt, "request_changes")}
                >
                  Request changes
                </button>
              </div>

              <div className="task-list-title" style={{ marginTop: 12 }}>
                Comments{row.reviewer_email ? ` · reviewer: ${row.reviewer_email}` : ""}
              </div>
              {(commentsByStep[row.flow_step] ?? []).map((c) => (
                <div key={c.id} className="step-reason">
                  <strong>{c.author_email}:</strong> {c.body}
                </div>
              ))}
              <div className="field-row" style={{ marginTop: 6 }}>
                <input
                  type="text"
                  placeholder="Leave a comment…"
                  value={draftComment[row.flow_step] ?? ""}
                  onChange={(e) =>
                    setDraftComment((prev) => ({ ...prev, [row.flow_step]: e.target.value }))
                  }
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  disabled={busyKey === `comment-${row.flow_step}`}
                  onClick={() => submitComment(row.flow_step, row.attempt)}
                >
                  Comment
                </button>
              </div>
            </div>
          </details>
        ))}
        {!loading && rows.length === 0 && !error && (
          <p className="subtitle">No task outputs match the current filters.</p>
        )}
      </div>
    </main>
  );
}
