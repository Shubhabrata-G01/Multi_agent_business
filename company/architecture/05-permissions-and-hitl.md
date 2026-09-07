# Permissions and Human-in-the-Loop Policy

This is the single source of truth for what any agent in this org is allowed to do
unsupervised, what it must do with human notification, and what it must never do
without an explicit human decision. Every agent spec's **Permissions** and **Human
Approval Requirements** sections are instances of this policy, not independent rules.

## Permission classes (least privilege)

| Class | Meaning |
|---|---|
| **READ** | Can inspect information (documents, dashboards, systems) relevant to its role, scoped per `03-memory-architecture.md` confidentiality rules. |
| **CREATE** | Can produce new artifacts (drafts, reports, code, designs, analyses). |
| **UPDATE** | Can modify artifacts/systems it owns, always versioned (never silent overwrite). |
| **EXECUTE** | Can trigger operational actions in connected tools (run a pipeline, send a query, deploy to staging). |
| **APPROVE** | Can formally approve a defined class of decision (bounded, explicit — e.g. "approve PRs that pass CI and review," not "approve any decision"). |
| **ESCALATE** | Can and must request human approval when a Level 2+ action (below) is reached. |
| **NEVER ALLOWED** | Actions this agent must not perform under any circumstance, regardless of confidence. |

Every agent file's Permissions section lists its specific grants in each class. An
agent with no APPROVE grant for a given artifact type must route it to whichever agent
or human does hold that grant — this is what keeps `08-four-eyes-and-critic-mode.md`
enforceable.

## Human-in-the-loop levels

### Level 0 — Fully autonomous
Low-risk, reversible, internal. No notification required beyond normal logging.
*Examples:* draft a report, run an analysis, classify a ticket, generate a wireframe,
query analytics, draft a competitive analysis.

### Level 1 — Autonomous + notification
Agent acts, then informs the relevant human/agent owner.
*Examples:* update internal documentation, create a backlog ticket, refresh a
dashboard, log a decision, post a non-customer-facing status update.

### Level 2 — Approval required before execution
Agent fully prepares the action (draft, plan, evidence) and stops at the gate; a named
human or authorized approving agent must approve before it executes.
*Examples:* publish a marketing campaign, deploy a production release, change pricing,
send a high-impact customer communication, sign off production readiness, approve a
customer contract's non-standard terms.

### Level 3 — Human decision required
Agent may analyze, model options, and recommend, but the decision itself is made by a
human, not the agent.
*Examples:* major strategic pivot, large financial commitment, legal settlement,
executive hiring, acquisition, fundraising decisions, entering/exiting a market.

### Level 4 — Human only, agent must not execute
*Examples:* signing legally binding agreements, irreversible financial transfers,
high-risk employment decisions (termination, disciplinary action), any action
prohibited by policy or law, deleting production data/customer accounts outside an
approved retention policy.

## How an agent classifies an action it's about to take

```text
Is it reversible within hours with no external party affected?      -> Level 0/1
Does it become visible to a customer, the public, or costs money at
scale, but a human can still block it before it goes out?           -> Level 2
Is it a one-way door for the business (strategy, capital, people,
legal exposure) where the agent's job is to inform the decision,
not make it?                                                        -> Level 3
Is it legally binding, irreversible, or explicitly prohibited?      -> Level 4
```

When in doubt, an agent escalates one level higher, not lower. Escalating unnecessarily
costs a human a few minutes; executing an unauthorized Level 3/4 action does not have a
reversible cost.

## Standing Level 2+ gates that apply company-wide

- Production deployment: Level 2 (CTO/DevOps prepare; CTO or CEO gate per
  `54` in the business flow).
- Pricing/packaging changes: Level 2 (CFO prepares; CEO approves).
- Any customer-facing communication at scale (campaign, mass email, pricing change
  notice): Level 2.
- Hiring decisions for named individuals: Level 3 (Head of People/HR recommends;
  hiring manager + CEO decide).
- Legal contract execution: Level 4 for signature; Level 2 for GC's drafted/reviewed
  terms reaching that point.
- Financial transfers, payroll runs, and irreversible fund movement: Level 4.
- Strategic pivots, fundraising, M&A: Level 3.
