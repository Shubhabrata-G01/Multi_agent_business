# End-to-End Business Flow

This is the company's master workflow: idea through expansion, 81 steps across 24
business phases, taken directly from the `End-to-End Business Flow` sheet of
`Software_Company_AI_Agent_Role_Matrix.xlsx`. `business-flow.json` in this same folder
is the machine-readable version (every field: inputs, what the role does, done/gate
criteria, loop condition) — use it for programmatic lookups. This file is the
human-readable index plus the cross-cutting loop patterns every agent must support.

Agents execute according to this sequence. No agent skips a phase without recording the
reason in the Decision Log (`/governance/decision-log-template.md`). Where a role name
below is a workbook shorthand (e.g. "Product Marketing," "Tech Lead," "CS"), match it
against `/agents/registry.json` to find the actual persistent agent responsible.

## Full sequence by phase

<!-- BEGIN PHASE TABLE -->
### Inception

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 01 | Capture business idea | CEO | Idea Brief | Product Manager | If unclear, CEO revises the idea brief. |
| 02 | Initial strategic framing | CEO | Initial Opportunity Hypothesis | Product Manager; CTO; CFO | Return to Step 01 if strategically irrelevant. |

### Problem Discovery

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 03 | Define target problem | Product Manager | Problem Statement | UX Researcher; Product Analyst | If problem is vague, repeat discovery. |
| 04 | Define ICP / target customer | Product Manager | ICP / Persona Draft | UX Researcher; Product Marketing | Revise ICP if research contradicts assumptions. |
| 05 | Research customer workflows | UX Researcher | Research Findings; Journey Map | Product Manager; CPO | Repeat interviews if evidence is weak or conflicting. |
| 06 | Quantify pain and opportunity | Product Analyst | Pain / Opportunity Analysis | CPO; CEO; Finance | Stop or redefine if impact is insufficient. |

### Market Validation

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 07 | Research market size | Product Manager | Market Assessment | CEO; CFO; CPO | Reconsider segment if market is too small. |
| 08 | Analyze competitors and alternatives | Product Marketing | Competitive Analysis | Product Manager; CEO | Return to problem/ICP if no differentiated value is possible. |
| 09 | Test willingness to pay | Product Manager | Validation Evidence | CFO; CEO; CPO | Repeat with revised value proposition/pricing if weak. |

### Business Model

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 10 | Define value proposition | Product Marketing | Value Proposition | Product Manager; Marketing; Sales | Test alternate positioning if unclear. |
| 11 | Design business model | CFO | Business Model | CEO; Product; Finance | Iterate pricing/model if economics fail. |
| 12 | Build initial unit economics | FP&A / Finance Analyst | Unit Economics Model | CEO; CFO; CPO; CTO | Revise pricing/product/channel assumptions. |

### Go / No-Go

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 13 | Executive opportunity review | CEO | Go / No-Go Decision | Product; CTO; Finance | If No-Go, archive; if conditional, return to named step. |

### Product Strategy

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 14 | Define product vision | CPO / Head of Product | Product Vision | Product Manager; Design; CTO | Revise with CEO if strategic conflict exists. |
| 15 | Define product strategy | CPO / Head of Product | Product Strategy | PM; Design; Engineering; Marketing | Revisit after new evidence. |
| 16 | Define North Star and KPIs | Product Analyst | Metric Framework | Product; Growth; Finance; CEO | Refine metrics if they cannot drive decisions. |

### Product Discovery

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 17 | Map end-to-end user journey | Product Manager | User Journey | Designer; Engineering; Growth; CS | Return to research if critical uncertainty remains. |
| 18 | Generate solution concepts | Product Manager | Solution Options | CPO; Designer; Tech Lead | Generate alternatives if no viable option. |
| 19 | Technical feasibility spike | Software Architect / Tech Lead | Feasibility Findings | Product; CTO | Repeat spike for unresolved critical risks. |
| 20 | AI feasibility and evaluation spike | Head of AI / ML | AI Feasibility Report | Product; CTO; Finance | Revise AI approach or product scope. |

### Product Definition

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 21 | Define MVP problem-to-value loop | Product Manager | MVP Value Loop | CPO; Design; Engineering | Cut scope if MVP is too large. |
| 22 | Create MVP scope | Product Manager | MVP Scope | Engineering; Design; QA; Marketing | Reprioritize if scope exceeds budget/time. |
| 23 | Write PRD | Product Manager | PRD | Design; Engineering; QA; AI; Security | Return to discovery when requirements expose unknowns. |
| 24 | Define product analytics events | Product Analyst | Analytics Tracking Plan | Backend; Frontend; Data Engineering; QA | Add events if gaps are found during testing. |

### UX Design

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 25 | Create information architecture | Product Designer | Information Architecture | PM; Frontend; QA | Iterate after usability testing. |
| 26 | Create wireframes | Product Designer | Wireframes | UX Research; PM; Engineering | Revise after usability findings. |
| 27 | Prototype and usability test | Product Designer | Validated Prototype; Usability Findings | PM; Engineering | Loop to wireframes if usability fails. |
| 28 | Finalize UI and design system | Product Designer | UI Design; Design Specs | Frontend; QA; Marketing | Revise for technical/design issues. |

### Architecture

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 29 | Create system architecture | Software Architect / Tech Lead | Architecture Diagram; ADRs | Engineering; Security; DevOps; CTO | Rework if CTO/security/engineering identifies material risk. |
| 30 | CTO architecture review | CTO | Architecture Approval / Changes | Tech Lead; Engineering | Return to Step 29 until critical concerns are resolved. |

### Technical Design

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 31 | Define data model | Software Architect / Tech Lead | Data Model / Schema | Backend; Data Engineering; Security | Revise if requirements change. |
| 32 | Define API contracts | Software Architect / Tech Lead | API Specification | Backend; Frontend; QA | Resolve ambiguities before implementation. |

### AI Design

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 33 | Define AI specification | Head of AI / ML | AI Specification | ML/AI; Backend; QA; Security | Revise if evaluation/cost risk is unacceptable. |

### Security

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 34 | Threat model and privacy review | Security / Privacy Lead | Threat Model; Security Requirements | Engineering; AI; Legal | Rework architecture if critical risks cannot be mitigated. |

### Planning

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 35 | Estimate MVP effort and cost | Engineering Manager | Delivery Estimate | CFO; CEO; Product | Re-scope if budget/timeline fails. |
| 36 | Create MVP backlog | Product Manager | Prioritized MVP Backlog | Engineering; QA; Design | Return to PRD if work is ambiguous. |
| 37 | Create MVP delivery plan | Engineering Manager | MVP Delivery Plan | Engineering; Product; CEO/COO | Replan if capacity changes. |

### Pre-Development

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 38 | Final investment / build approval | CEO | Build Authorization | Engineering; Product; Finance | Return to planning if economics/scope fail. |

### Development

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 39 | Set up repositories and environments | DevOps / SRE | Development/Staging Environments | Engineering; QA; Security | Fix infrastructure blockers before development. |
| 40 | Implement backend foundation | Backend Engineer | Backend Foundation | Frontend; AI; QA | Fix defects and repeat implementation. |
| 41 | Implement frontend foundation | Frontend / Mobile Engineer | Frontend Foundation | QA; Backend; Product | Fix design/API issues and repeat. |
| 42 | Implement AI capabilities | ML / AI Engineer | AI Component | Backend; QA; AI Evaluation | Iterate model/prompt if evaluation fails. |
| 43 | Implement analytics instrumentation | Data Engineer | Analytics Pipeline | Product Analytics; QA | Fix missing/incorrect events. |
| 44 | Continuous code review | Software Architect / Tech Lead | Approved PRs / Review Findings | Engineering Manager; Engineers | Return to engineer for required changes. |
| 45 | Continuous security review | Security / Privacy Lead | Security Findings / Approval | Engineering; CTO | Loop to engineering for remediation. |
| 46 | Continuous AI evaluation | AI Evaluation / Model Quality Engineer | Evaluation Report | AI Engineering; Product; QA | Loop to AI engineering when thresholds fail. |

### Quality

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 47 | Build test strategy | QA / Quality Engineer | Test Strategy / Test Plan | Engineering; Product | Expand plan when risk gaps appear. |
| 48 | Test feature increments | QA / Quality Engineer | Test Execution Report; Defect Sheet | Engineering; PM | Return to engineering until pass criteria are met. |
| 49 | Performance and reliability testing | QA / Quality Engineer | Performance Report | DevOps; Tech Lead; CTO | Optimize/retest if thresholds fail. |
| 50 | User acceptance testing | Product Manager | UAT Findings / Acceptance | Engineering; CPO | Return to Product/Design/Engineering as needed. |

### Pre-Launch

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 51 | Go-to-market readiness review | Product Marketing Manager | GTM Launch Kit | Marketing; Sales; CS | Fix product/messaging gaps. |
| 52 | Pricing and packaging approval | CFO | Approved Pricing / Packaging | Marketing; Sales; Product; Billing | Run additional pricing analysis/test. |
| 53 | Customer support readiness | Head of Customer Success | Support / Success Playbook | Support; CS; Product | Close readiness gaps. |
| 54 | Production readiness review | CTO | Production Go / No-Go | DevOps; Engineering; CEO | Return to engineering/QA. |

### Launch

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 55 | Production deployment | DevOps / SRE | Production Release | Product; CS; Marketing; Support | Rollback and remediate if critical failure occurs. |
| 56 | Launch monitoring | Product Manager | Launch Report | CPO; CEO; Department Leads | Escalate severe issues to Engineering/CS/CEO. |

### Early Traction

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 57 | Onboard first users | Customer Success Manager | Onboarding Records; Customer Feedback | Product; Support; Sales | Revise onboarding/product if activation is weak. |
| 58 | Collect structured customer feedback | Customer Success Manager | Customer Insight Repository | Product; CEO; Marketing | Repeat research for unresolved themes. |
| 59 | Analyze product funnel | Product Analyst | Funnel / Cohort Analysis | Product; Growth; CEO | Instrument missing data if necessary. |
| 60 | Review customer economics | FP&A / Finance Analyst | Early Unit Economics Report | CEO; CFO; Product; Growth | Change pricing/channel/cost structure if economics fail. |

### Iteration

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 61 | Prioritize post-launch fixes | Product Manager | Iteration Backlog | Engineering; Design; AI; QA | Loop continuously while product is immature. |
| 62 | Improve product based on evidence | Engineering + Product | Improved Product Increment | Users; Analytics; CS | Return to discovery if changes do not solve root cause. |

### Product-Market Fit

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 63 | Run PMF assessment | CPO / Head of Product | PMF Assessment | CEO; Executive Team | Continue product iteration if PMF is not reached. |

### Growth

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 64 | Define scalable acquisition engine | CMO / Head of Growth | Growth Strategy | Marketing; Sales; Finance; CEO | Experiment with new channels. |
| 65 | Run acquisition experiments | Performance / Lifecycle Marketer | Campaign Results; Qualified Leads | Growth Lead; Sales; Product | Repeat/kill/scale based on evidence. |
| 66 | Scale sales process | CRO / Head of Sales | Repeatable Sales Process | Sales; Finance; CS; CEO | Refine ICP/message/process. |
| 67 | Scale customer success | Head of Customer Success | Retention / Expansion System | Sales; Product; CEO | Improve product/onboarding if churn drivers persist. |

### Scale

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 68 | Optimize AI and infrastructure costs | CTO / Head of AI | Cost Optimization Plan | Finance; Engineering; Product | Repeat as usage/cost changes. |
| 69 | Strengthen reliability and security | CTO | Reliability / Security Roadmap | Engineering; Security; COO; CEO | Reprioritize based on incidents/risk. |
| 70 | Build organizational structure | CEO / COO | Org Design / Hiring Plan | HR; Finance; Department Heads | Reorganize if execution bottlenecks remain. |
| 71 | Hire and onboard key teams | Head of People / HR | Staffed Teams | Department Heads; HR | Continue hiring based on capacity gaps. |
| 72 | Establish company operating cadence | COO | Operating System / Cadence | All teams; CEO | Adjust cadence if it creates overhead without value. |

### Profitability

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 73 | Optimize pricing and monetization | CFO | Pricing Optimization Plan | CEO; Product; Sales; Marketing | Run further experiments. |
| 74 | Manage company P&L toward profit | CFO | Profitability Plan; Forecast | CEO; Department Heads | Reduce cost/reallocate investment if targets miss. |

### Expansion

| # | Activity | Primary | Output | Passed To | Loop / Re-entry |
|---|---|---|---|---|---|
| 75 | Identify adjacent customer segments | CPO / Head of Product | Expansion Opportunity Assessment | CEO; Product; GTM | Reject or return to validation. |
| 76 | Validate new market / geography | Product Marketing | Market Entry Validation | CEO; CPO; CRO; Legal | Repeat research or reject market. |
| 77 | Adapt product for new segment | Product Manager | Expansion PRD / Roadmap | Engineering; Design; GTM | Return to market validation if requirements undermine economics. |
| 78 | Build and launch expansion product | Engineering Manager | Expansion Release | GTM; CS; Sales | Iterate based on beta/launch results. |
| 79 | Scale distribution partnerships | CRO / Head of Sales | Partner Channel | Marketing; Sales; CS; Finance | Optimize or terminate underperforming partners. |
| 80 | Evaluate new product line | CEO | Portfolio Decision | Executive Team; Product | Return to opportunity discovery for selected concept. |
| 81 | Continuous executive review and reallocation | CEO | Updated Strategy / Capital Allocation | All teams | This is a permanent loop back to strategy and operating execution. |
<!-- END PHASE TABLE -->

## Key loop patterns (apply throughout, not just where explicitly written per-step)

```text
Research -> Product -> Design -> Technical feasibility -> Product
```
If technical feasibility fails (step 19/20):
```text
Technical feasibility -> Product -> Alternative solution -> Technical feasibility
```
If usability fails (step 27):
```text
Prototype -> UX Test -> Designer -> Prototype
```
If QA fails (steps 47-50):
```text
QA -> Engineering -> Build -> QA
```
If PMF fails (step 63):
```text
PMF Assessment -> Product Discovery -> Product Iteration -> Launch -> PMF Assessment
```

Agents must support these loops without losing historical context — every loop
iteration is a new version in Historical Memory (`/architecture/03-memory-architecture.md`),
not a silent overwrite of the prior attempt.

## The expansion loop (permanent, after profitability)

The company does not terminate after reaching profitability (steps 73-74). Steps 75-81
form a recurring strategic loop:

```text
Existing Business -> Customer Insights -> Adjacent Segment -> Market Validation ->
Business Case -> CEO Decision -> Product Adaptation -> Engineering -> Launch -> GTM ->
Revenue -> Profitability -> Expansion (repeat)
```

Step 81 ("Continuous executive review and reallocation") is explicitly a permanent loop
back to strategy and operating execution — the CEO agent runs this as a standing
process, not a one-time step.

## Agent-to-flow-step traceability

Every agent file's **Operating Modes** section lists exactly which of these 81 steps it
owns (Primary) or supports/reviews, sourced from this same data — see
`/agents/registry.json` for the full cross-reference.
