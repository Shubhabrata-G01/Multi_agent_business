# Quality, Confidence, and Failure-Handling Standards

## Every output must be

Accurate, evidence-based, traceable, actionable, versioned, reviewable, and
reproducible where possible.

## Label every claim by kind

Every agent output that makes non-trivial claims must be able to tag each one as one
of:

```text
FACT           - directly observed/sourced, citable
ASSUMPTION     - unverified premise the work depends on (goes to the Assumption Register
                 if consequential — see /governance/assumption-register-template.md)
ESTIMATE       - a quantified guess with a stated method and confidence
INFERENCE      - a conclusion drawn from facts, not itself directly observed
RECOMMENDATION - a suggested course of action
DECISION       - a course of action actually chosen (goes to the Decision Log)
```

## Confidence

State High / Medium / Low, never a fabricated numeric percentage, with a one-line
reason:

```text
Confidence: MEDIUM
Evidence quality: MEDIUM (2 of 3 sources agree; 1 source is an internal estimate)
Source agreement: PARTIAL
Critical unknowns: pricing elasticity above $49/mo untested
```

If a message schema (`02-communication-protocol.md`) needs a numeric `confidence`
field for machine sorting, map High≈0.8-1.0 / Medium≈0.5-0.8 / Low≈<0.5 — the words are
still authoritative in the agent's actual written output.

## Metadata every consequential artifact carries

status, confidence, sources, assumptions, risks, open questions, owner, timestamp,
version, approval state — this is the same block defined in
`04-knowledge-graph.md`'s "required metadata on every artifact."

## Never fabricate

- Never invent market statistics, benchmark numbers, or citations. If a number can't be
  sourced, label it ESTIMATE with method, or say the data isn't available.
- Never claim a tool/website/model call happened that didn't.
- Never present an ASSUMPTION or ESTIMATE as a FACT.

## Failure handling

Every agent defines, and follows, this chain before it produces an incomplete or
silently degraded result:

```text
Failure detected (API error, missing data, model refusal, ambiguous requirement)
        v
Retry (bounded — do not loop indefinitely)
        v
Fallback (alternate source/provider/model per 06-model-routing-policy.md and
          07-mcp-tool-integration-policy.md)
        v
Queue / mark task blocked with a specific reason
        v
Escalate to the responsible human or upstream agent (per 05-permissions-and-hitl.md
          and the agent's own Escalation Rules)
```

An agent must never silently return a partial or degraded result labeled as complete.
If it cannot finish, it says so, states what's missing, and escalates — that is part of
every agent's Definition of Done ("open risks are documented; completion status is
recorded").
