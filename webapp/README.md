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

## Review workspace and exports

Every task output (Creator/Critic/Contributor/Approver/Executor, every
attempt) has a stable id and is visible at `/runs/[id]/review` -
`lib/reviewDashboard.ts` flattens `RunState.steps[].tasks[]` into one
filterable (phase/step/agent/role/confidence/evidence quality/claim type/
approval state/blocked-or-error/unresolved assumptions/review status),
full-text-searchable list, per run. Independent of the formal gate-approval
flow (`ApprovalRequest`, which only exists for Level-2+ gates and blocks
execution), any org member who can approve gates can leave a **comment**,
**assign a reviewer**, **mark reviewed**, or **request changes** on any
step's current attempt (`lib/reviews.ts`, `Comment`/`StepReview` tables) -
this never blocks the run itself. `GET /api/runs/[id]/diff?flow_step=X&to=N`
(`lib/diff.ts`) shows a line-level diff against the previous attempt.

**Exports** (`GET /api/runs/[id]/export?format=json|markdown|csv`,
`lib/exportBundle.ts`): a JSON audit bundle (full run + artifacts by step +
assumption register + decision log + evidence ledger + approval history +
comments + reviews), a human-readable Markdown summary, or a CSV artifact
index. Every export carries an explicit advisory disclaimer - see
"Known simplifications" below for what "AI-generated" vs. "human-approved"
actually means here.

## Known simplifications (v1)

- **Provenance labeling is partial.** Every artifact/task output is
  AI-generated by construction, and the UI/exports label it that way
  everywhere; a **human-approved** label exists only for Level-2+ gate
  decisions with a recorded `ApprovalRequest` (real, shown with the
  approver's identity); an **externally sourced** claim is only as
  identifiable as its `source` field (evidence ledger/assumption register).
  There is no "founder-provided" input path (nothing lets a human inject
  their own content into a run) and no "measured/validated" state (nothing
  in this app measures a real-world outcome against a claim) - both would
  need new product surfaces this pass didn't build, so exports/UI never
  claim either label for anything.
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

## Observability and operations

- **Structured logging** (`lib/logger.ts`): one JSON line per event
  (timestamp/level/message + arbitrary context) to stdout/stderr - pipe this
  into whatever log aggregator the deployment already uses (CloudWatch,
  Datadog, Loki, etc.), no app-side config needed.
- **Correlation ids**: `middleware.ts` assigns an `X-Request-Id` to every
  `/api/*` request (reusing an inbound one from a proxy/load balancer if
  present) and echoes it on the response; a run's own id is its correlation
  id across every log line the orchestrator/worker emit for it.
- **Health endpoints**: `GET /api/health/live` (process is up, no dependency
  checks) and `GET /api/health/ready` (PostgreSQL connectivity + at least one
  live worker heartbeat - see `lib/health.ts`; always `ok: true` on the
  filesystem backend, which has neither to check). Readiness returns 503
  when not ready, so a load balancer stops routing to a degraded instance.
- **Metrics**: `GET /api/metrics` (Prometheus text format, PostgreSQL-only -
  `lib/metrics.ts`) - run counts by status, run/approval-wait duration
  (sampled), job queue depth, stale-job count, provider call count/latency/
  retries/errors (last 24h), and token usage/estimated cost (last 24h).
  Computed live from persisted state on every scrape rather than kept as
  in-process counters, since execution happens in a separate worker process
  the web process's memory can't see.
- **Error tracking hook** (`lib/errorTracking.ts`): every uncaught
  orchestrator/worker error is logged structurally and, if `ERROR_WEBHOOK_URL`
  is set, POSTed as JSON to it - point this at Sentry's inbound webhook, a
  Slack/PagerDuty webhook, or a custom receiver.
- **Alertable failure conditions** - what to page on, and which metric/
  endpoint surfaces it:
  - `GET /api/health/ready` returning 503 for more than a couple of minutes
    (DB unreachable, or the entire worker fleet is down).
  - `app_job_stale_count > 0` sustained - jobs with an expired lease that
    haven't been reclaimed suggest either no worker is polling or claims are
    failing.
  - `app_job_queue_depth` growing without bound - workers aren't keeping up
    with (or aren't running against) the queue.
  - `app_provider_errors_24h` rising sharply - a provider outage or a bad
    API key/model id affecting every run.
  - Recurring `QuotaExceededError` (429s from `POST /api/runs`) for one
    organization - either legitimate growth (raise their quota) or abuse.
- **Backup and restore**: standard PostgreSQL dump/restore - the app has no
  bespoke backup format, everything durable lives in the tables Prisma
  manages.
  ```bash
  # Backup (run on a schedule, e.g. via cron/a managed DB's snapshot feature)
  pg_dump --format=custom "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M%S).dump

  # Restore into a fresh/empty database
  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backup-XXXXXXXX.dump
  # then bring the schema forward to the running code's expectations:
  npm run db:migrate
  ```
  A managed Postgres (RDS, Cloud SQL, Neon, etc.) point-in-time-recovery
  feature is the lower-effort default if available - prefer it over rolling
  your own `pg_dump` cron job when it's an option.
- **Data retention and deletion** (`lib/dataRetention.ts`): `DELETE
  /api/runs/[id]` (OWNER/ADMIN only - see `lib/authz.ts`'s `canDeleteRun`)
  permanently removes a run and everything derived from it (artifacts, its
  job, usage/provider-error events, comments, reviews) in one transaction.
  `deleteOrganizationRunData(organizationId)` (not yet wired to a route - a
  full "delete my organization" flow would also need to remove Membership/
  Organization rows, which is account lifecycle, not run data, and is out of
  scope here) deletes every run belonging to an organization the same way.
  There is no automatic time-based retention policy (e.g. "delete runs older
  than N days") - add a scheduled job calling `deleteRunData` per matching
  run id if the deployment needs one.

## Deployment

`Dockerfile` is a multi-stage build producing three targets from one image -
`web` (`node server.js`, Next's standalone output), `worker` (this app's
durable-job worker, `lib/worker/run.ts`, run via `tsx` since it isn't part of
Next's own build), and `migrate` (`prisma migrate deploy`, run once before
`web`/`worker` start). `docker-compose.yml` wires all four required pieces
(STEP 7 item 8) together - PostgreSQL, the migration step, the web process,
and the worker process:

```bash
cp .env.local.example .env.production   # fill in DATABASE_URL, AUTH_SECRET, POSTGRES_PASSWORD, provider keys
docker compose --env-file .env.production up --build
```

Verified live: the full stack (migrate → web + worker) builds and starts
cleanly, migrations apply against the containerized Postgres, `GET
/api/health/ready` reports the containerized worker's heartbeat, and signup
works end to end. Scale workers horizontally with `docker compose up --scale
worker=3` - claiming is safe across replicas (`lib/jobs/jobRepository.ts`).
Logs go to stdout/stderr as structured JSON (`lib/logger.ts`) - `docker logs`
or any log driver picks them up without extra config; nothing is written to
a file inside the container, so there's nothing to lose on a container
restart (the durable state itself lives in PostgreSQL, not the filesystem -
see "Storage backend").

This compose file is a reference for how the pieces fit together, not a
production Postgres - point `DATABASE_URL` at a managed instance (RDS, Cloud
SQL, Neon, etc.) for anything real; drop the `postgres`/`migrate` services'
Docker-local Postgres and just run `migrate`'s command once against that
instance instead.

### Production readiness checklist

- [ ] `DATABASE_URL` points at a managed, backed-up PostgreSQL instance (not
      the bundled `docker-compose.yml` Postgres).
- [ ] `AUTH_SECRET` is a long random value, different per environment, never
      committed (`openssl rand -base64 32`).
- [ ] At least one server-side provider API key is configured, or BYOK-only
      operation is an intentional product decision (instrumentation.ts warns
      but doesn't block startup either way).
- [ ] Migrations applied (`npm run db:migrate` / the `migrate` compose
      service) before `web`/`worker` start.
- [ ] At least one `worker` process is running - confirm via `GET
      /api/health/ready`'s `worker.ok`, not just that the process started.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`, and `npm audit` all
      pass (CI already enforces the first three - see `.github/workflows/ci.yml`).
- [ ] Health checks wired into the platform's load balancer/orchestrator:
      liveness → `/api/health/live`, readiness → `/api/health/ready`.
- [ ] `/api/metrics` scraped by Prometheus (or compatible) and the
      alertable conditions in "Observability and operations" above have
      actual alert rules configured.
- [ ] `ERROR_WEBHOOK_URL` points at a real receiver (Sentry/Slack/PagerDuty/
      custom), or its absence is an accepted gap for this deployment.
- [ ] A backup schedule exists for the database (managed snapshot/PITR, or
      the `pg_dump` cron documented above) and has been test-restored at
      least once.
- [ ] Rate limits and quotas (`lib/rateLimit.ts`, `lib/quotas.ts`) reviewed
      against expected real-world traffic/budget, not just the defaults.
- [ ] Security headers/CSP (`next.config.mjs`) reviewed if the deployment
      adds any third-party script/style/font - the current CSP has no
      external origins allow-listed.

### Dependency audit

`npm audit` currently reports **0 vulnerabilities**. Next.js's bundled
`postcss` and Prisma CLI's transitive `deepmerge-ts`/`effect` (used only by
`@prisma/client`'s config-loading, a devDependency - never in the runtime
bundle) had known advisories; `package.json`'s `overrides` field pins all
three to patched versions without bumping Next or Prisma themselves (both
verified compatible - full test suite, typecheck, build, and a live
Docker deployment all still pass). Re-run `npm audit` after any dependency
bump; if a future advisory can't be resolved via `overrides` and genuinely
requires a breaking upgrade (e.g. Next 16), document the accepted risk and
mitigation here rather than blindly running `npm audit fix --force`.

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
