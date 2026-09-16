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
        body: JSON.stringify({ idea, provider, model, apiKey, mode, profile: profile ?? undefined }),
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
        Describe a business idea. A 38-agent AI organization — CEO, CTO, CFO,
        Product, Design, Engineering, AI/Data, Growth, Sales, Customer
        Success, Finance, Legal, People, Operations — will work through all 81
        steps of the company&apos;s idea-to-expansion business flow. Choose the
        execution mode below: <strong>Assisted</strong> (approval-gated —
        agents flag consequential actions for human sign-off) or{" "}
        <strong>Simulation</strong> (fully autonomous, plans and drafts only).
        Every step is a real, billed API call using the provider and key you
        choose below.
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
              : "Agents decide every step themselves with no human gate — including actions that would normally need sign-off. Produces plans and drafts only; nothing is executed in the real world. Use for exploration, not for decisions you would act on."}
          </p>
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
    </main>
  );
}
