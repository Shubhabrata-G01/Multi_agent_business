"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LLMProvider = "anthropic" | "groq" | "openrouter" | "gemini";

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: "Anthropic",
  groq: "Groq Cloud",
  openrouter: "OpenRouter",
  gemini: "Google Gemini",
};

const PROVIDER_DEFAULT_MODEL: Record<LLMProvider, string> = {
  anthropic: "claude-opus-5",
  groq: "llama-3.3-70b-versatile",
  openrouter: "anthropic/claude-sonnet-5",
  gemini: "gemini-2.5-pro",
};

const PROVIDER_KEY_HELP: Record<LLMProvider, string> = {
  anthropic: "console.anthropic.com",
  groq: "console.groq.com/keys",
  openrouter: "openrouter.ai/keys",
  gemini: "aistudio.google.com/apikey",
};

interface RiskFlag {
  kind: string;
  detail: string;
  suggested_pack: string;
}

interface BusinessProfile {
  idea: string;
  industry: string;
  business_model: string;
  geography: string[];
  customer: string;
  maturity: string;
  capital_intensity: string;
  risk_flags: RiskFlag[];
  constraints: string[];
  confidence: "high" | "medium" | "low";
  open_questions: string[];
  validation_notes: string[];
}

interface PhaseScopeDef {
  id: string;
  label: string;
  description: string;
  throughPhase: string | null;
}

interface RunEstimate {
  steps: number;
  estimated_tasks: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  estimated_duration_minutes: number;
  based_on: "historical_average" | "heuristic_default";
}

interface RunSummary {
  id: string;
  idea: string;
  status: string;
  created_at: string;
  current_step_index: number;
  total_steps: number;
  provider: LLMProvider;
  model: string;
  mode?: "assisted" | "simulation";
}

export default function HomePage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [provider, setProvider] = useState<LLMProvider>("anthropic");
  const [model, setModel] = useState(PROVIDER_DEFAULT_MODEL.anthropic);
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState<"assisted" | "simulation">("assisted");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [phaseScope, setPhaseScope] = useState("full");
  const [scopes, setScopes] = useState<PhaseScopeDef[]>([]);
  const [estimate, setEstimate] = useState<RunEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((data) => setRuns(data?.runs ?? []))
      .catch(() => {});
  }, [router]);

  // STEP 8 item 3: estimated cost/duration before starting, refreshed
  // whenever provider/model/phase scope changes. No provider call is made -
  // see lib/costEstimate.ts.
  useEffect(() => {
    const timer = setTimeout(() => {
      setEstimating(true);
      fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, phaseScope, profile: profile ?? undefined }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            setEstimate(data.estimate);
            if (scopes.length === 0) setScopes(data.scopes ?? []);
          }
        })
        .catch(() => {})
        .finally(() => setEstimating(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, model, phaseScope, profile]);

  function handleProviderChange(next: LLMProvider) {
    setProvider(next);
    // Only replace the model field if it still holds a different provider's
    // default - preserve anything the user typed themselves.
    if (Object.values(PROVIDER_DEFAULT_MODEL).includes(model)) {
      setModel(PROVIDER_DEFAULT_MODEL[next]);
    }
    setApiKey("");
  }

  async function handleClassify() {
    if (!idea.trim() || classifying) return;
    setClassifying(true);
    setClassifyError(null);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, provider, model, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error(data.error || "Failed to classify idea");
      }
      setProfile(data.profile as BusinessProfile);
    } catch (err) {
      setClassifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setClassifying(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, provider, model, apiKey, mode, phaseScope, profile: profile ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error(data.error || "Failed to start run");
      }
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>AI Company Builder</h1>
      <p className="subtitle">
        <strong>AI-assisted planning and decision support</strong> — not an
        autonomous company. Nothing here deploys code, spends money, signs a
        contract, or contacts a real customer; it drafts documents and
        recommendations for a human to review and act on (see
        &quot;Known simplifications&quot; in the docs for exactly what is and
        isn&apos;t connected).
      </p>
      <p className="subtitle">
        Describe a business idea. A 38-agent AI organization — CEO, CTO, CFO,
        Product, Design, Engineering, AI/Data, Growth, Sales, Customer
        Success, Finance, Legal, People, Operations — drafts its way through
        up to 81 steps of an idea-to-expansion business flow (pick a smaller
        scope below if you don&apos;t need the full build). Choose the
        execution mode below: <strong>Assisted</strong> (approval-gated —
        agents flag consequential actions for human sign-off) or{" "}
        <strong>Simulation</strong> (fully autonomous, advisory only, no
        human approval at any point). Every step is a real, billed API call
        using the provider and key you choose below.
      </p>

      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="e.g. A subscription service that helps small accounting firms automate client onboarding and document collection..."
          value={idea}
          onChange={(e) => {
            setIdea(e.target.value);
            setProfile(null); // a changed idea invalidates a prior classification
          }}
          disabled={submitting}
          maxLength={4000}
        />

        <div className="field-row">
          <div className="field">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) =>
                handleProviderChange(e.target.value as LLMProvider)
              }
              disabled={submitting}
            >
              {(Object.keys(PROVIDER_LABELS) as LLMProvider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="model">Model</label>
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={submitting}
              placeholder={PROVIDER_DEFAULT_MODEL[provider]}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="apiKey">
            {PROVIDER_LABELS[provider]} API key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={submitting}
            placeholder={`Get one at ${PROVIDER_KEY_HELP[provider]} — or leave blank to use the server's configured key, if any`}
            autoComplete="off"
          />
          <p className="field-hint">
            Sent once to start this run, used only in server memory for its
            duration, and never written to disk or shown again. Leave blank
            to fall back to this server&apos;s environment variable for{" "}
            {PROVIDER_LABELS[provider]}, if one is set.
          </p>
        </div>

        <div className="field">
          <label htmlFor="mode">Execution mode</label>
          <select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "assisted" | "simulation")}
            disabled={submitting}
          >
            <option value="assisted">
              Assisted — approval-gated (recommended)
            </option>
            <option value="simulation">Simulation — fully autonomous</option>
          </select>
          <p className="field-hint">
            {mode === "assisted"
              ? "Agents draft and plan, but must stop and mark any consequential action (pricing, deploys, spend, hiring, legal, funds) as PENDING_HUMAN_APPROVAL instead of deciding it themselves."
              : "ADVISORY, NON-EXECUTING, NOT HUMAN-APPROVED: agents decide every step themselves with no human gate at all, including decisions that would normally need sign-off. Produces plans and drafts only — nothing is executed in the real world, and no output here has been reviewed or approved by a person. Use for exploration, never as the basis for a real decision."}
          </p>
        </div>

        <div className="field">
          <label htmlFor="phaseScope">Scope</label>
          <select
            id="phaseScope"
            value={phaseScope}
            onChange={(e) => setPhaseScope(e.target.value)}
            disabled={submitting}
          >
            {(scopes.length > 0
              ? scopes
              : [{ id: "full", label: "Full company build", description: "", throughPhase: null }]
            ).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="field-hint">
            {scopes.find((s) => s.id === phaseScope)?.description ??
              "All steps, Inception through Expansion."}{" "}
            {phaseScope !== "full" &&
              "The run pauses once this phase finishes — resume it any time to continue further."}
          </p>
          {(estimating || estimate) && (
            <p className="field-hint" style={{ marginTop: 6 }}>
              {estimating && !estimate
                ? "Estimating…"
                : estimate && (
                    <>
                      Estimated: ~{estimate.steps} step{estimate.steps === 1 ? "" : "s"}, ~
                      {estimate.estimated_tasks} agent call(s), ~$
                      {estimate.estimated_cost_usd < 0.01 ? "<0.01" : estimate.estimated_cost_usd.toFixed(2)}
                      , ~{estimate.estimated_duration_minutes} minute
                      {estimate.estimated_duration_minutes === 1 ? "" : "s"}.{" "}
                      <em>
                        {estimate.based_on === "historical_average"
                          ? "Based on this organization's own recent usage."
                          : "Rough heuristic — actual usage varies by idea complexity and model."}{" "}
                        Not a guarantee.
                      </em>
                    </>
                  )}
            </p>
          )}
        </div>

        <div className="field">
          <label>Business profile (optional intake)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={handleClassify}
              disabled={classifying || submitting || !idea.trim()}
            >
              {classifying ? "Classifying…" : profile ? "Re-classify idea" : "Preview business profile"}
            </button>
            <span className="field-hint" style={{ margin: 0 }}>
              Classify the idea (industry, model, risks) before building. Uses one API call.
            </span>
          </div>
          {classifyError && <div className="error-box" style={{ marginTop: 8 }}>{classifyError}</div>}
          {profile && (
            <div
              style={{
                marginTop: 10,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <strong>{profile.industry}</strong> · {profile.business_model} ·{" "}
                <span className="badge pending">{profile.confidence} confidence</span>
              </div>
              <div className="field-hint" style={{ marginBottom: 6, opacity: 0.8 }}>
                &quot;Confidence&quot; is the model&apos;s own self-assessment of this
                classification, not a verified or measured fact — treat it as a hint about how much
                to double-check, not as truth.
              </div>
              <div className="field-hint" style={{ marginBottom: 4 }}>
                Customer: {profile.customer} · Maturity: {profile.maturity} · Capital:{" "}
                {profile.capital_intensity}
                {profile.geography.length > 0 && ` · Geo: ${profile.geography.join(", ")}`}
              </div>
              {profile.constraints.length > 0 && (
                <div className="field-hint" style={{ marginBottom: 4 }}>
                  Constraints: {profile.constraints.join("; ")}
                </div>
              )}
              {profile.risk_flags.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  {profile.risk_flags.map((r, i) => (
                    <span key={i} className="badge blocked" style={{ marginRight: 6 }}>
                      {r.kind}: {r.suggested_pack || r.detail}
                    </span>
                  ))}
                </div>
              )}
              {profile.risk_flags.length === 0 && (
                <div className="field-hint">No special risk packs flagged — plain build.</div>
              )}
              {profile.open_questions.length > 0 && (
                <div className="field-hint" style={{ marginTop: 6 }}>
                  Open questions: {profile.open_questions.join(" · ")}
                </div>
              )}
              {profile.validation_notes.length > 0 && (
                <div className="field-hint" style={{ marginTop: 6, opacity: 0.8 }}>
                  {profile.validation_notes.join(" ")}
                </div>
              )}
              <div className="field-hint" style={{ marginTop: 6 }}>
                This profile will be attached to the run. Edit the idea above and re-classify to
                refine it.
              </div>
            </div>
          )}
        </div>

        <div>
          <button type="submit" disabled={submitting || !idea.trim()}>
            {submitting ? "Starting…" : "Build my business"}
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
      </form>

      {runs.length > 0 && (
        <div className="run-list">
          <h2>Recent runs</h2>
          {runs.map((r) => (
            <a key={r.id} className="run-card" href={`/runs/${r.id}`}>
              <div className="idea">{r.idea}</div>
              <div className="meta">
                <span className={`badge ${r.status}`}>{r.status}</span>
                <span>{r.mode ?? "simulation"}</span>
                <span>
                  {PROVIDER_LABELS[r.provider] ?? r.provider} · {r.model}
                </span>
                <span>
                  step {Math.min(r.current_step_index + 1, r.total_steps)} /{" "}
                  {r.total_steps}
                </span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      <p className="field-hint" style={{ marginTop: 32, opacity: 0.7 }}>
        Privacy &amp; data: a run and everything derived from it (artifacts, comments, usage records)
        is kept until you delete it — each run has a <strong>Delete run</strong> button, and its own
        page offers <strong>JSON/Markdown/CSV export</strong> at any time. Deletion is permanent and
        cannot be undone.
      </p>
    </main>
  );
}
