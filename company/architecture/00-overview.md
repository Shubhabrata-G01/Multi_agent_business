# Company Operating System — Overview

## What this is

This directory tree is the operating specification for an AI-agent-operated software
company. It is generated from `Software_Company_AI_Agent_Role_Matrix.xlsx` (the source
of truth for roles and the end-to-end business flow) and expands every role in that
workbook into a complete, operational AI agent specification.

This is **not** a set of chatbot personas. Every agent here is defined as a capability
with explicit triggers, inputs, tools/integrations, permissions, memory, a workflow,
outputs, escalation rules, and a definition of done — so that it can actually receive an
objective, do the work, hand off to the next agent, and be audited afterward.

## How to read this tree

```text
/company
  README.md                          <- start here: how the org works end to end
  /architecture                      <- cross-cutting policy every agent inherits
    00-overview.md                   <- this file
    01-agent-spec-template.md        <- the template every agent file follows
    02-communication-protocol.md     <- agent-to-agent message schema
    03-memory-architecture.md        <- memory types, versioning, no silent overwrites
    04-knowledge-graph.md            <- how company entities relate to each other
    05-permissions-and-hitl.md       <- READ/CREATE/UPDATE/EXECUTE/APPROVE/ESCALATE + Level 0-4 human gates
    06-model-routing-policy.md       <- multi-LLM architecture and task-based routing
    07-mcp-tool-integration-policy.md<- external sources, MCP/API-first policy, per-department tool map
    08-four-eyes-and-critic-mode.md  <- creator/reviewer/approver/executor separation
    09-quality-and-confidence-standards.md <- fact/assumption/estimate labeling, failure handling
    10-company-dashboard.md          <- the KPI dashboard the CEO agent runs the company from
    11-artifact-repository-structure.md    <- where artifacts live and how they're tagged
  /governance
    decision-log-template.md
    assumption-register-template.md
    risk-register-template.md
  /workflow
    end-to-end-business-flow.md      <- the master sequential flow (idea -> expansion), human-readable
    business-flow.json               <- the same flow, machine-readable, with loop/re-entry conditions
  /agents
    <department>/<AGENT-ID>.md       <- one file per persistent agent (38 total)
    registry.json                    <- master index: id, name, team, reports-to, file path
```

## Core design decisions (and why)

1. **One persistent agent per capability, not per workbook row.** The role matrix
   contains title synonyms (e.g. "Software Architect" and "Tech Lead" carry identical
   responsibilities; "CMO" and "Head of Growth" are the same capability at different
   company sizes). These were merged into a single agent with multiple acceptable
   titles rather than duplicated. This produced **38 persistent agents** instead of 62
   rows. See `/agents/registry.json` for the canonical list and the alias mapping.

2. **Operating modes, not duplicate agents, for roles that recur in the business
   flow.** A role such as CTO appears at architecture creation, architecture review,
   continuous security review, production readiness review, cost optimization, and
   reliability planning. This is the *same* CTO agent operating in a different mode at
   each point, retaining memory of its own earlier decisions and free to say a prior
   recommendation no longer holds. Each agent file's **Operating Modes** section lists
   every business-flow step the agent participates in, tagged Primary or
   Supporting/Reviewing, in lifecycle order — derived directly from the workbook, not
   invented.

3. **Business outcome > task completion > agent autonomy.** No agent is designed to
   optimize for "I produced an artifact." Every agent's Definition of Done requires the
   artifact to be stored, downstream agents to receive the handoff, and (where
   applicable) the company dashboard/decision log to be updated.

4. **Four-eyes on consequential work.** Creator, reviewer, approver and executor are
   separated for anything that is expensive, risky, or hard to reverse. See
   `08-four-eyes-and-critic-mode.md` and each agent's own Critic/Review Behavior
   section.

5. **Humans stay in the loop where it matters, not everywhere.** See
   `05-permissions-and-hitl.md` for the Level 0-4 classification used by every agent's
   Human Approval Requirements section.

6. **Tools are never invented.** Every MCP/API/tool an agent is specified to use is
   real and named in `07-mcp-tool-integration-policy.md`. Where no integration exists
   yet, the agent's spec says so explicitly (`Required Integration` block) instead of
   pretending the capability exists.

## Organizational hierarchy

```text
                         HUMAN FOUNDER / CEO
                                |
                                v
                         CEO AGENT (CEO-001) — Company Orchestrator
                                |
          +----------+----------+----------+----------+----------+----------+
          v          v          v          v          v          v          v
        CTO        CFO        COO        CPO       CMO        CRO      Head of CS /
     (Eng/AI/Sec)(Finance)  (Ops/HR)   (Product/  (Growth/  (Sales/    Legal / HR
                                        Design)   Marketing) Revenue)   (see below)
          |          |          |          |          |          |          |
     Specialist  Specialist Specialist Specialist Specialist Specialist Specialist
       Agents      Agents     Agents     Agents     Agents     Agents     Agents
          |          |          |          |          |          |          |
          +----------+----------+----------+----------+----------+----------+
                                      |
                                      v
                          COMPANY KNOWLEDGE / MEMORY
                    (decision log, assumption register, risk
                     register, dashboard, artifact repository)
                                      |
                    +-----------------+-----------------+
                    v                 v                 v
              Documents/Data    Business Tools     External World
              (company memory)  (MCP/API/CRM/       (search, market
                                 CI-CD/Cloud/etc.)   data, competitors)
```

General Counsel (legal/security), Head of People (HR) and the Business Operations
Manager (Operations) report to the CEO directly (via COO for day-to-day operating
cadence) rather than nesting under one of the six department heads above, matching the
Team Summary sheet.

## The execution loop every agent follows

```text
TRIGGER -> COLLECT INPUTS -> VALIDATE INPUTS -> ANALYZE -> PLAN -> EXECUTE ->
VERIFY -> CREATE ARTIFACT -> UPDATE COMPANY MEMORY -> HANDOFF -> WAIT/MONITOR/ITERATE
```

This loop is the backbone of every agent's **Workflow** section.

## The business lifecycle this org executes

Inception -> Problem Discovery -> Market Validation -> Business Model -> Go/No-Go ->
Product Strategy -> Product Discovery -> Product Definition -> UX Design -> Architecture
-> Technical Design -> AI Design -> Security -> Planning -> Pre-Development ->
Development -> Quality -> Pre-Launch -> Launch -> Early Traction -> Iteration ->
Product-Market Fit -> Growth -> Scale -> Profitability -> Expansion (loops back to
Strategy).

The full sequential flow, including every loop and re-entry condition, is in
`/workflow/end-to-end-business-flow.md`.
