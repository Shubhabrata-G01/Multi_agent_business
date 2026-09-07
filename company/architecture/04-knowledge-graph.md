# Company Knowledge Graph

Every important artifact in the company is a node with relationships to the entities
below. This is what lets the CEO agent (or any agent) ask "what depends on this?" or
"what decision produced this?" instead of re-deriving context from scratch.

## Entity types

```text
Company
├── Strategy         (OKRs, positioning, portfolio decisions)
├── Products          (product lines, PRDs, roadmaps)
├── Customers         (accounts, contracts, health, usage)
├── Markets           (segments, geographies, TAM/SAM/SOM)
├── Competitors        (competitive analyses, pricing intel)
├── Employees / Agents (org chart, agent registry, human owners)
├── Documents          (every artifact in the repository)
├── Decisions          (decision log entries)
├── Projects            (initiatives, releases, expansion efforts)
├── Financials           (budgets, forecasts, unit economics)
├── Risks                 (risk register entries)
└── Metrics                 (dashboard series, KPI definitions)
```

## Required metadata on every artifact

```yaml
owner: <Agent ID or human>
created: <date>
version: <semver-or-vN>
status: draft | in_review | approved | superseded | archived
source: <upstream artifact/agent that produced the trigger>
related_project: <project id>
related_decision: <decision id, if applicable>
related_agents: [<agent ids involved>]
approval_status: not_required | pending | approved | rejected
```

This block is what the `Outputs > Metadata` section of every agent spec produces on
each artifact it creates, and it is what `architecture/11-artifact-repository-structure.md`
requires in the front-matter of every stored file.

## Relationship rules

- A **Decision** always links to: the artifacts it approved/rejected, the agents that
  proposed and reviewed it, and the risks/assumptions it resolved or accepted.
- A **Project** links to: its PRD(s), architecture, backlog, releases, and the
  Decisions that gated it (Go/No-Go, budget approval, production readiness).
- A **Risk** links to: the artifact/decision that surfaced it, its owner, and (once
  closed) the mitigation artifact or decision that resolved it.
- A **Customer** links to: the Account Executive/CSM who owns it, its contract, its
  health score inputs, and any Decisions or Risks specific to that account (e.g. churn
  risk, security exception).
- An **Agent** links to: every artifact it owns (Role Memory), every Decision it
  participated in, and its position in the org chart (Reports To / Directly Supports /
  Can Delegate To, from its Identity block).

## Querying the graph

Agents query the graph before producing recommendations, not after — this is what
"read before you recommend" (`03-memory-architecture.md`, rule 2) means in practice.
Typical queries an agent runs as part of its Workflow's COLLECT INPUTS / VALIDATE INPUTS
steps:

- "What Decisions already exist for this Project?"
- "What Risks are open against this Product or Customer?"
- "What Assumptions were made in the artifact I'm building on, and are they still
  valid?"
- "Which other Agents' outputs does this artifact depend on, and are they current?"
