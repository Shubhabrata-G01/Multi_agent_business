import type { ProviderCallParams, ProviderCallResult } from "./types";
import { ProviderCallError } from "./types";

/**
 * Shared implementation for chat-completions APIs that speak the OpenAI
 * request/response shape (Groq and OpenRouter both do). Uses plain fetch,
 * not an SDK - both are simple REST contracts and this avoids depending on
 * a third-party SDK's exact class/method names, which this project has no
 * verified reference for (unlike the Anthropic SDK, covered by the
 * claude-api skill).
 */
export async function callOpenAICompatible(
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
    throw new ProviderCallError(
      `HTTP ${res.status} from ${baseUrl}: ${bodyText.slice(0, 500)}`,
      retryable,
    );
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
