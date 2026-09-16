# AI Company Builder

A standalone Next.js app: submit a business idea on a web page, pick an LLM
provider and paste your key, and the 38-agent AI organization defined in
`../company/` runs it, fully autonomously, through all (up to) 81 steps of
`company/workflow/business-flow.json`. Each step runs the step's Primary
agent as Creator (its full spec, `company/agents/<dept>/<ID>.md`, is the
system prompt), then the step's Supporting agents as independent Critics, a
one-shot Creator revision incorporating their findings, and — on gate steps —
an Approver and an Executor handoff. So a step is several real API calls, not
one (see "How it works" below).

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

For the multi-user application, configure `DATABASE_URL` and `AUTH_SECRET`,
run `npm run db:generate`, apply the checked-in Prisma migrations with
`npm run db:migrate`, then create an account at `/signup`. Run and artifact
endpoints require an authenticated user and only return that user's runs.

### Storage backend (PostgreSQL vs. filesystem)

Runs and artifacts are persisted through `lib/runStore.ts`/`lib/artifactStore.ts`,
which dispatch to one of two backends (`lib/storageBackend.ts`):

| | PostgreSQL (`lib/db/`) | Filesystem (`lib/fs/`) |
|---|---|---|
| When used | **Default** whenever `DATABASE_URL` is set | Only with an explicit `STORAGE_BACKEND=filesystem`, or when neither is set (dev only) |
| Production | Required - the app refuses to start (or start a run) without `DATABASE_URL` | **Refused outright** - `STORAGE_BACKEND=filesystem` throws at startup if `NODE_ENV=production` |
| Durability | Survives process restarts, works across multiple instances | A single process's local disk only - not durable, not shared |
| Concurrency safety | Optimistic-concurrency (`version` column) rejects a write based on stale data rather than silently losing it | **None** - a later save silently overwrites an earlier one |

**Filesystem mode is a local-development convenience only.** It is what runs
if you skip `DATABASE_URL` entirely for a quick `npm run dev` - useful for
poking at the orchestrator without standing up Postgres, but never appropriate
for anything with more than one user or process.

To run a local PostgreSQL for development (Docker):

```bash
docker compose -f docker-compose.dev.yml up -d
# DATABASE_URL=postgresql://devuser:devpass@localhost:55432/webapp_dev in .env.local
npm run db:generate
npm run db:migrate
```

The active backend is logged on server startup (`instrumentation.ts`) and on
first use (`[storage] Using the ... backend`).

### Durable execution (`npm run worker`)

On the PostgreSQL backend, starting or resuming a run does **not** execute it
in the web process - it enqueues a row in the `Job` table
(`lib/jobs/jobRepository.ts`) and returns immediately. A separate, standalone
process claims and runs it:

```bash
npm run worker
```

Run one or more of these (same `DATABASE_URL`/`AUTH_SECRET`, on the same host
or separately) alongside `npm run dev`/`npm run start`. Why a separate
process, and what it buys you:

- **A web-process restart/deploy never interrupts a run.** The web process
  holds no execution state - it only ever reads/writes the DB - so redeploying
  it mid-run is safe.
- **A worker crash is recoverable.** Each claimed job holds a time-limited
  lease, renewed on a heartbeat while the worker is alive; if a worker dies,
  the lease expires and another worker (or the same one, restarted) reclaims
  the job. `executeRun` always resumes from the run's persisted
  `current_step_index` rather than from anything held in memory, so a
  reclaimed job picks up exactly where the crashed attempt left off.
- **Two workers can never run the same job concurrently** - claiming is one
  atomic `UPDATE ... FOR UPDATE SKIP LOCKED` query, so horizontally scaling
  workers is just running more of them.
- **Bounded retries with exponential backoff** for job-level (infrastructure)
  failures - a worker process dying mid-step, a transient DB error escaping
  `executeRun`'s own error handling. This is distinct from the orchestrator's
  own business-level step retries (`evaluateGate`'s `retry_step`/
  `return_to_step`), which it already handled before a job ever failed.
- **Graceful shutdown**: SIGINT/SIGTERM stops claiming new jobs and waits
  (`WORKER_SHUTDOWN_GRACE_MS`, default 30s) for in-flight jobs to finish
  before exiting; anything still running when the grace period elapses is
  picked up by another worker once its lease expires.

A user-supplied (BYOK) API key is encrypted (AES-256-GCM, keyed from
`AUTH_SECRET`) into the job row just long enough to travel from the web
process to whichever worker executes it, and is cleared the moment the job
reaches a terminal state - see `lib/jobs/providerKeyBox.ts`. A
server-configured key (`ANTHROPIC_API_KEY` etc.) is never written to the DB
at all: the worker re-resolves it from its own environment.

In **filesystem mode** (no `DATABASE_URL`), there is no `Job` table to
enqueue into - runs execute in-process instead, exactly as before (see
`lib/jobQueue.ts`), and `npm run worker` refuses to start (nothing to poll).
This is fine for local development; filesystem mode has no durability
guarantees regardless of whether a worker is involved.

### Organizations, roles, and access control

Every account gets a personal Organization (workspace) at signup with role
`OWNER`; a run belongs to an organization (`Run.organization_id`), not to the
individual who clicked "start" - any member of that organization can see and
act on its runs, per their role (`lib/authz.ts`):

| Role | View runs | Create/cancel/resume | Approve/reject gates |
|---|---|---|---|
| OWNER / ADMIN | ✓ | ✓ | ✓ |
| MEMBER | ✓ | ✓ | ✗ |
| REVIEWER | ✓ | ✗ | ✓ |

`lib/apiAuth.ts`'s `requireOrgRun(id, capability?)` is the single check every
run-scoped API route goes through: a run in an organization the caller isn't
a member of returns 404 (not 403 - a non-member can't tell "doesn't exist"
from "isn't theirs"); a member whose role fails the capability check gets
403. A human-approval decision now always records the real authenticated
reviewer's id/email/role (`ApprovalRequest.decided_by*`), never a hardcoded
placeholder.

### Rate limits, quotas, and other hardening

- **Rate limits** (`lib/rateLimit.ts`, in-memory - see its own comment for
  the multi-instance caveat): signup and login are limited per email/IP;
  classify, run creation, resume, and approval decisions are limited per
  user.
- **Quotas** (`lib/quotas.ts`, PostgreSQL-only): per-organization and
  per-user concurrent-run and daily-run ceilings, checked before a run
  starts; a per-organization monthly token budget and a per-run cost ceiling
  (`lib/pricing.ts` estimates cost from token counts), the latter checked
  both before a run starts and continuously during execution
  (`orchestrator.ts`'s `executeRun` loop). Every provider call is logged to
  `UsageEvent` (provider/model/tokens/estimated cost/run/user/org).
- **CSRF/origin protection** (`lib/csrf.ts`): every state-changing route
  requires the request's `Origin` to match its own `Host`.
- **Security headers and cookies**: `next.config.mjs` sets
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS, and a CSP (`script-src`/`style-src` allow
  `'unsafe-inline'` - Next's App Router streams inline hydration scripts
  with no nonce by default, so a stricter `script-src 'self'` alone blanks
  every page; a nonce-based CSP is a follow-up, not implemented here). Session
  cookies are `httpOnly`, `sameSite=lax`, and `secure`/`__Secure-`-prefixed in
  production (`auth.ts`).
- BYOK keys are encrypted at rest only for the bounded window a durable job
  needs them (see "Durable execution" above); never logged, never returned in
  any API response.

## How it works

- `lib/businessFlow.ts` reads `../company/agents/registry.json` and
  `../company/workflow/business-flow.json` directly (no copy/build step —
  edit a spec in `company/` and it's picked up on next run).
- `lib/orchestrator.ts` walks the flow as a graph, not a fixed 1..N list. A
  program counter (`current_step_index`) advances through the steps, and for
  each step it runs a four-eyes chain: the Primary agent as **Creator** (same
  mapping used to generate `.claude/agents/`, full spec as system prompt),
  the step's Supporting agents as parallel **Critics**, a one-shot Creator
  **revision** folding in any `CHANGES_REQUESTED` findings, curated
  **Contributor** sub-artifacts on specific steps, and — on gate steps — an
  **Approver** (the Creator's manager) plus an **Executor** handoff to the
  next step's owner. Each call gets a rolling context window (full text of the
  last 4 artifacts, one-line summaries of everything earlier).
- After each step, `evaluateGate` decides what happens next: **advance**,
  **retry_step** (a fresh attempt on an evidence-led phase), **return_to_step**
  (jump back to a `loop_reentry_condition` target), **no_go_exit** (a gate
  recorded a No-Go), or **held** (retry/jump bounds exhausted). Every path is
  independently bounded, with a hard `MAX_TOTAL_STEP_EXECUTIONS` ceiling so no
  combination of retries/jumps can hang a run.
- `lib/providers/index.ts` dispatches to the right provider implementation
  and resolves which API key to use (`resolveApiKey`).
- Runs are persisted through `lib/runStore.ts` - PostgreSQL by default (see
  "Storage backend" above), a `runs/<id>.json` file (gitignored) only in
  explicit filesystem-fallback mode. Every read/write is `await`ed; the UI
  polls `GET /api/runs/[id]` every ~2.5s. A run's full state (program
  counter, attempts, jump counts) lives in the persisted record, so a
  **held** or **failed** run can be resumed from exactly the step it stopped
  on. The PostgreSQL backend rejects a write based on stale data
  (optimistic concurrency - see `lib/db/runRepository.ts`) rather than
  silently losing a concurrent update (e.g. a `cancel` racing the run loop).
  On the PostgreSQL backend the execution loop itself runs in the separate,
  durable `npm run worker` process (see "Durable execution" above), which
  survives a web-process restart and recovers from its own crash via lease
  expiry. Only in filesystem mode does it still run as an in-process
  background task (`lib/jobQueue.ts`), where a server restart mid-step can
  orphan a `running` run - `healIfStale` detects this on the next read and
  flips it to `failed` so it can be resumed.
- A Creator that reports `status: blocked` in its artifact-meta halts the run
  rather than continuing on a broken chain — downstream steps depend on
  upstream artifacts, so silently skipping one would corrupt everything after
  it.
- **Groq/OpenRouter max_tokens auto-correction:** models on these platforms
  enforce very different `max_tokens` ceilings - some cap in the low
  hundreds. If a request is rejected specifically for exceeding that
  ceiling, `lib/providers/openaiCompatible.ts` retries once at the exact
  limit the API reported, rather than failing the step. This keeps the run
  going, but a model capped that low will produce a noticeably shorter,
  possibly truncated artifact for that step than the same step would get on
  a larger-output model - if artifact quality/completeness matters, check
  the model's actual max output on the provider's docs and pick one with
  headroom above `LLM_MAX_TOKENS`, rather than relying on the auto-retry.

## Known simplifications (v1)

- **Integrations are mostly described, not invoked.** Except for Anthropic's
  server-side web search on evidence-led Creator calls, the tools in
  `lib/integrations.ts` are marked NOT CONNECTED and surfaced to agents as
  context only — the run produces plans/drafts/specs, it does not deploy,
  reconcile, update a CRM, or run a live experiment. A real tool-execution
  layer is a planned phase (see
  `../company/architecture/12-business-os-evolution.md`).
- **Human approval is overridden, not enforced.** Every step runs without a
  human gate even where the org design requires one — see "What 'fully
  autonomous' means here" above. Making this a selectable simulation mode with
  enforced approvals as the default is the top item in the evolution spec.
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
