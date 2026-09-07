# Assumption Register — Template and Rules

Every consequential ASSUMPTION (per the FACT/ASSUMPTION/ESTIMATE labeling in
`/architecture/09-quality-and-confidence-standards.md`) that a business decision
depends on gets an entry here. Agents proactively identify assumptions that need
validation rather than letting them silently harden into treated-as-fact premises.

## Entry template

```yaml
assumption_id: A-###
assumption:                # e.g. "Users will pay ₹999/month for the Pro tier"
owner:                       # agent or human accountable for validating this
evidence:                      # what supports it today, if anything
confidence: high | medium | low
impact_if_wrong: high | medium | low
validation_method:               # e.g. "paid pilot," "landing-page test," "user interviews"
status: unvalidated | validating | validated | invalidated
date_raised:
date_resolved:
related_decision:                 # Decision Log id(s) that depend on this assumption
```

## Rules

- Any agent producing a strategy, pricing, product-scope, or architecture
  recommendation must scan for embedded assumptions and register the consequential
  ones (impact_if_wrong: medium or high) before handing the artifact off.
- `status: invalidated` triggers a mandatory return to the agent/step that depended on
  it — this is one of the loop/re-entry conditions referenced throughout
  `/workflow/end-to-end-business-flow.md` (e.g. "iterate pricing/model if economics
  fail," "revise pricing/product/channel assumptions").
- An assumption is never silently dropped from the register when superseded — it's
  marked `validated` or `invalidated` with the evidence that resolved it.
