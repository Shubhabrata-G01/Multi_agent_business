// Organization/workspace authorization (STEP 4 items 2-4). Every user gets a
// personal Organization at signup (app/api/auth/signup/route.ts) with role
// OWNER; multi-member organizations reuse the same Membership table (adding
// an invite flow to add more members is out of scope for this pass - the
// role model and enforcement are what's implemented here).
import { prisma } from "./prisma";

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";

export interface Membership {
  organization_id: string;
  role: OrgRole;
}

export async function getMembership(userId: string, organizationId: string): Promise<Membership | null> {
  const m = await prisma.membership.findUnique({
    where: { user_id_organization_id: { user_id: userId, organization_id: organizationId } },
  });
  return m ? { organization_id: m.organization_id, role: m.role as OrgRole } : null;
}

/**
 * A user's default organization for a new run. Every user currently has
 * exactly one (their personal workspace from signup); if/when multi-org
 * membership + an org switcher are added, this is the seam to change - every
 * caller already goes through here rather than assuming a shape.
 */
export async function getPrimaryOrganizationId(userId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { user_id: userId },
    orderBy: { organization_id: "asc" },
  });
  return m?.organization_id ?? null;
}

export async function listOrganizationIds(userId: string): Promise<string[]> {
  const memberships = await prisma.membership.findMany({ where: { user_id: userId } });
  return memberships.map((m) => m.organization_id);
}

// Capability matrix. Documented rationale, not derived from anything else -
// change here if the product needs a different split:
// - view a run: any membership role in its organization.
// - create/cancel/resume a run: OWNER/ADMIN/MEMBER. REVIEWER is deliberately
//   read+approve only - it doesn't originate work or spend budget.
// - approve/reject a Level-2+ gate: OWNER/ADMIN/REVIEWER. Deliberately
//   excludes plain MEMBER, so a consequential decision always has at least
//   an admin or a designated reviewer in the loop rather than being
//   rubber-stamped by whoever happened to kick the run off.
export function canCreateRun(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

export function canManageRun(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

export function canApproveGate(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "REVIEWER";
}

// Permanent deletion (STEP 6 item 8) is irreversible, so it's held to a
// higher bar than ordinary run management - only OWNER/ADMIN, never a plain
// MEMBER or REVIEWER.
export function canDeleteRun(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
