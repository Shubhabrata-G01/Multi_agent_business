import Anthropic from "@anthropic-ai/sdk";
import type { ProviderCallParams, ProviderCallResult } from "./types";
import { PROVIDER_TIMEOUT_MS, ProviderCallError } from "./types";

const EFFORT = (process.env.ANTHROPIC_EFFORT || "high") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export async function callAnthropic(
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  // maxRetries: 0 - this app's own retry loop (providers/index.ts) is the
  // single source of retry truth. Left at the SDK default, a timeout gets
  // retried *inside* the SDK too, compounding with the outer loop and
  // producing multi-times-longer hangs than PROVIDER_TIMEOUT_MS implies.
  const client = new Anthropic({
    apiKey: params.apiKey,
    timeout: PROVIDER_TIMEOUT_MS,
    maxRetries: 0,
  });

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

    // Defense-in-depth on top of the client's own `timeout`: a streamed
    // response's idle-time semantics aren't guaranteed to match a plain
    // request's, so this races an explicit timer that aborts the stream
    // directly rather than trusting the SDK alone to enforce the bound.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        stream.abort();
        reject(
          new ProviderCallError(
            `Anthropic call exceeded ${PROVIDER_TIMEOUT_MS}ms and was aborted`,
            true,
          ),
        );
      }, PROVIDER_TIMEOUT_MS);
    });
    try {
      response = await Promise.race([stream.finalMessage(), timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof ProviderCallError) {
      throw err;
    }
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
