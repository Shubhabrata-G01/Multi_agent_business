import type { ArtifactMeta, Claim } from "./types";

// Deterministic claim-source-consistency validator - company/architecture/
// 12-business-os-evolution.md §7.1(1). This is the mechanical control that makes
// the PERF-001 class of integrity violation impossible to ship silently: a claim
// asserted as FACT whose stated source names a tool/connector that is NOT
// connected for the call (e.g. "reconciled against ad-platform spend export and
// CRM records" when neither is wired up). Such a claim is auto-downgraded
// FACT -> ASSUMPTION, the change is recorded in validation_notes (never a silent
// rewrite - same philosophy as validateArtifactMeta), and the caller is handed a
// list of violations so a gate step can refuse to pass on one (see evaluateGate).
//
// Scope is deliberately narrow: ONLY claims labeled FACT are affected. A FACT
// asserts verified provenance, so citing an unavailable tool as its basis is a
// real integrity problem. An ESTIMATE/ASSUMPTION that references data it manually
// compiled is already honest about its weaker strength and is left untouched -
// so the corrected, properly-labeled PERF-001 example does NOT trip this.

const WEB_RESEARCH = "Web research (search + page fetch)";

interface ToolSignature {
  label: string;
  // The INTEGRATION_REGISTRY name that, if present in connectedThisCall, would
  // make a citation of this tool legitimate. Undefined = this app has no such
  // integration at all, so citing it as a FACT source is always a violation.
  integration?: string;
  keywords: RegExp;
}

// Operational data sources an agent might cite as a FACT's provenance. Only
// "Web research" is ever actually connectable in this app; everything else has
// no integration, so a FACT sourced from it is always inconsistent with reality.
const TOOL_SIGNATURES: ToolSignature[] = [
  {
    label: "CRM / pipeline system",
    integration: "CRM + proposal/e-signature platform",
    keywords: /\bCRM\b|salesforce|hubspot|pipedrive|closed[-\s]?won|pipeline record/i,
  },
  {
    label: "e-signature / contract system",
    integration: "CRM + proposal/e-signature platform",
    keywords: /e-?signature|docusign|signed[-\s]?contract record/i,
  },
  {
    label: "ad platform",
    keywords: /\bad[-\s]?platform|google ads|meta ads|facebook ads|linkedin ads|ad[-\s]?spend export|\bROAS\b/i,
  },
  {
    label: "web analytics",
    keywords: /google analytics|\bGA4\b|search console|mixpanel|amplitude|analytics dashboard/i,
  },
  {
    label: "accounting / billing system",
    integration: "Accounting / billing system",
    keywords: /quickbooks|\bxero\b|general ledger|\bledger\b|reconcil\w*|accounts (payable|receivable)|billing system/i,
  },
  {
    label: "product telemetry",
    keywords: /\btelemetry\b|instrumentation export|usage[-\s]?event stream/i,
  },
];

const URL_RE = /https?:\/\/\S+/i;

export interface ClaimSourceViolation {
  claim: string; // the offending claim text
  cited: string; // what tool/source it named that isn't available
  downgraded: boolean; // whether the claim's type was changed (FACT -> assumption)
}

function isConnected(sig: ToolSignature, connected: Set<string>): boolean {
  return sig.integration ? connected.has(sig.integration) : false;
}

/**
 * Returns a new ArtifactMeta with offending FACT claims downgraded and a note
 * per downgrade appended to validation_notes, plus the list of violations found.
 * Pure - does not mutate the input. `connectedThisCall` is the same set of
 * INTEGRATION_REGISTRY names the orchestrator passes to renderIntegrationNotice
 * for this call (today: web research on evidence-led Creator calls, else empty).
 */
export function validateClaimSources(
  meta: ArtifactMeta,
  connectedThisCall: string[] = [],
): { meta: ArtifactMeta; violations: ClaimSourceViolation[] } {
  const connected = new Set(connectedThisCall);
  const violations: ClaimSourceViolation[] = [];
  const addedNotes: string[] = [];

  const claims: Claim[] = meta.claims.map((c) => {
    // Only FACT claims assert verified provenance; weaker labels are honest
    // about their basis and are left alone.
    if (c.type !== "fact") return c;
    const source = (c.source ?? "").trim();
    if (!source) return c; // unsourced FACTs are validateArtifactMeta's job, not this one

    for (const sig of TOOL_SIGNATURES) {
      if (sig.keywords.test(source) && !isConnected(sig, connected)) {
        violations.push({ claim: c.text, cited: sig.label, downgraded: true });
        addedNotes.push(
          `Downgraded a FACT to ASSUMPTION: it cited ${sig.label} as its source, but that tool is not connected for this call (claim: "${truncate(c.text)}").`,
        );
        return { ...c, type: "assumption" as const };
      }
    }

    // A FACT sourced from a browsed URL is only legitimate when web research is
    // actually connected for this call; otherwise the agent could not have
    // fetched it.
    if (URL_RE.test(source) && !connected.has(WEB_RESEARCH)) {
      violations.push({ claim: c.text, cited: "a browsed URL (web research not connected)", downgraded: true });
      addedNotes.push(
        `Downgraded a FACT to ASSUMPTION: its source is a URL but web research is not connected for this call, so it could not have been fetched (claim: "${truncate(c.text)}").`,
      );
      return { ...c, type: "assumption" as const };
    }

    return c;
  });

  if (violations.length === 0) {
    return { meta, violations };
  }
  return {
    meta: { ...meta, claims, validation_notes: [...meta.validation_notes, ...addedNotes] },
    violations,
  };
}

function truncate(s: string, n = 120): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}
