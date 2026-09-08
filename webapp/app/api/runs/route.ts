import { NextResponse } from "next/server";
import { healIfStale, startRun } from "@/lib/orchestrator";
import { listRuns } from "@/lib/runStore";
import {
  isValidProvider,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_LABELS,
} from "@/lib/providers";

export async function GET() {
  const runs = listRuns()
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
    }));
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
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

  let id: string;
  try {
    id = startRun(idea, provider, model, apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A missing key on both the request and the server env is the caller's
    // problem to fix (400), not a server fault (500).
    const status = message.includes("No API key supplied") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ id }, { status: 201 });
}
