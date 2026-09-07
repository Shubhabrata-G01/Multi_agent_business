import Anthropic from "@anthropic-ai/sdk";
import type { ProviderCallParams, ProviderCallResult } from "./types";
import { ProviderCallError } from "./types";

const EFFORT = (process.env.ANTHROPIC_EFFORT || "high") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export async function callAnthropic(
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  const client = new Anthropic({ apiKey: params.apiKey });

  let response;
  try {
    const stream = client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      system: params.systemPrompt,
      messages: [{ role: "user", content: params.userMessage }],
    });
    response = await stream.finalMessage();
  } catch (err) {
    if (
      err instanceof Anthropic.RateLimitError ||
      err instanceof Anthropic.APIConnectionError ||
      (err instanceof Anthropic.APIError &&
        err.status !== undefined &&
        err.status >= 500)
    ) {
      throw new ProviderCallError(
        err instanceof Error ? err.message : String(err),
        true,
      );
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ProviderCallError(
        "Anthropic authentication failed - check the API key.",
        false,
      );
    }
    throw new ProviderCallError(
      err instanceof Error ? err.message : String(err),
      false,
    );
  }

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unknown";
    throw new ProviderCallError(`Model refused (category: ${category})`, false);
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
