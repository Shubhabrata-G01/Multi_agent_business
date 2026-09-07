import type { ProviderCallParams, ProviderCallResult } from "./types";
import { ProviderCallError } from "./types";

// Matches Groq/OpenAI-compatible error text like:
// "`max_tokens` must be less than or equal to `512`, the maximum value for
// `max_tokens` is less than the `context_window` for this model"
const MAX_TOKENS_LIMIT_RE = /max_tokens.{0,40}less than or equal to `?(\d+)`?/i;

async function attemptOnce(
  baseUrl: string,
  extraHeaders: Record<string, string>,
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userMessage },
        ],
      }),
    });
  } catch (err) {
    throw new ProviderCallError(
      `Network error calling ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    const err = new ProviderCallError(
      `HTTP ${res.status} from ${baseUrl}: ${bodyText.slice(0, 500)}`,
      retryable,
    );
    // Attach the raw body so the caller can detect a too-large-max_tokens
    // response and retry with a corrected value without re-parsing status.
    (err as ProviderCallError & { bodyText?: string }).bodyText = bodyText;
    throw err;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new ProviderCallError(
      `Empty response from ${baseUrl} (unexpected response shape: ${JSON.stringify(data).slice(0, 300)})`,
      false,
    );
  }

  return {
    text,
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}

/**
 * Shared implementation for chat-completions APIs that speak the OpenAI
 * request/response shape (Groq and OpenRouter both do). Uses plain fetch,
 * not an SDK - both are simple REST contracts and this avoids depending on
 * a third-party SDK's exact class/method names, which this project has no
 * verified reference for (unlike the Anthropic SDK, covered by the
 * claude-api skill).
 *
 * Different models on these platforms enforce wildly different max_tokens
 * ceilings (a small/preview model may cap at a few hundred where another
 * on the same platform allows tens of thousands), and that ceiling isn't
 * knowable in advance from this app's side. When the API rejects the
 * request specifically for exceeding it and states the actual limit, this
 * retries once at that limit instead of failing the whole business-flow
 * step over a fixable parameter.
 */
export async function callOpenAICompatible(
  baseUrl: string,
  extraHeaders: Record<string, string>,
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  try {
    return await attemptOnce(baseUrl, extraHeaders, params);
  } catch (err) {
    const bodyText = (err as { bodyText?: string })?.bodyText;
    const match = bodyText?.match(MAX_TOKENS_LIMIT_RE);
    const limit = match ? Number(match[1]) : null;

    if (limit && limit > 0 && limit < params.maxTokens) {
      return attemptOnce(baseUrl, extraHeaders, { ...params, maxTokens: limit });
    }
    throw err;
  }
}
