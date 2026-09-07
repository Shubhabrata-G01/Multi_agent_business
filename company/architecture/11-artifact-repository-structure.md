# Artifact Repository Structure

Agents store artifacts in the correct department location rather than creating
duplicate or ad hoc copies. This tree is the target structure for the company's actual
working artifacts (distinct from `/company/agents`, `/company/architecture`,
`/company/governance`, `/company/workflow`, which are the *specification* of the org
itself).

```text
/company
    /strategy              (company strategy, OKRs, opportunity hypotheses, Go/No-Go records)
    /market-research        (market assessments, competitive analyses, validation evidence)
    /product
        /discovery           (problem statements, ICP/personas, journey maps, solution options)
        /prd                  (PRDs, MVP scope docs, acceptance criteria)
        /roadmap               (product strategy, roadmap, North Star/metric framework)
        /analytics              (tracking plans, funnel/cohort reports, experiment readouts)
    /design                      (information architecture, wireframes, prototypes, UI specs, design system)
    /engineering
        /architecture             (architecture diagrams, ADRs, technical designs)
        /api                       (API specifications, data contracts)
        /code                       (implementation — lives in the actual git repository; this folder holds pointers/READMEs, not source)
        /testing                     (test strategy, test plans, execution reports, defect sheets)
    /ai
        /models                       (model/provider decisions, AI specifications)
        /prompts                      (prompt versions, orchestration configs)
        /evaluations                   (evaluation datasets, benchmark scores, regression reports)
    /marketing                          (positioning, messaging, campaigns, content, SEO reports)
    /sales                               (pipeline artifacts, proposals, win/loss records)
    /customers                            (account records, health scores, success plans — access-scoped per 03-memory-architecture.md)
    /finance                               (financial model, budgets, forecasts, unit economics)
    /legal                                  (contracts, policies, compliance requirements)
    /security                                (threat models, security assessments, incident reports)
    /hr                                       (hiring plans, job descriptions, policies)
    /operations                               (SOPs, vendor records, process dashboards)
    /decisions                                 (Decision Log entries — see /governance/decision-log-template.md)
    /reports                                    (recurring dashboard exports, board/investor materials)
```

## Rules

1. Every file carries the metadata front-matter block from
   `04-knowledge-graph.md` ("required metadata on every artifact").
2. An agent checks whether an artifact of the type it's about to create already exists
   in the correct location before creating a new one — updates are new versions of the
   same artifact, not parallel duplicates.
3. `/company/engineering/code` never holds source directly; it holds pointers to the
   actual repository plus architecture-relevant READMEs, so the codebase itself remains
   the single source of truth for implementation.
4. Access to `/company/customers` and any PII therein is scoped per
   `03-memory-architecture.md`; agents outside Sales/CS/Support/Finance/Legal read only
   what their current task requires.
5. `/company/decisions` and `/company/reports` are the two folders every executive
   agent (CEO/CTO/CFO/COO and department heads) is expected to read from regularly as
   part of their own Workflow's COLLECT INPUTS step.
