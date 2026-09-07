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
