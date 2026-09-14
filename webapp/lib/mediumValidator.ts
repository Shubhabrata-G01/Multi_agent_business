import type { FlowStepDef, Medium } from "./types";

// Done-criteria <-> medium consistency - company/architecture/
// 12-business-os-evolution.md §7.1(2). Many flow steps have done-criteria that
// imply a real-world medium the run cannot produce: "deploy to production",
// "validate via usability testing on a clickable prototype", "the target metric
// improves", "reconcile the books". With no tool-execution layer connected, the
// only medium this app can actually produce is a document. This validator infers
// the required medium from a step's own text and, when the run can't provide it,
// watermarks the artifact as document-level so it never silently reads as
// operational completion (the DES-001 done-criteria case, and ChatGPT finding #3
// "artifact generation mistaken for operational completion").
//
// It deliberately does NOT block the run: every business flow contains deploy /
// test / measure steps the app can't execute, so holding on each would break
// every run. Watermarking makes the artifact honest instead.

const MEDIUM_LABELS: Record<Medium, string> = {
  document: "a document (plan/spec/analysis)",
  "live-prototype": "a working/clickable prototype users can actually use",
  deployed: "software actually deployed and running",
  telemetry: "real telemetry/metrics from live usage",
  "external-record": "a record in an external system (books, CRM, signed contract)",
};

// Ordered most-specific first so, e.g., "deploy and measure" resolves to deployed
// before telemetry. Each medium's trigger keywords are matched against the step's
// done-criteria + activity + output artifact.
const MEDIUM_SIGNATURES: { medium: Medium; keywords: RegExp }[] = [
  {
    medium: "deployed",
    keywords: /\bdeploy|in production|production release|go[-\s]?live|shipped to (prod|users)|live in prod/i,
  },
  {
    medium: "external-record",
    keywords: /reconcil\w*|\bbooks\b|\bledger\b|bank statement|invoice (paid|issued)|signed contract|closed[-\s]?won|payment (received|processed)/i,
  },
  {
    medium: "telemetry",
    keywords: /telemetry|\bmetric(s)? (improve|move)|target metric|conversion rate|retention (curve|rate)|\bA\/B\b|experiment result|measured (impact|lift)|usage data shows/i,
  },
  {
    medium: "live-prototype",
    keywords: /usability test|clickable prototype|interactive prototype|prototype (is )?validated|users can complete/i,
  },
];

/** Infer the medium a step's done-criteria actually require, from its own text. */
export function inferRequiredMedium(step: FlowStepDef): Medium {
  const haystack = `${step.done_gate_criteria} ${step.activity} ${step.output_artifact}`;
  for (const sig of MEDIUM_SIGNATURES) {
    if (sig.keywords.test(haystack)) return sig.medium;
  }
  return "document";
}

// Which media a run can actually produce, given its enabled tool scopes.
// "document" is always producible; everything else needs a connected capability.
// enabled_tool_scopes is empty today (no tool-execution layer), so in practice
// only "document" is available - which is the whole point of the watermark.
const SCOPE_TO_MEDIUM: { scope: RegExp; medium: Medium }[] = [
  { scope: /design|figma|prototyp/i, medium: "live-prototype" },
  { scope: /deploy|cloud|ci[-/]?cd|infra/i, medium: "deployed" },
  { scope: /analytics|telemetry|metrics|product-data/i, medium: "telemetry" },
  { scope: /accounting|billing|crm|e-?sign|ledger/i, medium: "external-record" },
];

export function availableMedia(enabledToolScopes: string[] = []): Set<Medium> {
  const media = new Set<Medium>(["document"]);
  for (const scope of enabledToolScopes) {
    for (const { scope: re, medium } of SCOPE_TO_MEDIUM) {
      if (re.test(scope)) media.add(medium);
    }
  }
  return media;
}

export interface MediumCheck {
  required: Medium;
  shortfall: boolean; // true when the run can't produce the required medium
  watermark: string | null; // markdown to append to the artifact when shortfall
  note: string | null; // validation_notes entry when shortfall
}

/**
 * Check a step's required medium against what the run can produce. On a
 * shortfall, returns a watermark (to append to the artifact body) and a note (for
 * the artifact-meta validation_notes) that label the output document-level.
 */
export function checkArtifactMedium(
  step: FlowStepDef,
  enabledToolScopes: string[] = [],
): MediumCheck {
  const required = inferRequiredMedium(step);
  const available = availableMedia(enabledToolScopes);
  if (required === "document" || available.has(required)) {
    return { required, shortfall: false, watermark: null, note: null };
  }
  const label = MEDIUM_LABELS[required];
  return {
    required,
    shortfall: true,
    watermark: `> **Validated at document level, not operationally.** This step's done-criteria call for ${label}, which no connected capability can produce in this run. Treat any "done / validated / deployed / measured" language here as a plan or design at the document level — not evidence that it actually happened.`,
    note: `Medium shortfall: step requires ${required} (${label}) but the run can only produce a document; the artifact was watermarked as document-level rather than operational.`,
  };
}
