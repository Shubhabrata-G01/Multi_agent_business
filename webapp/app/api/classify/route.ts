import { NextResponse } from "next/server";
import { classifyIdea } from "@/lib/classifier";
import { requireUser } from "@/lib/apiAuth";
import { isValidProvider, PROVIDER_DEFAULT_MODEL, PROVIDER_LABELS, resolveApiKey } from "@/lib/providers";

/**
 * LLM-led intake (Phase 0c): classify a raw idea into a BusinessProfile the
 * founder reviews before starting a run. Body: { idea, provider, model, apiKey }.
 * Uses the same key resolution as a run (supplied -> server env), so a missing
 * key returns 400 with "No API key supplied" for the UI to prompt on.
 */
export async function POST(request: Request) {
  const authResult = await requireUser();
  if (authResult.response) return authResult.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const idea = String(obj.idea ?? "").trim();
  if (!idea) {
    return NextResponse.json({ error: "Field 'idea' is required." }, { status: 400 });
  }
  if (idea.length > 4000) {
    return NextResponse.json({ error: "Idea is too long (max 4000 characters)." }, { status: 400 });
  }

  const provider = obj.provider ?? "anthropic";
  if (!isValidProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${Object.keys(PROVIDER_LABELS).join(", ")}.` },
      { status: 400 },
    );
  }
  const model = String(obj.model ?? "").trim() || PROVIDER_DEFAULT_MODEL[provider];
  const apiKey =
    typeof obj.apiKey === "string" && obj.apiKey.trim() ? obj.apiKey.trim() : undefined;

  try {
    const { apiKey: key } = resolveApiKey(provider, apiKey);
    const profile = await classifyIdea(idea, provider, model, key);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("No API key supplied") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
