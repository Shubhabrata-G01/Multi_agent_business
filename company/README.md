# AI-Agent-Operated Software Company — Operating Specification

This is a complete, operational specification for an AI-agent organization capable of
taking a software business from **idea through discovery, validation, strategy,
product definition, UX/UI, architecture, development, QA, launch, customer
acquisition, revenue, product-market fit, growth, scale, profitability, and
expansion** — generated from `Software_Company_AI_Agent_Role_Matrix.xlsx` (the source
of truth for roles and the end-to-end business flow, one directory up from this file).

38 persistent AI agents, one shared architecture/policy backbone, one 81-step business
flow with every loop and re-entry condition preserved, and the governance registers
that keep decisions, assumptions, and risks durable across the whole lifecycle.

## Start here

- **New to this repo?** Read `architecture/00-overview.md` first — it explains the
  design decisions (why 38 agents and not 62, what "operating modes" means, the org
  hierarchy) and the execution loop every agent follows.
- **Want to see the flow this org executes?** Read `workflow/end-to-end-business-flow.md`.
- **Want one agent's full spec?** Go straight to `agents/<department>/<AGENT-ID>.md`,
  or look it up by name/team in `agents/registry.json`.
- **Writing a new agent, or extending one?** Follow `architecture/01-agent-spec-template.md`
  exactly — every existing agent file follows it, and it explains the style rules
  (never invent a tool, never claim generic analysis, always separate FACT from
  ASSUMPTION).

## What's in this repository

```text
/company
  README.md                    <- you are here
  /architecture (12 files)     <- cross-cutting policy every agent inherits
  /governance (3 files)        <- decision log / assumption register / risk register templates
  /workflow (2 files)          <- the 81-step business flow, human- and machine-readable
  /agents (38 agent files + registry.json) <- one spec per persistent agent, by department
```

See `architecture/00-overview.md` for the full annotated tree and
`architecture/11-artifact-repository-structure.md` for where the company's actual
*working* artifacts (PRDs, architecture docs, contracts, etc. — as opposed to this
org-design specification) should live once agents start producing them.

## The 38 agents, by department

| Department | Agents |
|---|---|
| Executive | CEO-001, CTO-001, CFO-001, COO-001 |
| Product | CPO-001, PM-001, PA-001 |
| Design / UX | UXR-001, DES-001 |
| Engineering / Technology | EM-001, ARCH-001, BE-001, FE-001, QA-001, DEVOPS-001 |
| AI / Data | HAI-001, AIE-001, DE-001, AIEVAL-001 |
| Growth / Marketing | CMO-001, PMM-001, CONT-001, PERF-001 |
| Sales / Revenue | CRO-001, SDR-001, AE-001, REVOPS-001 |
| Customer Success | HCS-001, SUP-001, CSM-001 |
| Finance | CTRL-001, FPA-001 |
| Legal / Security | GC-001, SEC-001 |
| People / HR | HRH-001, TA-001 |
| Operations | BOM-001, IT-001 |

Full org-chart relationships (reports-to, can-delegate-to, aliases, and every
End-to-End Business Flow step each agent owns as Primary or Supporting) are in
`agents/registry.json`.

## How the org actually runs an objective: "Build this business"

When a human founder gives the CEO agent an objective, the org does not treat that as
one task for one agent — it decomposes across the business lifecycle exactly as
`workflow/end-to-end-business-flow.md` specifies:

```text
Market Research / Discovery (PM-001, UXR-001, PA-001)
        v
Product Strategy (CPO-001) --review--> CEO-001
        v
Product Definition (PM-001) + UX Design (UXR-001, DES-001)
        v
Architecture (ARCH-001) --review--> CTO-001
        v
Technical Design (ARCH-001) + AI Design (HAI-001) + Security (SEC-001)
        v
Engineering (BE-001, FE-001, AIE-001, DE-001) --review--> ARCH-001, SEC-001
        v
Quality (QA-001, AIEVAL-001) --review--> CTO-001
        v
Pre-Launch (PMM-001, CFO-001, HCS-001) --gate--> CTO-001, CEO-001
        v
Launch (DEVOPS-001, PM-001)
        v
Customer Acquisition (CMO-001, PERF-001, CONT-001) + Sales (CRO-001, SDR-001, AE-001)
        v
Customer Success (HCS-001, CSM-001, SUP-001) --feedback--> PM-001
        v
Product Analytics (PA-001) --> Finance (FPA-001) --> CEO-001
        v
Product-Market Fit Assessment (CPO-001) --> CEO-001
        v
Growth --> Scale --> Profitability --> Expansion --> back to Strategy (CEO-001, step 81, permanent loop)
```

This is not a metaphor — it is the literal sequence in
`workflow/business-flow.json`, and every arrow above is a real Handoff Protocol
(`architecture/02-communication-protocol.md`) between two named agents with
acceptance criteria, not a vague "send this to Product."

## Design principles this specification enforces everywhere

1. **Business outcome > task completion > agent autonomy.** No agent's Definition of
   Done is satisfied by merely producing an artifact — it requires storage, handoff,
   and (where relevant) a dashboard/decision-log update.
2. **One persistent agent, many operating modes.** CTO-001 is Architecture Designer at
   step 29 (supporting), Critic at step 30 (primary), Governance at steps 39/40/44/45
   (supporting), Gatekeeper at step 54 (primary), and Scalability Strategist / Cost
   Optimizer at steps 68/69 (primary) — the same persistent agent, not five different
   ones, and it is required to say a past recommendation of its own no longer holds
   when the evidence has changed (`architecture/08-four-eyes-and-critic-mode.md`).
3. **Four-eyes on consequential work.** Creator, reviewer, approver, and executor are
   different agents for anything Level 2+. AIE-001 never self-certifies its own model
   for release — that's AIEVAL-001's job. ARCH-001 never self-approves its own
   architecture — that's CTO-001's job.
4. **Humans stay in the loop where it matters, not everywhere.** Levels 0-4 in
   `architecture/05-permissions-and-hitl.md` govern every agent's Human Approval
   Requirements section — drafting, analyzing, and preparing are autonomous; signing
   contracts, moving money, and firing people are not.
5. **Nothing is invented.** Every MCP/API/tool cited as connected in
   `architecture/07-mcp-tool-integration-policy.md` is real for this environment;
   everything else uses the `Required Integration` block. Every market/competitive
   claim is labeled FACT/ASSUMPTION/ESTIMATE with a source
   (`architecture/09-quality-and-confidence-standards.md`).

## What this specification is not

It is not a working software system — there is no orchestrator process, task queue,
or running agent runtime here. It is the **design specification** for one: complete
enough that implementing it (wiring these specs to an actual multi-agent runtime, the
named MCP/API integrations, and a real artifact/knowledge-graph store) is an
engineering task with no ambiguity left in *what* each agent does, *when*, with
*what authority*, and *how it hands off* — which was the point of building it this way
rather than as a set of chatbot personas.
