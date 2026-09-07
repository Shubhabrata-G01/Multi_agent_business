# Multi-LLM Architecture and Model Routing Policy

No single model performs every task in this company. Every agent's spec names which of
the following model roles it needs, and routing picks the specific authorized model at
run time based on the task's actual requirements — never by default to "the most
expensive model."

## Model roles

| Role | Used for |
|---|---|
| **Primary Model** | The agent's default reasoning/generation model for its normal-complexity work. |
| **Secondary Model** | A faster/cheaper model for high-volume, low-stakes sub-tasks the same agent runs (classification, extraction, templated drafting). |
| **Specialized Model** | A model chosen for a specific modality or domain need (e.g. a coding-specialized model for implementation agents). |
| **Reasoning Model** | A strong reasoning model for strategic, architectural, or financial-modeling judgment calls. |
| **Coding Model** | Used by Engineering/AI agents for implementation, refactors, and code review. |
| **Vision Model** | Used by Design and document-extraction tasks (screenshots, mockups, scanned documents). |
| **Evaluation Model** | An independent model used to score another model's output, to reduce evaluator/self-grading bias — required whenever an AI-produced artifact needs a quality gate (`AIEVAL-001`'s domain). |
| **Embedding Model** | Used for retrieval over company memory/knowledge graph. |
| **Speech Model** | Used only where a workflow requires audio (e.g. transcribing user interviews); most agents never need this. |

## Routing inputs

For every task, before dispatching, compute:

- Complexity (single-step lookup vs multi-step reasoning)
- Reasoning requirement (does this need chained judgment, or pattern application?)
- Accuracy requirement (customer-facing / financial / legal vs internal draft)
- Latency requirement (interactive vs batch)
- Cost sensitivity (high-volume repeated task vs one-off strategic call)
- Data sensitivity (customer PII, financial, security-relevant vs general)
- Tool-use requirement (needs function calling/agentic tool loop vs pure generation)
- Vision requirement
- Coding requirement
- Long-context requirement (large document synthesis)

Then route to the cheapest model role that meets the accuracy, reasoning, and data
requirements — not the most capable model available.

## Default routing by task shape

| Task shape | Model role |
|---|---|
| Strategic reasoning (CEO/CTO/CFO/COO/CPO decisions, architecture trade-offs, pricing strategy) | Reasoning Model |
| Implementation (backend/frontend/mobile code, IaC) | Coding Model |
| Code review / static-analysis triage | Coding Model, cross-checked by rule-based static analysis |
| UI generation / design synthesis | Vision-capable model + connected design tool (Figma/Stitch — see `07-mcp-tool-integration-policy.md`) |
| Document/contract extraction (Legal, Finance) | Vision/document model, human-verified for anything Level 2+ |
| High-volume classification (support ticket triage, lead scoring) | Secondary (small, cheap) Model |
| AI feature evaluation, red-teaming, regression scoring | Evaluation Model, independent of the model that produced the output under test |
| Customer interview synthesis, journey mapping | Primary Model, long-context |
| Retrieval over company knowledge graph | Embedding Model + Primary Model for synthesis |

## Critical-decision routing

For decisions with Level 2+ consequence (per `05-permissions-and-hitl.md`) and material
uncertainty, use layered verification rather than a single model call:

```text
Model A (Primary/Reasoning Model produces the recommendation)
        +
Model B / Independent Evaluator (cross-checks, red-teams the recommendation)
        +
Rule-based checks (policy, budget, compliance constraints as hard gates)
        +
Human approval (per the Level classification)
```

This applies to: architecture approval, production readiness, pricing changes, AI
feature releases, and any output an agent will hand to Finance, Legal, or the CEO as
the basis for a Level 3 decision.

## Recordkeeping

Every consequential output (Level 1+) must record which model(s) produced it in the
artifact's metadata block (`04-knowledge-graph.md`), so later review can distinguish
"the model got this wrong" from "the process didn't have the right check."

## No fabricated capability

An agent must never claim a model call happened, or a tool was invoked, when it did
not. If a specialized model/tool required by this policy is not actually connected,
the agent uses the `Required Integration` block (see `01-agent-spec-template.md`) and
falls back to the best available authorized model plus explicit human review.
