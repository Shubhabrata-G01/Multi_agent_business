import type { ProviderCallParams, ProviderCallResult } from "./types";
import { PROVIDER_TIMEOUT_MS, ProviderCallError } from "./types";

// Matches Groq/OpenAI-compatible error text like:
// "`max_tokens` must be less than or equal to `512`, the maximum value for
// `max_tokens` is less than the `context_window` for this model"
const MAX_TOKENS_LIMIT_RE = /max_tokens.{0,40}less than or equal to `?(\d+)`?/i;

// The "reduce the length" form (unlike the max_tokens form above) doesn't
// state a number - it means the request as a whole (system + user message)
// already exceeds the model's total context window before generation even
// starts. There's nothing to auto-retry with here (this app can't safely
// shrink an agent's system prompt), so this just makes the resulting error
// diagnosable instead of a bare passthrough.
const CONTEXT_TOO_LONG_RE = /reduce the length of the (messages|completion)/i;

// Rough token estimate (~4 chars/token for English) - good enough to tell
// someone "this is why it doesn't fit," not a precise count.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

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
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (err) {
    // AbortSignal.timeout() rejects with a DOMException named "TimeoutError" -
    // that's our own PROVIDER_TIMEOUT_MS budget already spent, not a blip, so
    // it isn't retryable (retrying would just hang for another full
    // PROVIDER_TIMEOUT_MS per attempt instead of failing promptly). Any other
    // network error (DNS, connection reset, etc.) is still worth retrying.
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new ProviderCallError(
      `${isTimeout ? "Timed out" : "Network error"} calling ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      !isTimeout,
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

    const maxTokensMatch = bodyText?.match(MAX_TOKENS_LIMIT_RE);
    const limit = maxTokensMatch ? Number(maxTokensMatch[1]) : null;
    if (limit && limit > 0 && limit < params.maxTokens) {
      return attemptOnce(baseUrl, extraHeaders, { ...params, maxTokens: limit });
    }

    if (bodyText && CONTEXT_TOO_LONG_RE.test(bodyText)) {
      const promptTokens = estimateTokens(params.systemPrompt + params.userMessage);
      throw new ProviderCallError(
        `${params.model} rejected this request as too long for its context window ` +
          `(estimated ~${promptTokens} prompt tokens + up to ${params.maxTokens} requested output tokens). ` +
          `This model's total context window is too small for this agent's system prompt - ` +
          `pick a model with a larger context window (e.g. llama-3.3-70b-versatile on Groq has 128K) ` +
          `rather than retrying, since this app can't safely shorten an agent's spec. Raw error: ${bodyText.slice(0, 300)}`,
        false,
      );
    }

    throw err;
  }
}
