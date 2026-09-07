import type { ProviderCallParams, ProviderCallResult } from "./types";
import { ProviderCallError } from "./types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Uses the Gemini REST `generateContent` endpoint directly rather than a
 * Google SDK - Google has shipped several successive Node SDK packages for
 * Gemini and this project has no verified, current reference for whichever
 * one is current, while the REST contract is stable and well documented.
 */
export async function callGemini(
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(params.model)}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: params.userMessage }] }],
        generationConfig: { maxOutputTokens: params.maxTokens },
      }),
    });
  } catch (err) {
    throw new ProviderCallError(
      `Network error calling Gemini: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderCallError(
      `HTTP ${res.status} from Gemini: ${bodyText.slice(0, 500)}`,
      retryable,
    );
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new ProviderCallError(
      `Gemini blocked the prompt (reason: ${data.promptFeedback.blockReason})`,
      false,
    );
  }

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";

  if (!text) {
    throw new ProviderCallError(
      `Empty response from Gemini (finishReason: ${data.candidates?.[0]?.finishReason ?? "unknown"})`,
      false,
    );
  }

  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? null,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
  };
}
