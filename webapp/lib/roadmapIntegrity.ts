import { getAgentById, getAllAgents } from "./businessFlow";
import type { Roadmap } from "./types";

// Compose-time roadmap-integrity checks - company/architecture/
// 12-business-os-evolution.md §7.2. These are pure functions over a Roadmap (+
// the registry) that surface structural defects BEFORE a run starts, so the
// remediation fixes in 13-agent-spec-remediation.md can't silently regress.
//
// Implemented here (structurally checkable from the roadmap + registry today):
//  - single primary owner per node        (Step-62 / COO-BOM style collisions)
//  - four-eyes: primary not its own reviewer
//  - known capabilities: every id resolves to a real registry agent
//  - graph refs: depends_on / loop_reentry_target point at real nodes/steps
//  - named integrator per domain (team)    (the Legal/Security GC↔SEC gap)
//
// Deferred to Phase 1a (need capability-level KPI/domain metadata the current
// model doesn't carry): "distinct capability success metric" and
// "operational-sector ownership floor". They are stubbed as no-ops with a note
// rather than faked, so this module never reports a check it can't actually run.

export type IntegritySeverity = "error" | "warning";

export interface RoadmapIntegrityFinding {
  check: string;
  severity: IntegritySeverity;
  node_id?: string;
  detail: string;
}

export function validateRoadmapIntegrity(roadmap: Roadmap): RoadmapIntegrityFinding[] {
  const findings: RoadmapIntegrityFinding[] = [];
  const nodeIds = new Set(roadmap.nodes.map((n) => n.id));
  const flowSteps = new Set(roadmap.nodes.map((n) => n.flow_step));

  for (const node of roadmap.nodes) {
    // 1. Single primary owner. 0 = no owner (error); >1 = ambiguous, and since
    // the runtime uses only required_capabilities[0], the rest are silently
    // dropped (warning - split the node or demote the extras to reviewers).
    if (node.required_capabilities.length === 0) {
      findings.push({
        check: "single-primary-owner",
        severity: "error",
        node_id: node.id,
        detail: `Node ${node.id} (step ${node.flow_step}) has no primary owner.`,
      });
    } else if (node.required_capabilities.length > 1) {
      findings.push({
        check: "single-primary-owner",
        severity: "warning",
        node_id: node.id,
        detail: `Node ${node.id} (step ${node.flow_step}) has multiple primary owners [${node.required_capabilities.join(", ")}]; the runtime uses only the first, so the rest are silently dropped - split the node or demote extras to reviewers.`,
      });
    }

    // 2. Four-eyes: an agent cannot be both the Creator and a reviewer of its own
    // artifact (08-four-eyes-and-critic-mode.md).
    const primary = node.required_capabilities[0];
    if (primary && node.reviewer_capabilities.includes(primary)) {
      findings.push({
        check: "four-eyes",
        severity: "error",
        node_id: node.id,
        detail: `Node ${node.id}: primary owner ${primary} is also listed as a reviewer of its own artifact.`,
      });
    }

    // 3. Known capabilities: every referenced id resolves to a real agent.
    for (const id of [...node.required_capabilities, ...node.reviewer_capabilities]) {
      if (!getAgentById(id)) {
        findings.push({
          check: "known-capabilities",
          severity: "error",
          node_id: node.id,
          detail: `Node ${node.id} references unknown capability/agent id "${id}".`,
        });
      }
    }

    // 4. Graph refs: depends_on must point at real nodes; a loop_reentry_target
    // must match some node's flow_step.
    for (const dep of node.depends_on) {
      if (!nodeIds.has(dep)) {
        findings.push({
          check: "graph-refs",
          severity: "error",
          node_id: node.id,
          detail: `Node ${node.id} depends_on unknown node "${dep}".`,
        });
      }
    }
    if (node.loop_reentry_target && !flowSteps.has(node.loop_reentry_target)) {
      findings.push({
        check: "graph-refs",
        severity: "error",
        node_id: node.id,
        detail: `Node ${node.id} has loop_reentry_target "${node.loop_reentry_target}" which matches no node's flow step.`,
      });
    }
  }

  // 5. Named integrator per domain (team). For each team that has >= 2 of its
  // agents actually used in this roadmap, there must be an in-team manager - an
  // agent one of whose fellow used team-agents reports to. If a team's used
  // agents all report outward to different heads with none managing another, the
  // domain has no single accountable integrator (the Legal/Security GC↔SEC gap).
  findings.push(...namedIntegratorFindings(roadmap));

  return findings;
}

function namedIntegratorFindings(roadmap: Roadmap): RoadmapIntegrityFinding[] {
  const out: RoadmapIntegrityFinding[] = [];
  const agentsById = new Map(getAllAgents().map((a) => [a.id, a]));

  // Agents actually used anywhere in the roadmap.
  const usedIds = new Set<string>();
  for (const node of roadmap.nodes) {
    for (const id of [...node.required_capabilities, ...node.reviewer_capabilities]) {
      usedIds.add(id);
    }
  }

  // Group used agents by team.
  const byTeam = new Map<string, string[]>();
  for (const id of usedIds) {
    const a = agentsById.get(id);
    if (!a) continue;
    const list = byTeam.get(a.team) ?? [];
    list.push(id);
    byTeam.set(a.team, list);
  }

  for (const [team, ids] of byTeam) {
    if (ids.length < 2) continue;
    // A domain has a single accountable integrator if EITHER one used team-agent
    // manages another (an in-team lead), OR all used team-agents share one common
    // parent (a de facto integrator one level up). It lacks one only when neither
    // holds - the agents report to two or more different heads with none managing
    // another, so cross-cutting work falls between them. This is exactly the
    // Legal/Security case (GC-001->CEO-001, SEC-001->CTO-001), and precisely NOT
    // the Operations/Finance/Design case (all reporting to one common head).
    const hasInTeamManager = ids.some((id) =>
      ids.some((other) => other !== id && agentsById.get(other)?.reports_to === id),
    );
    const heads = [...new Set(ids.map((id) => agentsById.get(id)?.reports_to).filter(Boolean))];
    if (!hasInTeamManager && heads.length >= 2) {
      out.push({
        check: "named-integrator",
        severity: "warning",
        detail: `Domain "${team}" has no single accountable integrator: its agents [${ids.join(", ")}] report to different heads [${heads.join(", ")}] with none managing another, so cross-cutting work in this domain falls between them.`,
      });
    }
  }

  return out;
}

/** Convenience: only the blocking (error-severity) findings. A composer can
 * refuse to start a run when this is non-empty while still surfacing warnings. */
export function roadmapIntegrityErrors(roadmap: Roadmap): RoadmapIntegrityFinding[] {
  return validateRoadmapIntegrity(roadmap).filter((f) => f.severity === "error");
}
