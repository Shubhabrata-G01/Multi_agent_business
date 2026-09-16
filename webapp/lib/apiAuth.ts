import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadRun } from "@/lib/runStore";
import { getMembership, type OrgRole } from "@/lib/authz";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      user: null,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }
  return { user: session.user, response: null };
}

/**
 * Loads a run and verifies the authenticated user is a member of its
 * organization (STEP 4 item 3) - the access boundary is organization
 * membership, not who happened to click "start" (run.owner_id, kept only for
 * attribution). Pass `capability` (see lib/authz.ts's canCreateRun/
 * canManageRun/canApproveGate) to further require the member's role support
 * the specific action - an insufficient role gets 403 (they know the run
 * exists and they're a member, just not permitted this action), while a run
 * in an organization they're not a member of at all still gets 404, so a
 * non-member can't distinguish "doesn't exist" from "exists but isn't
 * theirs" (no run-existence leak across organizations).
 */
export async function requireOrgRun(id: string, capability?: (role: OrgRole) => boolean) {
  const result = await requireUser();
  if (result.response || !result.user) {
    return { user: null, run: null, role: null as OrgRole | null, response: result.response };
  }

  const run = await loadRun(id);
  if (!run || !run.organization_id) {
    return {
      user: null,
      run: null,
      role: null as OrgRole | null,
      response: NextResponse.json({ error: "Run not found" }, { status: 404 }),
    };
  }

  const membership = await getMembership(result.user.id, run.organization_id);
  if (!membership) {
    return {
      user: null,
      run: null,
      role: null as OrgRole | null,
      response: NextResponse.json({ error: "Run not found" }, { status: 404 }),
    };
  }

  if (capability && !capability(membership.role)) {
    return {
      user: null,
      run: null,
      role: null as OrgRole | null,
      response: NextResponse.json(
        { error: "Your role does not permit this action." },
        { status: 403 },
      ),
    };
  }

  return { user: result.user, run, role: membership.role, response: null };
}
