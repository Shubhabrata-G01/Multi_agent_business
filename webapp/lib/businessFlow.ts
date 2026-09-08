import fs from "fs";
import path from "path";
import type { FlowStepDef, RegistryAgent } from "./types";

// This app reads its agent specs and business-flow definition directly from
// the sibling `company/` directory (the source of truth built earlier in
// this project) rather than duplicating them - so editing a spec there is
// automatically picked up here without a regeneration step.
const COMPANY_DIR =
  process.env.COMPANY_DIR ?? path.join(process.cwd(), "..", "company");

let _registry: RegistryAgent[] | null = null;
let _flow: FlowStepDef[] | null = null;
const _specCache = new Map<string, string>();

function loadRegistry(): RegistryAgent[] {
  if (_registry) return _registry;
  const raw = fs.readFileSync(
    path.join(COMPANY_DIR, "agents", "registry.json"),
    "utf-8",
  );
  _registry = JSON.parse(raw) as RegistryAgent[];
  return _registry;
}

function loadFlow(): FlowStepDef[] {
  if (_flow) return _flow;
  const raw = fs.readFileSync(
    path.join(COMPANY_DIR, "workflow", "business-flow.json"),
    "utf-8",
  );
  _flow = JSON.parse(raw) as FlowStepDef[];
  return _flow;
}

export function getFlowSteps(): FlowStepDef[] {
  return loadFlow();
}

export function getAgentById(id: string): RegistryAgent | undefined {
  return loadRegistry().find((a) => a.id === id);
}

/** Full spec markdown for an agent, read once and cached in memory. */
export function getAgentSpecText(id: string): string {
  const cached = _specCache.get(id);
  if (cached) return cached;
  const agent = getAgentById(id);
  if (!agent) {
    throw new Error(`Unknown agent id: ${id}`);
  }
  const relPath = agent.file.replace(/^\//, "").split("/").join(path.sep);
  const fullPath = path.join(COMPANY_DIR, "..", relPath);
  const text = fs.readFileSync(fullPath, "utf-8");
  _specCache.set(id, text);
  return text;
}

/**
 * For a given flow step number, return the primary agent(s) responsible,
 * derived from registry.json's flow_primary_steps (the same verified
 * mapping used to generate the .claude/agents subagents) rather than
 * re-parsing the free-text "primary_role" column.
 */
export function getPrimaryAgentsForStep(flowNo: string): RegistryAgent[] {
  return loadRegistry().filter((a) => a.flow_primary_steps.includes(flowNo));
}

/**
 * For a given flow step number, return every agent whose registry.json
 * flow_supporting_steps names this step - the same verified reverse mapping
 * getPrimaryAgentsForStep uses, just against the supporting list instead of
 * the primary one. This is what actually invokes an agent that is never a
 * step's primary actor (e.g. AE-001/SDR-001/REVOPS-001 on step 66), rather
 * than re-parsing the free-text "supporting_roles" column, which has no
 * reliable 1:1 mapping back to a specific registry agent.
 */
export function getSupportingAgentsForStep(flowNo: string): RegistryAgent[] {
  return loadRegistry().filter((a) => a.flow_supporting_steps.includes(flowNo));
}

/**
 * A "gate" step is one whose entire output IS a decision/sign-off artifact
 * (a Go/No-Go, an approval, an authorization) rather than a document that
 * merely informs one. Only these steps run the Approver/Executor phase -
 * running it on every step would mean rubber-stamping ordinary documents,
 * which company/architecture/05-permissions-and-hitl.md doesn't ask for.
 */
export function isGateStep(step: FlowStepDef): boolean {
  return (
    /go \/ no-go|approval|authorization/i.test(step.output_artifact) ||
    step.business_phase === "Go / No-Go"
  );
}

/** The flow step immediately after the given one, if any - used to resolve a
 * gate step's Executor as "whoever the pipeline hands this artifact to
 * next," since the flow is already strictly sequential. */
export function getNextStepDef(flowNo: string): FlowStepDef | undefined {
  const flow = loadFlow();
  const idx = flow.findIndex((s) => s.flow_step === flowNo);
  if (idx === -1) return undefined;
  return flow[idx + 1];
}

export function getStepDef(flowNo: string): FlowStepDef | undefined {
  return loadFlow().find((s) => s.flow_step === flowNo);
}

// The four business phases the user specifically called out as needing to be
// evidence-led rather than artifact-led: discovery, validation, QA, PMF.
const EVIDENCE_LED_PHASES = new Set([
  "Problem Discovery",
  "Market Validation",
  "Quality",
  "Product-Market Fit",
]);

export function isEvidenceLedPhase(businessPhase: string): boolean {
  return EVIDENCE_LED_PHASES.has(businessPhase);
}

/**
 * Extracts an explicit "Return to Step NN" / "Step NN" back-reference from a
 * loop_reentry_condition string, when one exists (e.g. "Return to Step 29
 * until critical concerns are resolved"). Most loop_reentry_condition text is
 * non-numeric ("revise pricing/product/channel assumptions," "repeat
 * interviews") - that's intentionally NOT treated as a return-to-step target
 * here; it's handled as a same-step retry instead (see evaluateGate in
 * orchestrator.ts). Returns the zero-padded flow_step string, or null.
 */
export function parseReturnToStep(loopCondition: string): string | null {
  const match = loopCondition.match(/step\s*0*(\d{1,2})/i);
  if (!match) return null;
  return match[1].padStart(2, "0");
}
