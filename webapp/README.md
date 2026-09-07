# AI Company Builder

A standalone Next.js app: submit a business idea on a web page, pick an LLM
provider and paste your key, and the 38-agent AI organization defined in
`../company/` runs it, fully autonomously, through all (up to) 81 steps of
`company/workflow/business-flow.json` — one real API call per step, using
that step's primary agent's full spec (`company/agents/<dept>/<ID>.md`) as
its system prompt.

## Provider selection

The submission form on the home page lets whoever is using the app choose,
per run:

| Provider | Default model (editable) | Get a key |
|---|---|---|
| Anthropic | `claude-opus-5` | console.anthropic.com |
| Groq Cloud | `llama-3.3-70b-versatile` | console.groq.com/keys |
| OpenRouter | `anthropic/claude-sonnet-5` | openrouter.ai/keys |
| Google Gemini | `gemini-2.5-pro` | aistudio.google.com/apikey |

Model IDs on all four platforms change over time — the values above are
starting points, not guarantees; the model field is a free-text input, so
override it with whatever's current on the provider's own docs.

**The API key field is optional per request**: if left blank, the server
falls back to that provider's env var (`ANTHROPIC_API_KEY`, `GROQ_API_KEY`,
`OPENROUTER_API_KEY`, `GEMINI_API_KEY`) if one is set in `.env.local`. The
run record always states which source was actually used
(`key_source: "user_provided" | "server_env"`) so it's never a silent
surprise which credential — and whose bill — a run is running against. A
key typed into the form is held only in server memory for that run's
duration and passed straight to the provider call; it is never written to
`runs/*.json` or logged.

Provider implementations live in `lib/providers/` — `anthropic.ts` uses the
official `@anthropic-ai/sdk` (per this project's own Claude-usage
conventions); `groq.ts` and `openrouter.ts` call the OpenAI-compatible
`/chat/completions` REST endpoint directly (both platforms implement that
shape); `gemini.ts` calls Google's `generateContent` REST endpoint
directly. The non-Anthropic ones use plain `fetch` rather than a
provider SDK, since this project has no verified reference for those SDKs'
exact current shape and the REST contracts are simpler and more stable.

## What "fully autonomous" means here

This mode was chosen explicitly over the project's default human-in-the-loop
design (`../company/architecture/05-permissions-and-hitl.md`). No step pauses
for approval — including steps that would normally require Level 2/3 human
sign-off (pricing, production deploys, funding, hiring). Each agent is told
this and instructed to make the call itself, state it as a decision with its
reasoning, and move on rather than defer. Read the run's output before
treating any decision it made as final in the real world.

## Setup

```bash
cd webapp
npm install
cp .env.local.example .env.local
# optionally set one or more provider keys as server-side fallbacks -
# otherwise every run needs a key typed into the form
npm run dev
```

Open http://localhost:3000.

## How it works

- `lib/businessFlow.ts` reads `../company/agents/registry.json` and
  `../company/workflow/business-flow.json` directly (no copy/build step —
  edit a spec in `company/` and it's picked up on next run).
- `lib/orchestrator.ts` walks the 81 steps in order. For each step it looks
  up the Primary agent (same mapping used to generate `.claude/agents/`),
  loads that agent's full spec as the system prompt, and calls the chosen
  provider with the step's instructions plus a rolling context window (full
  text of the last 4 artifacts, one-line summaries of everything earlier).
- `lib/providers/index.ts` dispatches to the right provider implementation
  and resolves which API key to use (`resolveApiKey`).
- Runs are persisted to `runs/<id>.json` (gitignored) so progress survives a
  server restart; the UI polls `GET /api/runs/[id]` every ~2.5s.
- A step that fails or reports `STATUS: BLOCKED` halts the run rather than
  continuing on a broken chain — downstream steps depend on upstream
  artifacts, so silently skipping one would corrupt everything after it.

## Known simplifications (v1)

- **One call per step**, using only the step's Primary agent — Supporting/
  Reviewing agents named in the business flow are mentioned in the prompt
  for context but not separately invoked. This keeps a full run at ~81 API
  calls instead of several hundred.
- **No loop/re-entry execution.** The org design's loop conditions (e.g.
  "return to Step 29 until critical concerns are resolved") are shown to the
  agent as context but not mechanically re-executed — the run is a single
  linear pass through all 81 steps, not a graph with cycles.
- **Context beyond 4 steps back is a 1-line truncated summary**, not the
  full artifact — keeps token cost bounded on later steps but means a
  step 75 agent doesn't see the full text of, say, step 10's artifact.
- **Non-Anthropic providers are non-streaming** and don't support the
  adaptive-thinking/effort controls Anthropic does — a plain completion
  call. Token usage reporting also varies: Anthropic and the OpenAI-
  compatible providers report it; a provider that omits `usage` in its
  response will show `null` token counts for that step.

## Environment variables

See `.env.local.example`. Notable ones:

- `ANTHROPIC_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` /
  `GEMINI_API_KEY` — optional server-side fallback keys, one per provider.
- `LLM_MAX_TOKENS` — default `8000`, applies to whichever provider is used.
- `ANTHROPIC_EFFORT` — default `high`, Anthropic-only (`low`/`medium`/
  `high`/`xhigh`/`max`).
- `MAX_RUN_STEPS` — default `81` (the full flow). Set lower (e.g. `13`) to
  test cheaply — that runs Inception through the Go/No-Go decision only.
- `COMPANY_DIR` — override if `webapp/` isn't a sibling of `company/`.

## Cost note

Every run makes one real, billed API call per step, against whichever
provider and key you selected. A full 81-step run at Anthropic's
claude-opus-5 defaults is roughly $5–$15 depending on how much the model
writes per step — see the cost breakdown discussed in project chat history,
or estimate for your chosen provider/model from its own pricing page. Use
`MAX_RUN_STEPS` to test on a small slice first, and a cheaper model/provider
if you're just validating the mechanics.
