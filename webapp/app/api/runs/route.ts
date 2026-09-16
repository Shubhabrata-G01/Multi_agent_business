import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { healIfStale, startRun } from "@/lib/orchestrator";
import { listRunsByOrganization } from "@/lib/runStore";
import { canCreateRun, getMembership, getPrimaryOrganizationId } from "@/lib/authz";
import { assertCanStartRun, QuotaExceededError } from "@/lib/quotas";
import { checkRateLimit } from "@/lib/rateLimit";
import { requireSameOrigin } from "@/lib/csrf";
import { firstIssueMessage, ideaSchema } from "@/lib/validation";
import {
  isValidProvider,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_LABELS,
} from "@/lib/providers";

export async function GET() {
  const authResult = await requireUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const organizationId = await getPrimaryOrganizationId(authResult.user.id);
  if (!organizationId) {
    return NextResponse.json({ runs: [] });
  }

  const orgRuns = await listRunsByOrganization(organizationId);
  const healed = await Promise.all(orgRuns.map((r) => healIfStale(r)));
  const runs = healed.map((r) => ({
    id: r.id,
    idea: r.idea,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    current_step_index: r.current_step_index,
    total_steps: r.total_steps,
    provider: r.provider,
    model: r.model,
    mode: r.mode ?? "simulation",
    owner_id: r.owner_id,
  }));
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const authResult = await requireUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const rateLimited = checkRateLimit(authResult.user.id, "run_create");
  if (rateLimited) return rateLimited;

  const organizationId = await getPrimaryOrganizationId(authResult.user.id);
  if (!organizationId) {
    return NextResponse.json(
      { error: "No organization found for this account." },
      { status: 403 },
    );
  }

  const membership = await getMembership(authResult.user.id, organizationId);
  if (!membership || !canCreateRun(membership.role)) {
    return NextResponse.json(
      { error: "Your role does not permit creating runs." },
      { status: 403 },
    );
  }

  try {
    await assertCanStartRun(authResult.user.id, organizationId);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const ideaResult = ideaSchema.safeParse(obj.idea);
  if (!ideaResult.success) {
    return NextResponse.json({ error: firstIssueMessage(ideaResult.error) }, { status: 400 });
  }
  const idea = ideaResult.data;

  const provider = obj.provider ?? "anthropic";
  if (!isValidProvider(provider)) {
    return NextResponse.json(
      {
        error: `Invalid provider '${String(provider)}'. Must be one of: ${Object.keys(PROVIDER_LABELS).join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const model = String(obj.model ?? "").trim().slice(0, 200) || PROVIDER_DEFAULT_MODEL[provider];

  const rawApiKey = typeof obj.apiKey === "string" ? obj.apiKey.trim() : "";
  if (rawApiKey.length > 512) {
    return NextResponse.json({ error: "API key is too long." }, { status: 400 });
  }
  const apiKey = rawApiKey || undefined;

  // Execution mode: how the run treats human-approval gates. Defaults to the
  // safer "assisted" (approval-gated) when omitted; "simulation" reproduces the
  // legacy fully-autonomous behavior. See lib/types.ts ExecutionMode.
  const rawMode = obj.mode === "simulation" ? "simulation" : "assisted";

  // Optional BusinessProfile from the intake step (Phase 0c). It originates from
  // this app's own /api/classify, so it's accepted as-is when present; the run
  // stores it as informational context. Absent for the direct "just run it" path.
  const profile =
    typeof obj.profile === "object" && obj.profile !== null && "idea" in obj.profile
      ? (obj.profile as Parameters<typeof startRun>[5])
      : undefined;

  let id: string;
  try {
    id = await startRun(idea, provider, model, apiKey, rawMode, profile, authResult.user.id, organizationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A missing key on both the request and the server env is the caller's
    // problem to fix (400), not a server fault (500).
    const status = message.includes("No API key supplied") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ id }, { status: 201 });
}
