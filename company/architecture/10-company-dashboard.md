# Company Dashboard

The shared executive dashboard the CEO agent (and every department head agent) uses for
decision-making. Each section's metrics are fed by the named agent(s) as part of their
Monitoring & KPIs responsibilities and rolled up continuously, not just at reporting
time.

## Company (owner: CFO-001, reviewed by CEO-001)
Revenue, Profit, Cash, Runway, Growth rate.

## Product (owner: PA-001, reviewed by CPO-001)
Active users, Activation rate, Retention, Conversion, PMF signal strength.

## Growth (owner: PERF-001 / CMO-001)
Traffic, Leads, CAC, Conversion rate, ROAS.

## Sales (owner: REVOPS-001, reviewed by CRO-001)
Pipeline coverage, Win rate, Sales cycle length, Forecast vs. actual.

## Customer Success (owner: HCS-001)
Churn rate, NPS/CSAT, Support SLA attainment, Expansion revenue.

## Engineering (owner: EM-001 / DEVOPS-001, reviewed by CTO-001)
Deployment frequency, Lead time for changes, Defect rate, Reliability (uptime/SLO
attainment), Incident count and MTTR.

## AI (owner: AIEVAL-001, reviewed by HAI-001)
Model quality (evaluation scores), Cost per request, Latency, Failure/hallucination
rate, Regression count since last release.

## Finance (owner: FPA-001, reviewed by CFO-001)
Gross margin, Burn rate, Runway, LTV:CAC ratio.

## How the CEO agent uses it

The CEO agent's central recurring question is: **"What is currently preventing the
company from reaching its objective?"** It reads this dashboard, identifies the metric
furthest from target, and delegates root-cause investigation to the owning
department-head agent(s), following the pattern in `/company/README.md`'s worked
example (revenue-below-target root-cause loop).

## Update cadence

- Level 0/1 metrics (usage, funnel, engineering, AI quality): near-real-time /
  daily refresh from the connected systems in `07-mcp-tool-integration-policy.md`.
- Level 2+ rollups (P&L, pipeline forecast, board-level reporting): weekly/monthly per
  the operating cadence COO-001 establishes (business-flow step 72).

## Data integrity rule

Every number on this dashboard must trace back to a named source system or artifact
(no dashboard figure may be typed in by hand without a source reference) — this is the
same evidence discipline as `09-quality-and-confidence-standards.md` applied to
recurring metrics, not just one-off reports.
