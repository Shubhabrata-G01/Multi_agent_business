import { NextResponse } from "next/server";
import { classifyIdea } from "@/lib/classifier";
import { requireUser } from "@/lib/apiAuth";
import { isValidProvider, PROVIDER_DEFAULT_MODEL, PROVIDER_LABELS, resolveApiKey } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rateLimit";
import { requireSameOrigin } from "@/lib/csrf";
import { firstIssueMessage, ideaSchema } from "@/lib/validation";

/**
 * LLM-led intake (Phase 0c): classify a raw idea into a BusinessProfile the
 * founder reviews before starting a run. Body: { idea, provider, model, apiKey }.
 * Uses the same key resolution as a run (supplied -> server env), so a missing
 * key returns 400 with "No API key supplied" for the UI to prompt on.
 */
export async function POST(request: Request) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const authResult = await requireUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const rateLimited = checkRateLimit(authResult.user.id, "classify");
  if (rateLimited) return rateLimited;

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
      { error: `Invalid provider. Must be one of: ${Object.keys(PROVIDER_LABELS).join(", ")}.` },
      { status: 400 },
    );
  }
  const model = String(obj.model ?? "").trim().slice(0, 200) || PROVIDER_DEFAULT_MODEL[provider];
  const rawApiKey = typeof obj.apiKey === "string" ? obj.apiKey.trim() : "";
  if (rawApiKey.length > 512) {
    return NextResponse.json({ error: "API key is too long." }, { status: 400 });
  }
  const apiKey = rawApiKey || undefined;

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
