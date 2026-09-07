# Agent Specification Template

Every file under `/agents/<department>/<AGENT-ID>.md` follows this exact section order.
Sections marked **(inherit)** should stay short in the agent file and point at the
relevant shared policy doc rather than re-deriving it — this keeps each agent file
focused on what is actually specific to that role. Sections marked **(agent-specific)**
must contain real, concrete content drawn from the role-matrix data and the
End-to-End Business Flow — never generic filler like "the agent analyzes the market."

```markdown
# AGENT SPECIFICATION — <Agent Name>

## Identity
Agent ID:
Agent Name:
Aliases (equivalent titles):
Team:
Seniority:
Agent Type:                 (Executive Decision / Management / Individual Contributor / Specialist Reviewer)
Business Phase(s):          (every lifecycle phase this agent is active in, from Operating Modes below)
Primary Objective:
Secondary Objectives:
Reports To:
Directly Supports:
Can Delegate To:

## Mission
One precise paragraph.

## Responsibilities
Split into: Strategic / Operational / Review / Decision / Monitoring / Escalation / Optimization.
Each is a bullet list, not a paragraph. Derived from the role-matrix "Responsibilities"
and "How each role performs their job" columns, expanded to be concrete.

## Operating Modes
A table: Flow Step # | Business Phase | Mode (Primary or Supporting/Reviewing) | What the
agent does at that step | Artifact produced/reviewed. Built directly from the agent's
team-brief flow appearances — do not invent steps not present in the workbook. This is
what makes "one persistent agent, multiple modes" concrete (see architecture/00-overview.md #2).

## Triggers
Bullet list of concrete trigger conditions (event-driven, scheduled, or handoff-driven)
that start this agent's work.

## Inputs
### Internal documents
### External sources
List named, real sources only (see architecture/07-mcp-tool-integration-policy.md).
Never invent a source; if uncertain a source is authorized, say so.

## MCP / API Integrations
Use the "Required Integration" block format from the master policy when something is
needed but not yet connected:
```text
Required Integration:
Tool:
Capability:
Why Needed:
Alternative:
Human Escalation:
```
Otherwise list the real, named integrations this agent uses, referencing
architecture/07-mcp-tool-integration-policy.md.

## LLM / Model Requirements **(inherit + specialize)**
Point at architecture/06-model-routing-policy.md, then state which of Primary /
Secondary / Specialized / Reasoning / Coding / Vision / Evaluation model this agent
typically needs and why, plus any dual-model (creator + independent evaluator) requirement
for this specific role's consequential outputs.

## Memory Requirements **(inherit + specialize)**
Point at architecture/03-memory-architecture.md. State which memory types this agent
reads/writes (Company / Role / Project / Decision / Customer / Working / Historical) and
what it must never silently overwrite.

## Permissions **(inherit + specialize)**
Point at architecture/05-permissions-and-hitl.md. Give this agent's specific
READ/CREATE/UPDATE/EXECUTE/APPROVE/ESCALATE/NEVER grants.

## Workflow **(agent-specific)**
Use the TRIGGER -> COLLECT INPUTS -> VALIDATE INPUTS -> ANALYZE -> PLAN -> EXECUTE ->
VERIFY -> CREATE ARTIFACT -> UPDATE COMPANY MEMORY -> HANDOFF -> WAIT/MONITOR/ITERATE
loop, filled with this agent's actual verbs and artifacts — not the generic loop text
itself.

## Decision Logic
Concrete if/then rules this agent uses for its recurring judgment calls (prioritization,
go/no-go inputs, escalation triggers, quality-gate thresholds).

## Quality Controls
What this agent checks before it lets its own output leave its desk. Reference
architecture/09-quality-and-confidence-standards.md.

## Critic / Review Behavior **(agent-specific)**
When this agent reviews another agent's work (its Reviewing appearances in Operating
Modes), what it actively tries to break: correctness, completeness, assumptions,
evidence, risk, cost, security, scalability, business alignment, user value, compliance,
maintainability — pick the subset that is actually relevant to this role. Reference
architecture/08-four-eyes-and-critic-mode.md.

## Outputs
### Primary output
### Secondary outputs
### Metadata every output carries
status / confidence / sources / assumptions / risks / open questions / owner /
timestamp / version / approval state (see architecture/09-quality-and-confidence-standards.md).

## Agent-to-Agent Interactions
### Upstream agents (who this agent depends on)
### Downstream agents (who depends on this agent)
Use the message schema in architecture/02-communication-protocol.md.

## Handoff Protocol
For each major output: OUTPUT -> RECIPIENT AGENT -> PURPOSE -> REQUIRED ACTION ->
DEPENDENCIES -> DEADLINE/PRIORITY -> ACCEPTANCE CRITERIA. Concrete, not "send to Product."

## Escalation Rules
When this agent stops and escalates instead of proceeding.

## Human Approval Requirements
Map this agent's consequential actions onto Level 0-4 from
architecture/05-permissions-and-hitl.md.

## Failure Handling
Detection -> Retry -> Fallback -> Escalation -> Recovery, specific to this agent's tools.

## Monitoring & KPIs
The metrics this agent's own performance is judged on, and which feed
architecture/10-company-dashboard.md.

## Definition of Done
The 10-point completion checklist from the master policy, made concrete for this role.

## Loop / Re-entry Conditions
Pulled directly from this agent's Operating-Modes flow steps' "Loop/Re-entry condition"
column — do not invent conditions the workbook doesn't state.

## Security Requirements
## Audit Requirements

## Example Tasks
2-4 concrete example tasks.

## Example Input / Example Output
One worked example: a plausible input artifact in, and the structured output artifact
this agent would produce, including the metadata block from Outputs above.
```

## Style rules for anyone (human or agent) writing a spec from this template

- Never write "the agent analyzes the market" — write what question it asks, what
  sources it checks first, what it cross-checks, what it records, who it sends the
  result to, and what "done" looks like.
- Never claim an integration exists if it isn't listed in
  `07-mcp-tool-integration-policy.md`. Use the `Required Integration` block instead.
- Every agent must be able to say a previous decision of its own is no longer valid;
  do not write defensive/self-justifying language into any agent's mission.
- Confidence is High/Medium/Low with a reason, never a fabricated percentage.
- Keep each file self-contained enough to hand to a new engineer, but do not repeat the
  full text of shared policy docs — link/reference them by filename and section.
