import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { requireSameOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";
import { getPrimaryOrganizationId } from "@/lib/authz";
import { buildRoadmapForProfile } from "@/lib/roadmap";
import { estimateRun } from "@/lib/costEstimate";
import { isPhaseScope, PHASE_SCOPES } from "@/lib/phaseScopes";
import { isValidProvider, PROVIDER_DEFAULT_MODEL, PROVIDER_LABELS } from "@/lib/providers";

/**
 * Estimated cost/duration BEFORE starting a run (STEP 8 item 3). No provider
 * call is made - this is a static estimate from the roadmap's step/task
 * count and either this organization's own historical averages or a fixed
 * heuristic (see lib/costEstimate.ts). Body: { provider, model, phaseScope?,
 * profile? }.
 */
export async function POST(request: Request) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const authResult = await requireUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const rateLimited = checkRateLimit(authResult.user.id, "run_create");
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const provider = obj.provider ?? "anthropic";
  if (!isValidProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${Object.keys(PROVIDER_LABELS).join(", ")}.` },
      { status: 400 },
    );
  }
  const model = String(obj.model ?? "").trim().slice(0, 200) || PROVIDER_DEFAULT_MODEL[provider];
  const phaseScope = isPhaseScope(obj.phaseScope) ? obj.phaseScope : "full";
  const profile =
    typeof obj.profile === "object" && obj.profile !== null && "idea" in obj.profile
      ? (obj.profile as Parameters<typeof buildRoadmapForProfile>[0])
      : undefined;

  const organizationId = (await getPrimaryOrganizationId(authResult.user.id)) ?? undefined;
  const roadmap = buildRoadmapForProfile(profile);
  const estimate = await estimateRun(roadmap, phaseScope, provider, model, organizationId);

  return NextResponse.json({ estimate, scopes: PHASE_SCOPES });
}
