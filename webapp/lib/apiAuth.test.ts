import crypto from "crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// Cross-tenant access isolation (STEP 4 item 15). Mocks next-auth's auth()
// so requireOrgRun can be exercised end-to-end (session -> membership check
// -> capability check) against a real PostgreSQL instance, without needing
// an actual HTTP request/cookie.
const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

const mockSession = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => mockSession(),
}));

describeIfDb("requireOrgRun (cross-tenant access isolation)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupOrgIds: string[] = [];
  const cleanupRunIds: string[] = [];

  afterEach(() => {
    mockSession.mockReset();
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    if (cleanupRunIds.length) await prisma.run.deleteMany({ where: { id: { in: cleanupRunIds } } });
    if (cleanupOrgIds.length) await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
    if (cleanupUserIds.length) await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await prisma.$disconnect();
  });

  async function makeUserWithOrg(role: "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER" = "OWNER") {
    const { prisma } = await import("./prisma");
    const user = await prisma.user.create({
      data: { email: `${crypto.randomUUID()}@example.com`, password_hash: "x" },
    });
    cleanupUserIds.push(user.id);
    const org = await prisma.organization.create({ data: { name: "Test Org" } });
    cleanupOrgIds.push(org.id);
    await prisma.membership.create({ data: { user_id: user.id, organization_id: org.id, role } });
    return { user, org };
  }

  async function makeRun(organizationId: string, ownerId: string) {
    const { saveRun } = await import("./runStore");
    const id = `test-authz-run-${crypto.randomUUID()}`;
    cleanupRunIds.push(id);
    const now = new Date().toISOString();
    await saveRun({
      id,
      owner_id: ownerId,
      organization_id: organizationId,
      idea: "idea",
      status: "running",
      created_at: now,
      updated_at: now,
      current_step_index: 0,
      total_steps: 1,
      steps: [],
      error: null,
      provider: "anthropic",
      model: "test-model",
      key_source: "server_env",
      step_attempts: {},
      jump_counts: {},
      path: [],
      total_executions: 0,
    });
    return id;
  }

  it("lets a member of the run's own organization view it", async () => {
    const { requireOrgRun } = await import("./apiAuth");
    const { user, org } = await makeUserWithOrg("MEMBER");
    const runId = await makeRun(org.id, user.id);
    mockSession.mockResolvedValue({ user: { id: user.id, email: user.email } });

    const result = await requireOrgRun(runId);
    expect(result.response).toBeNull();
    expect(result.run?.id).toBe(runId);
  });

  it("returns 404 (not 403) for a run belonging to a DIFFERENT organization - no cross-tenant existence leak", async () => {
    const { requireOrgRun } = await import("./apiAuth");
    const { user: ownerUser, org: ownerOrg } = await makeUserWithOrg("OWNER");
    const { user: outsider } = await makeUserWithOrg("OWNER"); // a separate, unrelated org
    const runId = await makeRun(ownerOrg.id, ownerUser.id);

    mockSession.mockResolvedValue({ user: { id: outsider.id, email: outsider.email } });
    const result = await requireOrgRun(runId);

    expect(result.run).toBeNull();
    expect(result.response?.status).toBe(404);
  });

  it("returns 401 for an unauthenticated request", async () => {
    const { requireOrgRun } = await import("./apiAuth");
    mockSession.mockResolvedValue(null);
    const result = await requireOrgRun("any-run-id");
    expect(result.response?.status).toBe(401);
  });

  it("returns 403 (member IS in the org, but lacks the capability) for a role-gated action", async () => {
    const { requireOrgRun } = await import("./apiAuth");
    const { canApproveGate } = await import("./authz");
    const { user, org } = await makeUserWithOrg("MEMBER"); // MEMBER cannot approve gates
    const runId = await makeRun(org.id, user.id);
    mockSession.mockResolvedValue({ user: { id: user.id, email: user.email } });

    const result = await requireOrgRun(runId, canApproveGate);
    expect(result.response?.status).toBe(403);
  });

  it("allows a REVIEWER to approve gates but a REVIEWER cannot create/manage runs", async () => {
    const { canApproveGate, canCreateRun, canManageRun } = await import("./authz");
    expect(canApproveGate("REVIEWER")).toBe(true);
    expect(canCreateRun("REVIEWER")).toBe(false);
    expect(canManageRun("REVIEWER")).toBe(false);
  });

  it("getMembership returns null for a user with no membership in that organization", async () => {
    const { getMembership } = await import("./authz");
    const { user: a } = await makeUserWithOrg("OWNER");
    const { org: bOrg } = await makeUserWithOrg("OWNER");
    expect(await getMembership(a.id, bOrg.id)).toBeNull();
  });
});
