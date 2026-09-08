// Mirrors the "what is actually connected" section of
// company/architecture/07-mcp-tool-integration-policy.md. Every entry is
// marked connected: false for THIS app's runtime specifically - the
// creator/critic/approver/executor/contributor calls in orchestrator.ts are
// plain text-completion API calls with no function-calling wired up, so
// regardless of what other tools exist in the broader environment, none of
// them are reachable from inside a run. This file exists so that fact is
// stated once, structurally, and surfaced to every agent explicitly instead
// of a single blanket "you have no tools" sentence.
export interface IntegrationStatus {
  name: string;
  connected: boolean;
  capability: string;
  used_by: string;
}

export const INTEGRATION_REGISTRY: IntegrationStatus[] = [
  {
    name: "Web research (search + page fetch)",
    connected: false,
    capability: "market/competitor/technical research with citable sources",
    used_by: "Product, Product Marketing, CEO/CFO strategic research, Legal",
  },
  {
    name: "Browser automation",
    connected: false,
    capability: "reading sites with no API (pricing pages, app stores, review sites)",
    used_by: "Design, Sales, Marketing",
  },
  {
    name: "Google Workspace (Gmail/Calendar/Drive)",
    connected: false,
    capability: "email, scheduling, shared document storage",
    used_by: "any customer- or human-facing agent",
  },
  {
    name: "Notion",
    connected: false,
    capability: "documentation/knowledge-base read-write",
    used_by: "any agent",
  },
  {
    name: "Hugging Face Hub",
    connected: false,
    capability: "model/dataset/Space discovery",
    used_by: "AI/Data agents",
  },
  {
    name: "Code hosting / CI-CD",
    connected: false,
    capability: "repository, PR, and pipeline operations",
    used_by: "Engineering, DevOps",
  },
  {
    name: "Job-board / freelance-market connectors",
    connected: false,
    capability: "candidate sourcing",
    used_by: "Talent Acquisition, Head of People",
  },
  {
    name: "Newswire",
    connected: false,
    capability: "company/market news",
    used_by: "Product Marketing, CEO/CFO",
  },
  {
    name: "CRM + proposal/e-signature platform",
    connected: false,
    capability: "structured pipeline tracking, contract execution",
    used_by: "Sales",
  },
  {
    name: "Figma / Google Stitch (or equivalent design tool)",
    connected: false,
    capability: "generated UI mockups instead of structured text specs",
    used_by: "Design",
  },
  {
    name: "Accounting / billing system",
    connected: false,
    capability: "books, reconciliation, revenue recognition",
    used_by: "Finance, Controller",
  },
];

/**
 * Replaces the old blanket "you have NO tools" sentence in
 * orchestrator.ts's runtimeNotice() with the actual per-capability
 * breakdown, plus the Required Integration block format from
 * 07-mcp-tool-integration-policy.md that an agent should use instead of
 * asserting a capability it doesn't have.
 */
export function renderIntegrationNotice(): string {
  const lines = INTEGRATION_REGISTRY.map(
    (i) => `- ${i.name}: NOT CONNECTED in this run (would provide: ${i.capability})`,
  ).join("\n");

  return `You have NO filesystem access and NO live tool/API calls of any kind in this
run - every integration below is unavailable, regardless of what your spec
above says is normally connected:

${lines}

Do not claim you searched, browsed, queried a CRM, or called any tool - you
did not, and did not have the means to. Where your task would normally use
one of these, either state the resulting gap as an ASSUMPTION or ESTIMATE in
your artifact-meta claims (never as a FACT), or, if the missing capability is
significant enough to call out structurally, include this block in your
artifact body:

Required Integration:
Tool: <name>
Capability: <what it would provide>
Why Needed: <why this task needs it>
Alternative: <what you did instead>
Human Escalation: <what a human should connect/do>`;
}
