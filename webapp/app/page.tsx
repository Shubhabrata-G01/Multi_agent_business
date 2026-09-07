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
  groq: "meta-llama/llama-prompt-guard-2-86m",
  openrouter: "anthropic/claude-sonnet-5",
  gemini: "gemini-2.5-pro",
};

const PROVIDER_KEY_HELP: Record<LLMProvider, string> = {
  anthropic: "console.anthropic.com",
  groq: "console.groq.com/keys",
  openrouter: "openrouter.ai/keys",
  gemini: "aistudio.google.com/apikey",
};

interface RunSummary {
  id: string;
  idea: string;
  status: string;
  created_at: string;
  current_step_index: number;
  total_steps: number;
  provider: LLMProvider;
  model: string;
}

export default function HomePage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [provider, setProvider] = useState<LLMProvider>("anthropic");
  const [model, setModel] = useState(PROVIDER_DEFAULT_MODEL.anthropic);
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => setRuns(data.runs ?? []))
      .catch(() => {});
  }, []);

  function handleProviderChange(next: LLMProvider) {
    setProvider(next);
    // Only replace the model field if it still holds a different provider's
    // default - preserve anything the user typed themselves.
    if (Object.values(PROVIDER_DEFAULT_MODEL).includes(model)) {
      setModel(PROVIDER_DEFAULT_MODEL[next]);
    }
    setApiKey("");
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
        body: JSON.stringify({ idea, provider, model, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
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
        Success, Finance, Legal, People, Operations — will run it
        autonomously through all 81 steps of the company&apos;s
        idea-to-expansion business flow. This run is fully autonomous — no
        approval gates. Every step is a real, billed API call using the
        provider and key you choose below.
      </p>

      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="e.g. A subscription service that helps small accounting firms automate client onboarding and document collection..."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
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
