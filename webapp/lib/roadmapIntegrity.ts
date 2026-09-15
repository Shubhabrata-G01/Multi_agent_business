import { getAgentById, getAllAgents } from "./businessFlow";
import { capabilityKpi } from "./capabilityKpis";
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
//  - operational-sector ownership floor     (Operations owns no primary node)
//  - distinct capability success metric      (the CFO/FPA, CPO/PA, COO/BOM class)
//
// All four §7.2 structural checks are now implemented (the last two arrived with
// the capability packs + capabilityKpis.ts in Phase 1a/1b).

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

  // 6. Operational-sector ownership floor (§7.2). Finance, People, Operations and
  // Sales must each hold PRIMARY ownership of at least one node, not appear only
  // as reviewers. On the base software-saas-v1 roadmap this flags exactly
  // Operations (its "clearest weak sector" finding).
  findings.push(...operationalFloorFindings(roadmap));

  // 7. Distinct capability success metric (§7.2). Every capability that owns a
  // node must declare a KPI (capabilityKpis.ts), and no two owners may share one
  // - the mechanical form of the P1 KPI-redundancy fixes (CFO/FPA, CPO/PA,
  // COO/BOM). Catches a future owning capability with no metric or a duplicate.
  findings.push(...distinctKpiFindings(roadmap));

  return findings;
}

function distinctKpiFindings(roadmap: Roadmap): RoadmapIntegrityFinding[] {
  const out: RoadmapIntegrityFinding[] = [];
  const owners = new Set<string>();
  for (const node of roadmap.nodes) {
    const primary = node.required_capabilities[0];
    if (primary) owners.add(primary);
  }
  const kpiToOwners = new Map<string, string[]>();
  for (const owner of owners) {
    const kpi = capabilityKpi(owner);
    if (!kpi) {
      out.push({
        check: "distinct-capability-kpi",
        severity: "warning",
        detail: `Capability ${owner} owns node(s) but declares no success metric (capabilityKpis.ts) - it cannot be held to a distinct, non-inherited KPI.`,
      });
      continue;
    }
    kpiToOwners.set(kpi, [...(kpiToOwners.get(kpi) ?? []), owner]);
  }
  for (const [kpi, sharers] of kpiToOwners) {
    if (sharers.length > 1) {
      out.push({
        check: "distinct-capability-kpi",
        severity: "warning",
        detail: `Capabilities [${sharers.join(", ")}] share the same success metric "${kpi}" - each node-owning capability must have its own, so you're paying for several that measure the same thing.`,
      });
    }
  }
  return out;
}

const OPERATIONAL_TEAMS = ["Finance", "People / HR", "Operations", "Sales / Revenue"];

function operationalFloorFindings(roadmap: Roadmap): RoadmapIntegrityFinding[] {
  const agentsById = new Map(getAllAgents().map((a) => [a.id, a]));
  const primaryTeams = new Set<string>();
  for (const node of roadmap.nodes) {
    const primaryId = node.required_capabilities[0];
    const team = primaryId ? agentsById.get(primaryId)?.team : undefined;
    if (team) primaryTeams.add(team);
  }
  const out: RoadmapIntegrityFinding[] = [];
  for (const team of OPERATIONAL_TEAMS) {
    if (!primaryTeams.has(team)) {
      out.push({
        check: "operational-ownership-floor",
        severity: "warning",
        detail: `Operational domain "${team}" owns no primary node in this roadmap - it appears only as a supporting/reviewing actor. Give it primary ownership of at least the operational work it should own.`,
      });
    }
  }
  return out;
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
