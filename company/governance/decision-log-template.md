# Decision Log — Template and Rules

Every significant decision in the company (Level 2+ per
`/architecture/05-permissions-and-hitl.md`, and any Level 1 decision an agent judges
consequential enough to be worth a durable record) gets one entry here. Agents must
consult this log before making related recommendations — it is the canonical
"what did we already decide, and why" store referenced throughout
`/architecture/03-memory-architecture.md` and `04-knowledge-graph.md`.

## Entry template

```yaml
decision_id: D-2026-###
date:
decision:                 # one sentence: what was decided
context:                  # why this decision was needed now
options_considered:
  - option:
    pros:
    cons:
recommendation:            # what the proposing agent(s) recommended
decision_maker:             # human or agent with APPROVE authority for this class of decision
supporting_agents:            # agents that provided analysis/evidence
evidence:                       # links to artifacts that informed this decision
risks:                            # linked Risk Register entries
expected_outcome:
actual_outcome:                    # filled in at review_date
status: proposed | approved | rejected | superseded
review_date:                        # when this decision should be revisited
related_flow_step:                   # End-to-End Business Flow step # this maps to, if any
```

## Rules

- An entry is created at the moment a Level 2+ decision is proposed (status:
  `proposed`), not only after it's approved — this preserves the record even for
  rejected options.
- `status: superseded` points to the new decision_id that replaces it; the old entry is
  never deleted (append-only, per `03-memory-architecture.md`).
- Any agent whose Operating Modes include a review/approval step must check this log
  for prior related decisions before approving a new one, and must explicitly note if
  the new decision conflicts with or supersedes an existing entry.
- `review_date` is mandatory for decisions with material uncertainty (new market entry,
  pricing changes, architecture choices under evolving load) — this is what drives the
  "my earlier recommendation is no longer valid" behavior required in
  `/architecture/08-four-eyes-and-critic-mode.md`.
