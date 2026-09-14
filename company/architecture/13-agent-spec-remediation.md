# Agent-Spec Remediation Register

**Status:** Backlog (tracked, not yet applied). This is the *content* half of the
12-sector evaluation — concrete defects **inside the 38 agent markdown specs and
`registry.json`** that the platform evolution ([12-business-os-evolution.md](12-business-os-evolution.md))
cannot fix by itself because they are wrong or thin *content*, not runtime
behavior.

Each item names the file, the specific fix, and — where applicable — the §7
validator in doc 12 that will **keep it fixed** (fail the build/run if it
regresses) once implemented. Items marked **[verified]** were checked directly
against the repo in this analysis; the rest are transcribed from the dual
evaluation and should be confirmed against the file before editing.

**Provenance:** findings are from the Claude + ChatGPT evaluation of the role
matrix. This register does not re-adjudicate them; it makes them actionable.

---

## Priority 0 — integrity / correctness (fix first)

**Status: APPLIED 2026-09-14.** All three items below are done. Item 1 relabeled
the PERF-001 example claim; item 2 moved step 62 to a single primary (PM-001)
across `registry.json`, `EM-001.md`, `PM-001.md`, and `business-flow.json`; item 3
rewrote the stale README execution description. JSON files re-validated. The
guardrails named in the right-hand column are not built yet (doc 12 §7), so these
fixes are currently held by review discipline, not machine checks.

| # | File | Defect | Fix | Guardrail |
|---|---|---|---|---|
| 1 | `growth-marketing/PERF-001.md` (:291, :92) | **[verified]** Example output labels `measured_cac "$55 (FACT — reconciled against ad-platform spend export…)"` while the same file's Required Integration says the ad platform is NOT connected. A fabricated-provenance FACT. | Relabel the example claim ESTIMATE/ASSUMPTION with `source: null` (or a document-level source), matching the file's own disclosed connectivity. Audit every other example claim in the file the same way. | §7.1(1) claim–source consistency |
| 2 | `registry.json` (EM-001, PM-001) | **[verified]** Both list `"62"` (Iteration) in `flow_primary_steps` — an ownership collision with no split of who does what. | Assign step 62 a single primary (PM-001 owns the iteration decision; EM-001 supporting for delivery), or split into two nodes with distinct artifacts. | §7.2 single-primary-owner |
| 3 | `webapp/README.md` (:98) | **[verified]** "Known simplifications (v1): One call per step… Supporting/Reviewing agents… not separately invoked" — stale; the orchestrator now runs creator→parallel critics→revision→approver/executor. | Update the section to describe the real four-eyes execution. Doc-only, but it is the one place the codebase *understates* itself. | — (doc hygiene) |

## Priority 1 — ownership overlaps and KPI redundancy

**Status: APPLIED 2026-09-14.** Items 4–8 done. Each capability now has a distinct,
non-inherited headline metric and a single owner for the contested scope: COO owns
the operating-cadence framework + cross-exec dependency resolution (BOM owns
per-workflow SOPs/coverage); PMM owns positioning (CMO approves); CFO owns the
board/plan view (FPA owns modeling/forecast-accuracy); CPO owns PMF signal strength
directly; CEO's KPIs now carry targets and add board/cap-table/OKR-cascade
ownership. These will later be enforced by the §7.2 compose-time integrity checks
(doc 12); until then they hold by review discipline.

| # | File(s) | Defect | Fix | Guardrail |
|---|---|---|---|---|
| 4 | `executive/COO-001.md`, `operations/BOM-001.md` | COO output is largely "sponsor what BOM already produced"; heavy overlap. | Either merge into one capability or give COO distinct company-wide operating-cadence ownership that BOM executes under. | §7.2 single-primary-owner |
| 5 | `growth-marketing/CMO-001.md`, `PMM-001.md` | Unresolved overlapping ownership of "positioning." | Assign positioning to one (PMM owns messaging/positioning; CMO owns demand/budget). | §7.2 single-primary-owner |
| 6 | `executive/CFO-001.md`, `finance/FPA-001.md` | Same four KPIs (gross margin, burn, runway, LTV:CAC) — duplication, not complementary. | CFO owns targets/board view; FPA owns the model/variance. Give each a distinct headline metric. | §7.2 distinct-metric |
| 7 | `executive/CPO-001.md` | No independent executive KPI — inherits PA-001's dashboard. | Define a product-outcome KPI CPO owns (e.g. PMF score, activation, retention cohort). | §7.2 distinct-metric |
| 8 | `executive/CEO-001.md` | Only KPI is "% of decisions where actual outcome matched expected" — no target, gameable. No board/cap-table/OKR mechanics. | Add a concrete target and add board/investor-management + OKR-cascade responsibilities. | §7.2 distinct-metric |

## Priority 2 — missing frameworks / undefined terms (the "soft function" gap)

**Status: APPLIED 2026-09-14.** Items 9–20 done. GC-001 now names concrete legal
frameworks and is the privacy integrator (SEC-001 reciprocally scoped to technical
controls); the competency matrix and a leveling/market-percentile comp framework are
defined once in HRH-001 with a single shared requisition record (TA-001 points to it);
EM-001 has an explicit People responsibility; DEVOPS-001 owns DR/BCP end-to-end and a
staging PII-masking policy; DES-001's DoD is medium-scoped; UXR-001 has a
method-selection rubric; IT-001 names MDM/SSO/SCIM/BYOD mechanics with an MDM Required
Integration; HCS-001 has a concrete health-score and renewal-forecast model (SUP-001's
SLA KPI caveated); CFO-001 operationalizes tax/investor reporting and SaaS metrics
(NRR/GRR/Rule of 40); HAI-001's step-68 plan is scoped to measurable telemetry. These
are editorial fixes with no mechanical backstop — they rely on review discipline.

| # | File(s) | Defect | Fix |
|---|---|---|---|
| 9 | `legal-security/GC-001.md` | Most boilerplate file; claims IP/privacy/employment/regulatory but names no actual framework. | Name concrete frameworks: GDPR/CCPA, trademark & invention-assignment, board-consent/option-grant housekeeping, DPA/SCC handling. |
| 10 | `legal-security/` (structural) | Legal/Security has no single head — GC→CEO, SEC→CTO; privacy compliance falls between two peers. | Name an integrator (or a standing Legal/Security council with a lead) accountable for privacy end to end. |
| 11 | `people-hr/*.md` | "Competency matrix" invoked ~15× as ground truth, never defined. HRH/TA keep two "versioned" requisition records with no reconciliation rule. | Define the competency matrix once as a real artifact; add a single-source-of-truth reconciliation rule for requisitions. |
| 12 | `people-hr/HRH-001.md` (comp) | Comp-banding has no leveling or market-percentile logic. | Add a leveling framework + market-percentile methodology. |
| 13 | `engineering/EM-001.md` | Mandate says "manage delivery, people" but the people half (1:1s, coaching, hiring) has zero content. | Write the people-management responsibilities, or narrow the mandate to delivery and move people-ops explicitly to HR. |
| 14 | `engineering/` (ARCH/DEVOPS) | No one owns disaster-recovery/compliance NFRs end to end; no test-data/PII-masking strategy for staging. | Assign DR/compliance NFR ownership to one agent; add a staging PII-masking policy. |
| 15 | `design-ux/DES-001.md` | Definition of Done says "validated via usability testing / clickable prototype," unachievable from the static/markdown fallback the same file describes. | Downgrade the DoD to the actual medium (document-level design review) until a design tool is connected. | 
| 16 | `design-ux/UXR-001.md` | Most templated file; no method-selection framework (interviews vs. surveys vs. usability tests). | Add a method-selection rubric keyed to research question and maturity. |
| 17 | `operations/IT-001.md` | Asserts "device management" with no MDM/SSO/SAML/SCIM/BYOD specifics. | Either specify the identity/device mechanics or file them as Required Integration. |
| 18 | `customer-success/*.md` | Health-scoring model deferred ("define what signals feed the score"), not specified; SUP SLA self-reported (no ticketing SLA timer); renewal forecast is narrative buckets. | Specify the health-score formula; file ticketing/SLA tooling as Required Integration; replace narrative renewal buckets with a scored model. |
| 19 | `executive/CFO-001.md` | Claims "tax coordination" and "investor financial reporting" then never delivers either; no SaaS-native metrics (NRR/GRR, Rule of 40). | Add the tax/investor-reporting mechanics or drop the claims; add SaaS metrics to the Finance dashboard. |
| 20 | `ai-data/HAI-001.md` (step 68) | Cost-optimization has no real telemetry source. | File infra/telemetry as Required Integration; scope the plan to what's measurable. |

---

## How this register relates to doc 12

- Items with a **Guardrail** column entry become *self-enforcing* once the §7
  validators ship: after the one-time content fix, the validator fails any future
  regression, so the defect cannot silently return. Sequence these content fixes
  **with** the corresponding validator (doc 12 Phase 1d for run-time validators,
  Phase 0b/1a for compose-time integrity checks).
- Items without a guardrail (frameworks, undefined terms, thin mandates) are pure
  editorial fixes to the specs; they improve quality but have no mechanical
  backstop, so they need review discipline, not code.

## Recommended sequencing

1. **P0 items 1–3** now — they are integrity/correctness and one is a live
   integrity violation. Item 1 should land with, or before, the §7.1(1) validator
   so the validator has a clean corpus to enforce against.
2. **P1 items 4–8** alongside the compose-time integrity checks (doc 12 §7.2) —
   fixing the specs and turning on the check that keeps them fixed are the same
   unit of work.
3. **P2 items 9–20** as ongoing spec-quality passes, prioritized by which
   capabilities the first composed non-SaaS roadmaps actually wake.
