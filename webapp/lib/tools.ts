import type { ExecutionMode } from "./types";

// Tool-execution layer (Phase 2c, §3.2). This is the SEAM for agents to invoke
// real tools - a registry, permission scopes, dry-run, and an audit trail -
// built so it is safe by construction TODAY: no connector is actually wired, so
// every call is either refused or a dry-run that performs NO real side effect and
// records an audit entry. This matches the non-goal "do not connect CRMs,
// payment, email, deploy, or banking before the plan and approval model are
// safe": the layer exists and is enforced, but nothing is live.

export interface ToolDef {
  name: string;
  scope: string; // permission scope (run.config.enabled_tool_scopes) required to use it
  description: string;
  side_effect: boolean; // whether a real invocation would change the outside world
}

// Deliberately all side-effecting and all currently unconnected. Scopes line up
// with integrations.ts capabilities.
export const TOOL_REGISTRY: ToolDef[] = [
  { name: "crm.upsert_contact", scope: "crm", description: "Create/update a CRM contact", side_effect: true },
  { name: "email.send", scope: "email", description: "Send an email", side_effect: true },
  { name: "calendar.create_event", scope: "calendar", description: "Create a calendar event", side_effect: true },
  { name: "repo.open_pr", scope: "code", description: "Open a pull request", side_effect: true },
  { name: "deploy.release", scope: "deploy", description: "Deploy a release", side_effect: true },
  { name: "payment.charge", scope: "payments", description: "Charge a payment method", side_effect: true },
  { name: "accounting.post_entry", scope: "accounting", description: "Post an accounting entry", side_effect: true },
];

const TOOL_BY_NAME = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

export type ToolDecision = "dry_run" | "refused_unknown" | "refused_scope" | "refused_simulation";

export interface ToolAuditEntry {
  tool: string;
  args: Record<string, unknown>;
  decision: ToolDecision;
  reason: string;
  at: string;
}

export interface ToolContext {
  mode: ExecutionMode;
  enabledScopes: string[];
}

export interface ToolResult {
  ok: boolean; // true only for a completed (dry-run) invocation
  dry_run: boolean;
  output: unknown;
  audit: ToolAuditEntry;
}

/**
 * Attempt to invoke a tool. Never performs a real side effect in this build:
 * - unknown tool -> refused.
 * - simulation mode -> every side-effecting tool refused (simulation has no
 *   external effects at all).
 * - assisted mode but the tool's scope isn't enabled for the run -> refused.
 * - assisted mode with the scope enabled -> DRY RUN: returns a simulated result
 *   and an audit entry, without executing anything real (no connector is wired).
 */
export function invokeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolResult {
  const at = new Date().toISOString();
  const def = TOOL_BY_NAME.get(toolName);

  const refuse = (decision: ToolDecision, reason: string): ToolResult => ({
    ok: false,
    dry_run: false,
    output: null,
    audit: { tool: toolName, args, decision, reason, at },
  });

  if (!def) {
    return refuse("refused_unknown", `No such tool "${toolName}" in the registry.`);
  }
  if (ctx.mode === "simulation" && def.side_effect) {
    return refuse(
      "refused_simulation",
      "Simulation mode performs no external side effects; the tool was not invoked.",
    );
  }
  if (!ctx.enabledScopes.includes(def.scope)) {
    return refuse(
      "refused_scope",
      `Tool scope "${def.scope}" is not enabled for this run.`,
    );
  }
  // Scope enabled: still a DRY RUN, because no real connector is wired in this
  // build. Records the audit entry and returns a simulated result.
  return {
    ok: true,
    dry_run: true,
    output: { dry_run: true, tool: toolName, note: "No live connector; simulated result." },
    audit: {
      tool: toolName,
      args,
      decision: "dry_run",
      reason: "Scope enabled but no live connector is wired; performed a dry run.",
      at,
    },
  };
}
