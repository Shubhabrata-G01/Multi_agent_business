# Business Operating-System Evolution

**Status:** Design spec (proposed). No code in this doc is built yet — this is the
reviewable target the implementation phases are measured against.

**Thesis.** Today this project is a very good *runner of one fixed 81-step
software/SaaS company flow*. The evolution turns it into a **business
operating-system generator**: from an idea, classify the business, compose a
validated workflow graph from reusable templates and capability packs, wake only
the agents that graph needs, and execute it under an explicit human-approval
policy — with the current 81-step flow preserved intact as the first template,
`software-saas-v1`.

Nothing here throws away the existing engine. It renames the assumptions the
engine currently hardcodes (one flow, no approvals, all agents) into *inputs*,
so that new flows, packs, and safety modes become additions rather than surgery.

---

## 1. What is kept, and why it makes this cheaper than it looks

The engine already contains three seams that make this an evolution, not a
rewrite. Grounding, with file references:

1. **The traversal engine is already a graph state machine.** `evaluateGate`
   ([orchestrator.ts:779](../../webapp/lib/orchestrator.ts)) plus the
   `current_step_index` program counter (:1280–1305) already do advance /
   retry-in-place / return-to-step / no-go-exit / hold with independently
   bounded counters and a hard `MAX_TOTAL_STEP_EXECUTIONS` ceiling. **We do not
   build an executor.** We change what list of nodes it walks.

2. **Routing is already data-driven off the registry.**
   `getPrimaryAgentsForStep` / `getSupportingAgentsForStep`
   ([businessFlow.ts:65](../../webapp/lib/businessFlow.ts)) resolve agents from
   `registry.json`'s `flow_primary_steps` / `flow_supporting_steps`, not from
   hardcoded switch statements. Capability routing is an *evolution of this
   lookup*, not a greenfield build.

3. **Evidence, four-eyes, and gate decisions already exist as typed data.**
   `ArtifactMeta` ([types.ts:83](../../webapp/lib/types.ts)), the
   creator/critic/approver/executor/contributor `TaskRole` split, and
   `GateAction` are all present and persisted. The evidence framework (P1) is
   mostly *enforcement and validation* on top of a schema that is already here.

What the engine hardcodes today, that this spec turns into inputs:

| Hardcoded today | Where | Becomes |
|---|---|---|
| One global flow, always | `getFlowSteps()` → `initRun` slice ([orchestrator.ts:848](../../webapp/lib/orchestrator.ts)) | `run.config.roadmap`, selected/generated per run |
| "Do not pause for approval" for every agent | `runtimeNotice` ([orchestrator.ts:227](../../webapp/lib/orchestrator.ts)) | conditional on `run.config.mode === "simulation"`; **default is enforced approvals** |
| All 38 agents available, reviewers by reverse-map | `getSupportingAgentsForStep` | capability router selects the pack the roadmap declares it needs |
| Integrations are prompt text (`connected:false`) | [integrations.ts](../../webapp/lib/integrations.ts) | tool registry with scopes, execution policy, audit (later phase) |
| Run state in `runs/*.json`, fire-and-forget loop | `runStore` + `startRun(...).catch()` ([orchestrator.ts:1354](../../webapp/lib/orchestrator.ts)) | DB-backed state + durable queue/worker (later phase) |

---

## 2. Target operating model

```text
Idea
  → Discovery / classification            (LLM-led structured intake)
  → BusinessProfile + risk assessment      (typed, stored)
  → Select base template + industry packs  (capability router seeds candidates)
  → Compose + validate workflow graph       (Roadmap of WorkflowNodes) + cost estimate
  → Founder approves / edits the Roadmap     (control panel; assumptions, budget, geo, mode)
  → Orchestrator walks the Roadmap           (existing evaluateGate engine)
      · each node routes to selected capability agent(s)
      · agents create artifacts, request approvals, (later) invoke scoped tools
  → Evidence, decisions, risks, metrics update shared memory
  → Roadmap adapts from validated results    (return_to_step / retry already exist)
```

The founder is the standing Level 3/4 authority from
[05-permissions-and-hitl.md](05-permissions-and-hitl.md). This spec does not
weaken that policy — it makes the runtime *enforce* it by default, where today
the runtime explicitly overrides it.

---

## 3. Core concepts and schemas

These are additive to [types.ts](../../webapp/lib/types.ts). Existing
`FlowStepDef`, `RegistryAgent`, `ArtifactMeta`, `StepResult`, `PathEntry`,
`RunState` are unchanged in shape except where noted (`RunState` gains a
`config`, and steps gain an optional `node_id` back-reference).

### 3.1 Execution mode — the safety switch (P0)

```ts
// The single most important change. Today the runtime hardcodes "simulation"
// behavior and calls it production. This names the two modes and defaults to
// the safe one.
export type ExecutionMode =
  | "simulation"   // agents may decide in place where a human normally would;
                   // NO real-world tool side effects; output is plans/drafts only.
  | "assisted";    // approval-gated: Level 2+ actions (05-permissions-and-hitl.md)
                   // produce an ApprovalRequest and HOLD until a human resolves it.

// Real, unattended external execution is deliberately NOT a mode yet
// (see §7 Non-goals). "assisted" is the production default.
```

`runtimeNotice` ([orchestrator.ts:218](../../webapp/lib/orchestrator.ts)) is
edited so the "do not defer to a human / do not pause for approval" paragraph is
emitted **only** when `mode === "simulation"`. In `assisted` mode the same
notice tells the agent to raise an `ApprovalRequest` at any Level 2+ gate and
stop.

### 3.2 RunConfig — what a run is parameterized by (P0)

```ts
export interface RunConfig {
  mode: ExecutionMode;            // default "assisted"
  roadmap: Roadmap;               // the graph this run walks (see §3.4)
  budget: {
    max_total_tokens: number;     // today's MAX_RUN_TOTAL_TOKENS, now per-run
    max_total_executions: number; // today's MAX_TOTAL_STEP_EXECUTIONS, per-run
    max_usd?: number;             // optional hard cost cap once cost model lands
  };
  enabled_tool_scopes: string[];  // names from the tool registry this run may use;
                                  // empty in simulation. (Later phase.)
}
```

`RunState` gains `config: RunConfig`. `initRun`
([orchestrator.ts:841](../../webapp/lib/orchestrator.ts)) takes a `RunConfig`
instead of building steps from the global flow; `executeRun` reads
`run.config.roadmap` instead of `getFlowSteps()`. **Backward compatibility:** a
run created with no config is given a default config whose roadmap is
`software-saas-v1` and whose mode is `simulation` — i.e. exactly today's
behavior — so every existing `runs/*.json` still loads and resumes.

### 3.3 BusinessProfile — the classifier output (P0)

```ts
export interface BusinessProfile {
  idea: string;                         // raw input, preserved verbatim
  industry: string;                     // e.g. "b2b-saas", "marketplace", "fintech-lending"
  business_model: string;               // subscription, transactional, services, etc.
  geography: string[];                  // markets in scope (drives regulatory packs)
  customer: string;                     // who pays, in one line
  maturity: "idea" | "prototype" | "launched" | "scaling";
  capital_intensity: "low" | "medium" | "high";
  risk_flags: RiskFlag[];               // what makes this NOT plain SaaS
  constraints: string[];                // founder-stated limits (budget, timeline, no-fundraise, ...)
  confidence: "high" | "medium" | "low";// how sure the classifier is; low → more intake questions
  open_questions: string[];             // what the intake still needs from the founder
}

export interface RiskFlag {
  kind: "regulatory" | "payments" | "health-data" | "physical-safety"
      | "financial-custody" | "employment" | "ip" | "other";
  detail: string;
  suggested_pack: string;               // capability pack id this flag activates (§3.5)
}
```

The classifier is an LLM call with `BusinessProfile` as its typed output schema,
validated the same deterministic way `ArtifactMeta` is
([artifactMeta.ts](../../webapp/lib/artifactMeta.ts) is the pattern to copy:
parse → validate → record what was changed, never a silent rewrite).

### 3.4 Roadmap and WorkflowNode — the composed graph (P0)

A `WorkflowNode` is a superset of today's `FlowStepDef`: it keeps every field
`FlowStepDef` has (so `software-saas-v1` maps 1:1 with zero data loss) and adds
the fields the router, gates, and evidence framework need.

```ts
export interface WorkflowNode {
  id: string;                     // stable within a roadmap, e.g. "saas.market-validation.05"
  business_phase: string;         // unchanged from FlowStepDef
  activity: string;
  // --- routing inputs (replace the free-text primary_role/supporting_roles) ---
  required_capabilities: string[];// capability ids the node needs (§3.5)
  reviewer_capabilities: string[];// who critiques it
  risk_level: 0 | 1 | 2 | 3 | 4;  // maps to 05-permissions-and-hitl.md HITL levels
  // --- artifact contract ---
  output_artifact: string;
  artifact_schema?: string;       // id of a required output shape, when one applies
  done_gate_criteria: string;
  is_gate: boolean;               // precomputed, not re-regexed each run (isGateStep today)
  evidence_led: boolean;          // precomputed EVIDENCE_LED_PHASES membership
  // --- graph edges ---
  depends_on: string[];           // node ids that must be "done" first
  loop_reentry_target?: string;   // node id, replacing parseReturnToStep's text scrape
  // --- tools (later phase) ---
  allowed_tools?: string[];       // tool-registry ids this node may invoke, if any
}

export interface Roadmap {
  template_id: string;            // e.g. "software-saas-v1" or "composed:<hash>"
  packs: string[];                // capability packs merged in (§3.5)
  nodes: WorkflowNode[];          // topologically walkable; the engine's input
  generated_from?: BusinessProfile; // null for a static template loaded as-is
  cost_estimate?: CostEstimate;   // filled by the planner before founder approval
}
```

A **RoadmapTemplate** is just a `Roadmap` with `generated_from` unset, shipped in
the repo. `software-saas-v1` is produced by a one-time adapter that reads today's
`business-flow.json` and emits `WorkflowNode[]` — verified by a test that the
adapted node list reproduces the current run's step sequence exactly.

### 3.5 Capability and packs — routing (P1, seeded in P0)

```ts
export interface Capability {
  id: string;                     // e.g. "market-validation", "regulatory-compliance"
  agent_ids: string[];            // registry agents that can serve this capability
  risk_ceiling: 0 | 1 | 2 | 3 | 4;// highest risk this capability may own unassisted
}

// A pack is a named bundle of capabilities + the nodes they contribute to a
// roadmap. Activated only when the classifier's risk_flags call for it.
export interface CapabilityPack {
  id: string;                     // "fintech", "marketplace", "regulated-health", ...
  capabilities: Capability[];
  nodes: WorkflowNode[];          // phase-tagged nodes merged into the base lifecycle
  activation: string;             // human-readable rule; matched against RiskFlag.suggested_pack
}
```

The **router** replaces static step→agent lookup with capability matching: given
a `WorkflowNode.required_capabilities` and the run's active packs, it selects the
available agent(s), honoring `risk_ceiling` (a capability may not own a node
whose `risk_level` exceeds its ceiling — that node escalates instead). In P0 the
router is a thin pass-through that reproduces today's registry mapping; packs and
real matching arrive in P1.

### 3.6 ApprovalRequest — enforced HITL (P0, paired with mode)

```ts
export interface ApprovalRequest {
  id: string;
  run_id: string;
  node_id: string;
  level: 2 | 3 | 4;               // from the node's risk_level
  summary: string;                // what the agent wants to do
  artifact_ref: string;           // the prepared artifact awaiting the gate
  status: "pending" | "approved" | "rejected";
  decided_by?: string;            // "founder" | agent id holding the APPROVE grant
  decided_at?: string;
  reason?: string;
}
```

In `assisted` mode, reaching a Level 2+ node produces an `ApprovalRequest` and
sets the run to `held` (a status the engine already has and can resume from). The
founder resolves it in the control panel; resume continues from that node. This
reuses the entire existing held/resume machinery — no new run lifecycle.

### 3.7 Evidence — first-class, not just a claim label (P1)

Today evidence lives inside `ArtifactMeta.claims`. The evidence framework
promotes source-backed claims to queryable records so later nodes and the memory
layer can cite them:

```ts
export interface Evidence {
  id: string;
  run_id: string;
  node_id: string;
  claim_type: ClaimType;          // reuse existing taxonomy (types.ts)
  text: string;
  source: string | null;          // real URL/citation; null is itself a finding
  strength: "cited" | "asserted" | "assumed";
  captured_at: string;
}
```

`validateArtifactMeta` already downgrades unsourced FACTs; the evidence framework
adds (a) extraction of claims into `Evidence` records, (b) an evaluation check
that a gate node cannot pass with an asserted-as-fact-but-unsourced claim in its
critical path, and (c) regression suites over these checks.

---

## 4. Module boundaries

New files (all under `webapp/lib/`, matching the flat existing layout):

```text
webapp/lib/
  types.ts               (EDIT: add ExecutionMode, RunConfig, BusinessProfile,
                          WorkflowNode, Roadmap, Capability, CapabilityPack,
                          ApprovalRequest, Evidence; RunState gains `config`)
  classifier.ts          (NEW: idea → BusinessProfile, LLM + deterministic validation)
  roadmap.ts             (NEW: load templates, compose packs, validate the graph,
                          topological check, cost estimate)
  templates/
    software-saas-v1.ts  (NEW: adapter from business-flow.json → WorkflowNode[])
  router.ts              (NEW: WorkflowNode + active packs → selected agent(s);
                          wraps today's getPrimaryAgentsForStep in P0)
  approvals.ts           (NEW: create/resolve ApprovalRequest; persistence)
  evidence.ts            (NEW, P1: extract + evaluate Evidence)
  orchestrator.ts        (EDIT: initRun/executeRun take RunConfig; runtimeNotice
                          gates the autonomy paragraph on mode; Level 2+ nodes
                          raise approvals in assisted mode)
  businessFlow.ts        (EDIT: getFlowSteps stays for the adapter; node lookups
                          move to reading run.config.roadmap)
```

Persistence stays file-based in P0 (a `profiles/` and `approvals/` sibling of
`runs/`), swapped for a DB in the reliability phase without touching call sites,
exactly as `runStore` isolates that today.

---

## 5. Migration path — phased, each phase shippable and reversible

**Every phase keeps existing `runs/*.json` loadable and every existing test
green. No phase is merged without tests.**

| Phase | Deliverable | Safety/compat guarantee |
|---|---|---|
| **0a** ✅ **APPLIED 2026-09-14** | `ExecutionMode` (`simulation`/`assisted`) added to `types.ts`; `runtimeNotice` in `orchestrator.ts` branches the autonomy paragraph on it; `mode` threaded through `startRun`/`initRun`/every `build*SystemPrompt` and persisted on `RunState`; API route defaults new runs to `assisted`; the home-page form has a mode selector and the copy no longer hardcodes "no approval gates". Verified: `tsc --noEmit` clean, `next build` green. | Pure conditional; a run with no mode on disk defaults to `simulation` (`runMode()`), so existing `runs/*.json` behave exactly as before. Hard enforcement (run pause + `ApprovalRequest`) is still Phase 1c — in 0a the runtime notice is the control. |
| **0b** ✅ **APPLIED 2026-09-14** | `WorkflowNode`/`Roadmap`/`RunConfig` in `types.ts`; `lib/templates/softwareSaasV1.ts` adapts the 81-step flow into a roadmap; `initRun` builds steps from `roadmap.nodes` and attaches a `RunConfig`; `executeRun` walks `run.config.roadmap` (legacy runs fall back to the global flow); budget ceilings read from `config.budget`. First project-owned tests added via **vitest** (`npm test`): 17 passing — adapter fidelity, `evaluateGate` decisions, mode branching. | `WorkflowNode extends FlowStepDef`, so the engine reads the same fields; the adapter-fidelity test asserts node sequence, gate/evidence flags, and primary/reviewer mappings reproduce the helpers exactly. Verified: `tsc` clean, `next build` green. |
| **0c** ✅ **APPLIED 2026-09-14** | `BusinessProfile`/`RiskFlag` types; [lib/classifier.ts](../../webapp/lib/classifier.ts) turns an idea into a typed profile (deterministic parse/validate, never throws — zod `.catch` coercion + a low-confidence default); `POST /api/classify` classifies; the home page has an optional "Preview business profile" step that shows industry/model/risks/open-questions before the run, and the profile is attached to the run (`RunState.profile`). | Intake is **optional** — the direct "just run it" path is preserved (profile omitted). Profile is informational today; a future planner (1a/1b) uses it to compose a per-idea roadmap and activate packs. 10 classifier tests; `tsc` + `next build` green. |
| **1a** ✅ **APPLIED 2026-09-14** | [lib/router.ts](../../webapp/lib/router.ts) resolves each node's Creator + reviewers from its own `required`/`reviewer_capabilities` (so pack-injected nodes get agents, not just registry-mapped ones; four-eyes enforced; legacy fallback to the flow maps); `executeRun` now routes critics through it. [lib/packs.ts](../../webapp/lib/packs.ts) defines capability packs (fintech, regulated-health, marketplace) and `composeRoadmap(base, profile)` merges a pack's nodes in only when a `risk_flag` activates it; `startRun` composes the per-run roadmap from the profile. The §7.2 **operational-ownership-floor** check (deferred from that section) is now implemented. | Packs activate **only** on a `RiskFlag`; a plain-SaaS profile (or none) yields exactly `software-saas-v1`. Composed roadmaps pass the integrity guard (asserted). Now also includes the first non-SaaS base template, [lib/templates/servicesV1.ts](../../webapp/lib/templates/servicesV1.ts) (a compact, real services/agency lifecycle that gives Operations a primary node), selected by [lib/roadmap.ts](../../webapp/lib/roadmap.ts)'s `selectBaseTemplate` from the profile's business model. `tsc` + `next build` green. |
| **1b** ✅ **APPLIED 2026-09-14** | Capability packs: fintech, regulated-health, marketplace, and **physical-product/commerce**, each activated only by a matching `RiskFlag`/kind. The §7.2 **distinct-capability-KPI** check is now implemented too, backed by [lib/capabilityKpis.ts](../../webapp/lib/capabilityKpis.ts) (one distinct metric per capability). | Packs activate only on a `RiskFlag`; a plain SaaS idea gets exactly `software-saas-v1`. Base roadmap asserts zero KPI-redundancy findings (the mechanical form of the P1 fixes). |
| **1c** ✅ **APPLIED 2026-09-14** | `ApprovalRequest` type + `RunState.approvals`; in assisted mode a Level-2+ (gate) node that would advance instead raises a pending request and holds; `decideApproval` (approve → advance past the gate; reject → bump attempt + rework) resumes the run; `POST /api/runs/[id]/approvals` resolves one; the run page shows an Approve/Reject panel with a reason field and reuses the key modal. An idempotent re-hold guard + a `resumeRun` pending-approval guard keep a stray resume from duplicating or re-running the step. | Reuses held/resume; Level 2+ in assisted mode now HOLDS for a human instead of overriding. 8 tests on the pure gate predicate/lookups; `tsc` + `next build` green. Full hold→approve→resume cycle not exercised by a live run (billed API). |
| **1d** ✅ **APPLIED 2026-09-14** | The evaluation gates already shipped (§7.1 claim-source + medium validators). This adds [lib/evidence.ts](../../webapp/lib/evidence.ts): `extractEvidence` promotes each step's CITED claims (post-validation) into a run-level `RunState.evidence` citation ledger, wired into `executeRun`. The growing vitest suite (112 tests) is the regression suite. | Additive to `validateArtifactMeta`; gates only *tighten*. Only sourced claims are promoted, so the ledger is a citation trail, not a duplicate of every claim. |
| **2b** ◐ **SEAM APPLIED** | [lib/jobQueue.ts](../../webapp/lib/jobQueue.ts): a per-run serial job queue that `startRun`/`resumeRun` enqueue through, so a single run can never have two overlapping `executeRun` loops (different runs stay concurrent). This is the swap point for a durable broker. | **Durability itself** (surviving a process restart) still needs an external broker + DB (below) and is deferred — this in-process version delivers the seam and per-run serialization without new infra. 3 queue tests. |
| **2a** ○ **DEFERRED (seam identified)** | DB-backed run/profile/approval/evidence state. The storage seam is `runStore` (load/save/list); everything the run needs is already on `RunState` and persisted there. | A real DB (durability + concurrency) needs infra/credentials not available in this session; deferred deliberately. `healIfStale` remains the interim guard against orphaned runs. |
| **2c** ✅ **LAYER APPLIED (no live connectors)** | [lib/tools.ts](../../webapp/lib/tools.ts): a tool registry with permission scopes, an audit trail, and `invokeTool` that is **safe by construction** — unknown → refused; simulation mode → every side-effecting tool refused; scope not enabled → refused; scope enabled → **dry-run only** (no connector is wired, so nothing real executes). | Matches the non-goal: no CRM/payment/email/deploy/banking is connected. The enforcement layer exists and is tested (6 tests); wiring live connectors + an agent tool-calling loop is future work behind assisted-mode approvals. |

---

## 6. Test plan (there are zero project-owned tests today)

The first tests land in Phase 0b and are a precondition for every later phase:

- **Adapter fidelity:** `software-saas-v1` node sequence, gate flags, evidence-led
  flags, and reviewer sets exactly reproduce the current `business-flow.json`
  run. This is the safety net proving the refactor changed nothing observable.
- **Gate decisions:** unit tests over `evaluateGate` for advance / retry /
  return-to-step / no-go / hold, including bound exhaustion — pure function,
  trivially testable, currently untested.
- **Mode enforcement:** in `assisted` mode, a Level 2+ node produces an
  `ApprovalRequest` and holds; in `simulation` it does not. Assert the runtime
  notice text branches correctly.
- **Roadmap validation:** cyclic `depends_on`, dangling `loop_reentry_target`,
  and unknown `required_capabilities` are rejected before any run starts.
- **Classifier validation:** `BusinessProfile` with an unsourced FACT-style
  over-claim is downgraded; low confidence yields `open_questions`.
- **Recovery:** `healIfStale` + resume from a held approval both round-trip.

---

## 7. Deterministic validation and integrity gates (closing the self-reporting gap)

The single most important thing the 12-sector evaluation surfaced that §1–§6 did
**not** cover: gate decisions today lean on creator-provided metadata and critic
opinion, with almost no deterministic checking against source systems, the tool
registry, policy, or budget. That is what let a real integrity violation ship
undetected — [PERF-001.md:291](../../company/agents/growth-marketing/PERF-001.md)
labels `measured_cac: "$55 (FACT — reconciled against ad-platform spend export…)"`
in the *same file* whose Required Integration block ([:92](../../company/agents/growth-marketing/PERF-001.md))
says the ad platform is not connected. No human or LLM caught it; a machine check
would have, instantly.

This layer adds validators that run **before** any creator metadata is trusted.
They only ever tighten a gate — never loosen one (§8 invariant).

### 7.1 Run-time validators (per artifact, before a gate can pass)

1. **Claim–source consistency.** ✅ **APPLIED 2026-09-14.** For every `Claim`
   whose `source` names a tool or connector, that connector must be marked
   CONNECTED *for this specific call* in the tool registry
   ([integrations.ts](../../webapp/lib/integrations.ts), which already tracks
   per-call connectivity). If it is not, the claim is auto-downgraded
   (FACT→ASSUMPTION), recorded in `validation_notes`, and raised as an
   **integrity violation**. A gate node cannot pass with an unresolved integrity
   violation. *Directly kills the PERF-001 class.* Implemented as
   [lib/claimSourceValidator.ts](../../webapp/lib/claimSourceValidator.ts) (pure,
   FACT-only so honestly-labeled estimates are untouched), wired into
   `executeRun` on the final creator meta, and fed into `evaluateGate` (an
   unresolved violation on a gate/evidence step retries for real evidence within
   the bound, then holds). 13 tests cover it (`npm test`), including the exact
   PERF-001 case and proof the corrected estimate does not trip.

2. **Done-criteria ↔ medium consistency.** ✅ **APPLIED 2026-09-14.** Each node
   carries a `required_medium` tag (`document` | `live-prototype` | `deployed` |
   `telemetry` | `external-record`), inferred from the step's own done-criteria
   text by [lib/mediumValidator.ts](../../webapp/lib/mediumValidator.ts) and set
   on every `WorkflowNode` by the adapter. If the run can't produce that medium
   (no matching tool scope — the default today), `executeRun` watermarks the
   artifact *"Validated at document level, not operationally"* and adds a
   `validation_notes` entry. Non-blocking (every flow has deploy/test steps the
   app can't execute; watermarking makes them honest instead of halting the run).
   *Kills the DES-001 class (usability-testing DoD on a static fallback) and the
   "artifact generation mistaken for operational completion" finding (ChatGPT #3).*
   12 tests, including the DES-001 usability case.

3. **Policy validator.** ✅ **APPLIED 2026-09-14** (Phase 1c). In `assisted` mode,
   a node whose `risk_level` ≥ 2 (a gate) cannot self-advance regardless of
   creator/critic verdicts — the orchestrator raises a pending `ApprovalRequest`
   and holds (§3.6), and only `decideApproval` (approve/reject) moves it. This
   makes the HITL policy an enforced runtime check, not just a prompt request.

4. **Budget validator.** Extends today's run-wide token/execution ceilings with a
   per-node cost cap and the optional `RunConfig.budget.max_usd`, checked before
   dispatching a node rather than only after.

### 7.2 Compose-time integrity checks (before the founder approves a roadmap)

✅ **APPLIED 2026-09-14** (structural subset) as
[lib/roadmapIntegrity.ts](../../webapp/lib/roadmapIntegrity.ts), run as a
compose-time guard in `startRun` (errors refuse the run; warnings surface).
Implemented: **single primary owner** (error if none, warning if >1 — flags the
Step-62-style silent-drop), **four-eyes** (a primary may not review its own
artifact), **known capabilities** (every id resolves), **graph refs** (depends_on
+ loop targets point at real nodes/steps), and **named integrator per domain**
(warns only when a team's agents report to two-plus different heads with none
managing another — isolates the Legal/Security GC↔SEC gap and correctly does
*not* flag Operations/Finance/Design, which share one head); and, added in Phase
1a, **operational-ownership floor** (Finance/People/Operations/Sales must each own
a primary node — warns exactly Operations on the base roadmap, its "clearest weak
sector" finding); and **distinct capability success metric** (Phase 1b, backed by
[lib/capabilityKpis.ts](../../webapp/lib/capabilityKpis.ts) — every node-owning
capability must declare its own metric and no two may share one, the mechanical
form of the P1 CFO/FPA, CPO/PA, COO/BOM fixes). All four §7.2 checks are now
implemented. Assertions run against the live roadmap.

These run as roadmap validation (§4) and reject or flag a roadmap the composer
produced with a structural defect:

- **Single primary owner per node.** Two capabilities may not both hold primary
  ownership of the same node. *Kills Step 62 (EM-001 + PM-001 both primary —
  verified in `registry.json`), the CMO/PMM "positioning" overlap, and the
  COO/BOM overlap.*
- **Distinct capability success metric.** Every capability that owns ≥1 node must
  declare its own success metric, not one inherited from another capability's
  dashboard. *Kills the KPI-redundancy pattern (CEO's gameable single KPI, CPO
  inheriting PA's dashboard, CFO/FPA running the same four KPIs).*
- **Named integrator per domain.** Every domain in the roadmap resolves to exactly
  one accountable head; a domain whose nodes split across two peers with no named
  integrator is flagged. *Kills the Legal/Security gap (GC→CEO, SEC→CTO, privacy
  compliance owned by neither).*
- **Operational-sector ownership floor.** Finance, People, Operations, and Sales
  must hold *primary* ownership of the operational nodes in their domain, not
  appear only as supporting reviewers. *Kills "operational sectors are
  structurally secondary" (ChatGPT #6).*

All of these are pure functions over the roadmap and the registry — cheap,
deterministic, and unit-testable (added to the §6 suite).

## 8. Non-goals and safety invariants (explicit, load-bearing)

These are constraints on the whole build, not just current scope:

- **No new mode for unattended real-world execution.** `assisted` is the
  production ceiling. Fund transfers, contract execution, production releases,
  regulated filings, hiring, and customer outreach remain
  human-decided/approved per [05-permissions-and-hitl.md](05-permissions-and-hitl.md)
  Levels 3–4. Simulation performs **no** external side effects at all.
- **`simulation` is never the production default and is never silent.** It is a
  labeled choice; any artifact produced in it is watermarked as such so a plan
  drafted in simulation is never mistaken for an approved one.
- **No hundreds of permanent "atomic agents."** Atomic work is a
  `WorkflowNode` served by a selected capability agent, not a new persistent
  registry entry.
- **Packs are opt-in by classifier evidence.** Fintech/health/etc. capabilities
  never load globally; a plain SaaS idea must still yield exactly
  `software-saas-v1` with no extra agents woken.
- **The 81-step flow is preserved, not replaced.** It ships as
  `software-saas-v1` and every phase keeps it runnable.
- **Gates only tighten.** No phase may make the evidence/approval bar lower than
  it is today for any node.

---

## 9. Open decisions for the founder (before Phase 0 code)

1. **Default mode in the UI:** `assisted` (approval-gated) as the visible default,
   with `simulation` a clearly-labeled toggle — recommended — vs. keeping
   `simulation` default during early development.
2. **Where per-run state lives in P0:** stay file-based (fastest to ship, matches
   `runStore`) and migrate in Phase 2a — recommended — vs. go DB-first now.
3. **First non-SaaS template to build in Phase 1a:** services/agency (lowest risk,
   validates the composition machinery) — recommended — vs. marketplace.
4. **Cost model source:** per-provider token pricing table maintained in-repo vs.
   deferring `max_usd` enforcement until a pricing source is wired.

---

## 10. Traceability — how this maps to the 12-sector evaluation

The dual (Claude + ChatGPT) evaluation of the 38-agent spec found two distinct
classes of problem. This doc closes the *platform* class; the *content* class is
tracked separately in [13-agent-spec-remediation.md](13-agent-spec-remediation.md).

| Evaluation finding | Class | Addressed by |
|---|---|---|
| Unsafe autonomy contradiction (HITL bypass) | Platform | §3.1 mode, §3.6 approvals, §7.1(3) policy validator |
| No real operating integrations | Platform | §3.2 tool scopes, §5 Phase 2c |
| Artifact mistaken for operational completion | Platform | §7.1(2) done-criteria ↔ medium validator |
| Weak durable runtime (orphaned runs) | Platform | §5 Phases 2a/2b |
| LLM self-reporting a weak control | Platform | §7 (whole section) — deterministic validators |
| Operational sectors structurally secondary | Platform | §7.2 ownership floor |
| PERF-001 FACT/ad-platform integrity violation | Both | §7.1(1) validator *enforces*; [13](13-agent-spec-remediation.md) *fixes the file* |
| Step 62 double-primary; COO/BOM & CMO/PMM overlap | Both | §7.2 single-owner check *enforces*; [13](13-agent-spec-remediation.md) *fixes* |
| KPI redundancy (CEO/CPO/CFO-FPA) | Both | §7.2 distinct-metric check *enforces*; [13](13-agent-spec-remediation.md) *fixes* |
| DES-001 done-criteria vs. static medium | Both | §7.1(2) *enforces*; [13](13-agent-spec-remediation.md) *fixes* |
| Legal/Security has no single head | Both | §7.2 named-integrator check *enforces*; [13](13-agent-spec-remediation.md) *fixes* |
| CEO/CPO weak KPIs; GC-001 names no framework; CFO tax/SaaS-metrics; EM "people" half empty; UXR method-selection; "competency matrix" undefined; HR reconciliation; IT MDM/SSO specifics; DR/PII-masking ownership; README staleness | Content | [13-agent-spec-remediation.md](13-agent-spec-remediation.md) |

**Reading the table:** "Platform" findings are fully closed by this doc's design.
"Both" findings get a *mechanical guardrail here* (so the defect cannot recur or
ship silently) **and** a *one-time content fix* in doc 13. "Content" findings are
pure spec-quality defects the platform cannot auto-fix; they are a tracked
editing backlog in doc 13, each tagged with whether a §7 validator will keep it
fixed afterward.
```
