// Mirrors the "what is actually connected" section of
// company/architecture/07-mcp-tool-integration-policy.md. `connected: false`
// here means "not wired up as a standing capability of this app" - it's the
// static baseline. One entry (Web research) can be upgraded to genuinely live
// for a single call: orchestrator.ts turns on Anthropic's server-side
// web_search tool for Creator calls on evidence-led phases (see
// webSearchEnabledFor in orchestrator.ts) and passes its name into
// renderIntegrationNotice() below so that call's system prompt reflects the
// truth instead of a blanket "you have no tools" sentence. Every other entry
// stays false because it would need its own account/credentials (a CRM, a
// paid research panel, Google Workspace, etc.) that nothing in this repo
// currently holds.
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
    name: "User research panel / participant recruiting",
    connected: false,
    capability:
      "recruiting, scheduling, and conducting real primary interviews or surveys with actual target users",
    used_by: "UX Research, Product",
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
/**
 * @param connectedThisCall - names (must match INTEGRATION_REGISTRY entries)
 * that are genuinely live for this specific call, e.g. ["Web research (search
 * + page fetch)"] when orchestrator.ts turned on Anthropic's web_search tool
 * for this Creator call. Everything else still renders as NOT CONNECTED.
 */
export function renderIntegrationNotice(connectedThisCall: string[] = []): string {
  const connectedSet = new Set(connectedThisCall);
  const lines = INTEGRATION_REGISTRY.map((i) =>
    connectedSet.has(i.name)
      ? `- ${i.name}: CONNECTED for this call (provides: ${i.capability}) - you may actually use it.`
      : `- ${i.name}: NOT CONNECTED in this run (would provide: ${i.capability})`,
  ).join("\n");

  const usageNote = connectedSet.size
    ? `\nFor any tool marked CONNECTED above: actually invoke it before relying on
what it would tell you - then cite the real URL/source it returned in that
claim's "source" field. A CONNECTED tool you don't use gives no credit; a
claim that reads like it came from one but names no real source is still an
unsourced claim.\n`
    : "";

  return `You have NO filesystem access in this run. Your live tool/API access is
exactly what is marked CONNECTED below - every other integration is
unavailable this call, regardless of what your spec above says is normally
connected:

${lines}
${usageNote}
Do not claim you searched, browsed, queried a CRM, or called any tool that is
NOT marked CONNECTED above - you did not, and did not have the means to.
Where your task would normally use one of the NOT CONNECTED tools, either
state the resulting gap as an ASSUMPTION or ESTIMATE in your artifact-meta
claims (never as a FACT), or, if the missing capability is significant enough
to call out structurally, include this block in your artifact body:

Required Integration:
Tool: <name>
Capability: <what it would provide>
Why Needed: <why this task needs it>
Alternative: <what you did instead>
Human Escalation: <what a human should connect/do>`;
}
