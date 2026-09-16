import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { healIfStale, startRun } from "@/lib/orchestrator";
import { listRuns } from "@/lib/runStore";
import {
  isValidProvider,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_LABELS,
} from "@/lib/providers";

export async function GET() {
  const authResult = await requireUser();
  if (authResult.response) return authResult.response;
  const runs = listRuns()
    .filter((r) => r.owner_id === authResult.user?.id)
    .map((r) => healIfStale(r))
    .map((r) => ({
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
    }));
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if (authResult.response || !authResult.user) return authResult.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const idea = String(obj.idea ?? "").trim();
  if (!idea) {
    return NextResponse.json(
      { error: "Field 'idea' is required and must be non-empty." },
      { status: 400 },
    );
  }
  if (idea.length > 4000) {
    return NextResponse.json(
      { error: "Idea is too long (max 4000 characters)." },
      { status: 400 },
    );
  }

  const provider = obj.provider ?? "anthropic";
  if (!isValidProvider(provider)) {
    return NextResponse.json(
      {
        error: `Invalid provider '${String(provider)}'. Must be one of: ${Object.keys(PROVIDER_LABELS).join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const model = String(obj.model ?? "").trim() || PROVIDER_DEFAULT_MODEL[provider];

  const apiKey =
    typeof obj.apiKey === "string" && obj.apiKey.trim() ? obj.apiKey.trim() : undefined;

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
    id = startRun(idea, provider, model, apiKey, rawMode, profile, authResult.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A missing key on both the request and the server env is the caller's
    // problem to fix (400), not a server fault (500).
    const status = message.includes("No API key supplied") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ id }, { status: 201 });
}
