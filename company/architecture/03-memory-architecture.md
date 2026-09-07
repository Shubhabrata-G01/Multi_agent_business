# Memory Architecture

Every agent reads and writes a subset of seven memory types. None of these are "the
chat history" — they are durable, queryable stores backing the artifact repository and
knowledge graph.

## The seven memory types

| Type | What it holds | Who writes it | Overwrite rule |
|---|---|---|---|
| **Company Memory** | Strategy, OKRs, budgets, org structure, policies — shared facts every agent can read | CEO/CFO/COO/HR agents (with approval gates per `05-permissions-and-hitl.md`) | Versioned; supersedes, never deletes |
| **Role Memory** | This agent's own prior outputs, standards it maintains, its own decision history | The agent itself | Versioned append |
| **Project Memory** | Current product/project state: PRD versions, architecture, backlog, release status | Product/Engineering/Design agents | Versioned; current pointer + history |
| **Decision Memory** | Every entry in the Decision Log (`/governance/decision-log-template.md`) | Any agent making or supporting a logged decision | Append-only; status field changes, entry never deleted |
| **Customer Memory** | Account-level facts: contract, usage, health, support history — access-scoped | Sales/CS/Support agents | Append + status; PII handled per Security/Privacy policy |
| **Working Memory** | Temporary task context for the current objective in flight | Any agent, transient | Discarded/archived at task completion |
| **Historical Memory** | Prior versions of documents, decisions, and outcomes (what was decided, what happened) | System, on every version bump | Immutable log |

## Rules that apply to every agent

1. **No silent overwrites.** Any write to Company, Project, or Decision memory bumps a
   version number and preserves the prior version in Historical Memory. An agent that
   needs to change an existing artifact does so as a new version with a changelog
   line, not an in-place edit that destroys the prior state.
2. **Read before you recommend.** Before producing a strategic, architectural, pricing,
   or resourcing recommendation, an agent must check Decision Memory for prior related
   decisions and Assumption Memory (part of Company Memory) for assumptions already on
   record, and state whether it agrees, disagrees, or has new evidence.
3. **Confidentiality boundaries.** Customer Memory is access-scoped: an agent may only
   read the accounts relevant to its current task, not the entire customer base, unless
   its role (e.g. CRO, Head of CS, CEO) explicitly requires portfolio-wide visibility.
4. **Working Memory is disposable, everything else is not.** Nothing that matters for
   future decisions may live only in Working Memory — if it matters later, it graduates
   to Project, Decision, or Company memory before the task closes (this is part of every
   agent's Definition of Done: "relevant systems are updated").
5. **An agent must be able to contradict its own Role Memory.** Retaining history is not
   the same as defending it — see `08-four-eyes-and-critic-mode.md` and the "role reuse"
   principle in `00-overview.md`.

## Storage mapping

Memory is not a separate physical store from the artifact repository — it is the
retrieval layer over it:

- Company/Project/Historical memory = versioned files under `/company/**` (see
  `11-artifact-repository-structure.md`), read via the knowledge graph
  (`04-knowledge-graph.md`) for relationship queries.
- Decision memory = `/governance/decision-log-template.md`-shaped entries, one per
  decision, linked to the artifacts and agents involved.
- Customer memory = the CRM/billing/support systems reached via the MCP/API
  integrations in `07-mcp-tool-integration-policy.md`, not duplicated into flat files.
- Working memory = the task/session context of the executing agent run; not persisted
  beyond the run except for what graduates per rule 4 above.
