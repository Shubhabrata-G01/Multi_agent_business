# Risk Register — Template and Rules

Covers business, product, technology, AI, security, legal, financial, operational, and
people risks. Every major risk surfaced by any agent (most commonly in a Critic/Review
capacity — see `/architecture/08-four-eyes-and-critic-mode.md`) gets an entry here.

## Entry template

```yaml
risk_id: R-###
category: business | product | technology | ai | security | legal | financial | operational | people
description:
probability: high | medium | low
impact: high | medium | low
owner:                     # agent or human accountable for managing this risk
mitigation:
trigger:                    # the condition that would turn this risk into an active incident
contingency:                  # what happens if the trigger fires
status: open | mitigated | accepted | closed
date_raised:
date_closed:
related_decision:              # Decision Log id, if a decision accepted or created this risk
```

## Rules

- `status: accepted` requires a named accountable owner with the authority to accept
  it (per the Level classification in `/architecture/05-permissions-and-hitl.md` — a
  Level 3/4-consequence risk cannot be accepted by an agent alone).
- Security and AI risks specifically feed the Production Readiness review
  (`SEC-001`, `AIEVAL-001` operating modes) and must be `mitigated` or explicitly
  `accepted` by an authorized owner before a Go decision at that gate.
- Closed risks are retained (status `closed`, never deleted) so post-incident review
  and future architecture decisions can reference what was previously known.
