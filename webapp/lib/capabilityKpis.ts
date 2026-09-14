// One accountable success metric per capability (agent), derived from each
// agent's own Monitoring & KPIs section (including the P1 remediation that gave
// CEO/CPO/CFO/FPA/COO/BOM distinct metrics). This is the metadata the §7.2
// "distinct capability success metric" check needs: every capability that owns a
// node must declare a KPI here, and no two node-owning capabilities may share
// one. Kept 1:1 and distinct by construction, so the base roadmap passes; the
// check then catches a future regression - a new owning capability with no
// declared metric, or a duplicate slug.

export const CAPABILITY_KPIS: Record<string, string> = {
  // Executive
  "CEO-001": "decision-quality-and-okr-attainment",
  "CTO-001": "reliability-and-dora",
  "CFO-001": "board-plan-vs-actual",
  "COO-001": "operating-cadence-adherence",
  // Product
  "CPO-001": "pmf-signal-strength",
  "PM-001": "requirement-delivery-cycle-time",
  "PA-001": "product-analytics-funnel",
  // Design / UX
  "DES-001": "design-quality",
  "UXR-001": "research-validity",
  // Growth / Marketing
  "CMO-001": "demand-funnel-performance",
  "PMM-001": "positioning-adoption",
  "CONT-001": "organic-traffic",
  "PERF-001": "cac-and-roas",
  // Sales / Revenue
  "CRO-001": "revenue-attainment",
  "SDR-001": "qualified-pipeline",
  "AE-001": "close-rate",
  "REVOPS-001": "pipeline-hygiene-forecast",
  // Customer Success
  "HCS-001": "net-retention",
  "CSM-001": "account-retention-expansion",
  "SUP-001": "sla-attainment",
  // People / HR
  "HRH-001": "retention-and-time-to-fill",
  "TA-001": "sourcing-yield",
  // Operations
  "BOM-001": "workflow-sop-coverage",
  "IT-001": "access-provisioning-timeliness",
  // Engineering
  "ARCH-001": "nfr-compliance",
  "EM-001": "delivery-predictability",
  "BE-001": "backend-change-quality",
  "FE-001": "frontend-change-quality",
  "QA-001": "defect-escape-rate",
  "DEVOPS-001": "deployment-reliability",
  // AI / Data
  "HAI-001": "ai-cost-efficiency",
  "AIE-001": "ai-feature-quality",
  "AIEVAL-001": "eval-coverage",
  "DE-001": "data-freshness-quality",
  // Finance
  "FPA-001": "forecast-vs-actual-accuracy",
  "CTRL-001": "days-to-close",
  // Legal / Security
  "GC-001": "contract-sla-and-legal-risk",
  "SEC-001": "vulnerability-closure",
};

export function capabilityKpi(agentId: string): string | undefined {
  return CAPABILITY_KPIS[agentId];
}
