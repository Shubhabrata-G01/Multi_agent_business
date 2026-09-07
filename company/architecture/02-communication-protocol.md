# Agent-to-Agent Communication Protocol

All consequential agent-to-agent handoffs use this structured message shape (JSON),
whether the underlying transport is an internal event bus, a task queue, or a
tool-mediated call. Free-text chat between agents is allowed for clarification but
never substitutes for the structured handoff when an artifact changes hands.

## Message schema

```json
{
  "message_id": "uuid",
  "from_agent": "PM-001",
  "to_agent": "ARCH-001",
  "task": "review_prd_for_feasibility",
  "artifact": {
    "name": "PRD v1.3 - Expense Approval Workflow",
    "path": "/company/product/prd/PRD-2026-014-v1.3.md",
    "version": "1.3",
    "type": "PRD"
  },
  "priority": "high",
  "confidence": 0.8,
  "requires_action": true,
  "requested_action": "confirm technical feasibility and flag NFR gaps before backlog creation",
  "deadline": "2026-09-12",
  "acceptance_criteria": [
    "Feasibility findings recorded against every functional requirement",
    "Any AI/latency/cost risk flagged explicitly",
    "Response delivered as Feasibility Findings artifact, not a chat reply"
  ],
  "related_decision_id": null,
  "related_flow_step": "23",
  "context_refs": ["/company/product/discovery/journey-map-v2.md"]
}
```

## Field rules

- `from_agent` / `to_agent`: always an Agent ID from `/agents/registry.json`, never a
  free-text role name.
- `artifact`: always a path into the artifact repository
  (`architecture/11-artifact-repository-structure.md`), not inline content, so the
  artifact stays versioned and auditable.
- `confidence`: only set by the sending agent about its own output; High/Medium/Low
  mapped to an approximate float for machine sorting is fine (High≈0.8-1.0,
  Medium≈0.5-0.8, Low≈<0.5) but the agent's own written output must still say
  High/Medium/Low in words plus why (`09-quality-and-confidence-standards.md`).
- `requested_action`: a verb phrase, never vague ("evaluate," "review," "approve," "block
  until X").
- `acceptance_criteria`: what the sender will check before treating the handoff as
  closed. This is the enforcement mechanism behind every agent's Handoff Protocol
  section.
- `related_flow_step`: the End-to-End Business Flow step number this message
  corresponds to, when applicable — keeps the message traceable to
  `/workflow/business-flow.json`.

## Delivery guarantees

- A message with `requires_action: true` is not considered delivered until the
  receiving agent has either produced the requested artifact, declined with a reason
  (written back to the sender and logged), or escalated per its own Escalation Rules.
- Messages that change a Decision Log entry, Risk Register entry, or Assumption
  Register entry must reference that entry's ID so the registers stay linked to the
  conversation that produced them.
- Nothing here replaces the four-eyes separation in `08-four-eyes-and-critic-mode.md`:
  a message asking an agent to both create and approve the same consequential artifact
  is malformed and should be rejected by the receiving agent.
