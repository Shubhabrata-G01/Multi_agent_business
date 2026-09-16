// Export formats (STEP 5 item 9): JSON audit bundle, Markdown summary, CSV
// artifact index, evidence ledger, assumption register, decision log,
// approval history. Reuses the existing derived views (artifactStore.ts's
// getAssumptionRegister/getDecisionLog/getEvidenceLedger/queryArtifacts,
// listArtifactVersions) rather than recomputing them - this module is only
// about shaping those into each output format.
import {
  getAssumptionRegister,
  getDecisionLog,
  getEvidenceLedger,
  listArtifactVersions,
  queryArtifacts,
} from "./artifactStore";
import { listComments, listReviews } from "./reviews";
import type { RunState } from "./types";

export async function buildJsonAuditBundle(run: RunState) {
  const flowSteps = Array.from(new Set(run.steps.map((s) => s.flow_step)));
  const artifactsByStep = Object.fromEntries(
    await Promise.all(flowSteps.map(async (step) => [step, await listArtifactVersions(run.id, step)])),
  );
  const [assumptions, decisions, evidence, comments, reviews] = await Promise.all([
    getAssumptionRegister(run.id),
    getDecisionLog(run.id),
    getEvidenceLedger(run.id),
    listComments(run.id),
    listReviews(run.id),
  ]);

  return {
    exported_at: new Date().toISOString(),
    disclaimer:
      "AI-generated output. Simulation-mode runs are fully autonomous and " +
      "NOT human-approved; assisted-mode runs pause for human approval only " +
      "at Level-2+ gates - everything else here is drafted by AI and should " +
      "be treated as advisory, not verified fact, until a human reviews it.",
    run,
    artifacts_by_step: artifactsByStep,
    assumption_register: assumptions,
    decision_log: decisions,
    evidence_ledger: evidence,
    approval_history: run.approvals ?? [],
    comments,
    reviews,
  };
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c])).join(","));
  return [header, ...lines].join("\n");
}

export async function buildArtifactIndexCsv(run: RunState): Promise<string> {
  const index = await queryArtifacts(run.id, {});
  return toCsv(
    index.map((e) => ({ ...e, claim_counts: JSON.stringify(e.claim_counts) })),
    [
      "flow_step",
      "attempt",
      "output_artifact",
      "agent_id",
      "agent_name",
      "confidence",
      "evidence_quality",
      "decision",
      "claim_counts",
      "created_at",
    ],
  );
}

export async function buildMarkdownExport(run: RunState): Promise<string> {
  const lines: string[] = [];
  lines.push(`# ${run.idea}`);
  lines.push("");
  lines.push(
    "> **Advisory notice:** this document is AI-generated output from an automated " +
      `run (mode: ${run.mode ?? "simulation"}). ` +
      (run.mode === "assisted"
        ? "Only Level-2+ decision gates that were explicitly approved below carry human sign-off; everything else is a draft."
        : "Simulation mode runs fully autonomously with NO human approval at any point.") +
      " Treat every claim as advisory until independently verified.",
  );
  lines.push("");
  lines.push(`- Status: **${run.status}**`);
  lines.push(`- Provider/model: ${run.provider} / ${run.model}`);
  lines.push(`- Created: ${run.created_at}`);
  lines.push("");

  for (const step of run.steps) {
    if (!step.content) continue;
    lines.push(`## Step ${step.flow_step} — ${step.activity}`);
    lines.push(`*${step.business_phase} · ${step.agent_name} · attempt ${step.attempt}*`);
    if (step.meta) {
      lines.push(
        `Confidence: ${step.meta.confidence} · Evidence quality: ${step.meta.evidence_quality}` +
          (step.meta.decision ? ` · Decision: ${step.meta.decision}` : ""),
      );
    }
    lines.push("");
    lines.push(step.content);
    lines.push("");
  }

  const approvals = run.approvals ?? [];
  if (approvals.length > 0) {
    lines.push("## Approval history");
    for (const a of approvals) {
      lines.push(
        `- Step ${a.flow_step} (attempt ${a.attempt}): **${a.status}**` +
          (a.decided_by ? ` by ${a.decided_by}${a.decided_by_role ? ` (${a.decided_by_role})` : ""}` : "") +
          (a.reason ? ` — ${a.reason}` : ""),
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
