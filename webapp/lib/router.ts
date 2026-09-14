import {
  getAgentById,
  getPrimaryAgentsForStep,
  getSupportingAgentsForStep,
} from "./businessFlow";
import type { FlowStepDef, RegistryAgent, WorkflowNode } from "./types";

// Capability router (§3.5). Converts a node's declared capabilities into the
// concrete agents that serve it. For software-saas-v1 nodes the capabilities are
// exactly the registry's primary/supporting mappings (so behavior is unchanged);
// for pack-injected nodes - which are NOT in the registry's flow_*_steps reverse
// maps - this is the ONLY thing that resolves their agents, since it reads the
// node's own required/reviewer_capabilities rather than re-querying the flow.

/** True when a node carries the Phase-0b+ capability fields (i.e. it is a
 * WorkflowNode, not a bare legacy FlowStepDef). */
function isWorkflowNode(node: FlowStepDef): node is WorkflowNode {
  return Array.isArray((node as Partial<WorkflowNode>).required_capabilities);
}

export interface RoutedNode {
  creator: RegistryAgent | undefined;
  reviewers: RegistryAgent[];
  dropped: string[]; // capability ids that did not resolve to a real agent
}

/**
 * Resolve the Creator agent for a node: its first required capability that
 * resolves to a registry agent. Falls back to the flow's primary mapping for a
 * legacy node without capability fields.
 */
export function creatorForNode(node: FlowStepDef): RegistryAgent | undefined {
  if (isWorkflowNode(node)) {
    for (const id of node.required_capabilities) {
      const agent = getAgentById(id);
      if (agent) return agent;
    }
    return undefined;
  }
  return getPrimaryAgentsForStep(node.flow_step)[0];
}

/**
 * Resolve the reviewer (Critic) agents for a node from its reviewer_capabilities,
 * capped at `max`. Falls back to the flow's supporting mapping for a legacy node.
 * A node's own Creator is never returned as a reviewer of its own artifact
 * (four-eyes), even if the capability lists overlap.
 */
export function reviewersForNode(node: FlowStepDef, max: number): RegistryAgent[] {
  if (isWorkflowNode(node)) {
    const creatorId = creatorForNode(node)?.id;
    const seen = new Set<string>();
    const out: RegistryAgent[] = [];
    for (const id of node.reviewer_capabilities) {
      if (id === creatorId || seen.has(id)) continue;
      const agent = getAgentById(id);
      if (agent) {
        seen.add(id);
        out.push(agent);
        if (out.length >= max) break;
      }
    }
    return out;
  }
  return getSupportingAgentsForStep(node.flow_step).slice(0, max);
}

/** Full routing result for a node, including which capability ids were dropped
 * because no agent matched - surfaced for diagnostics/tests. */
export function routeNode(node: WorkflowNode, max: number): RoutedNode {
  const creator = creatorForNode(node);
  const reviewers = reviewersForNode(node, max);
  const dropped = [...node.required_capabilities, ...node.reviewer_capabilities].filter(
    (id) => !getAgentById(id),
  );
  return { creator, reviewers, dropped };
}
