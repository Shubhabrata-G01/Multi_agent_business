import Anthropic from "@anthropic-ai/sdk";
import type { ProviderCallParams, ProviderCallResult } from "./types";
import { PROVIDER_TIMEOUT_MS, ProviderCallError } from "./types";

const EFFORT = (process.env.ANTHROPIC_EFFORT || "high") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

const DEFAULT_WEB_SEARCH_MAX_USES = 5;

interface WebSource {
  url: string;
  title: string | null;
}

/**
 * Anthropic's web_search tool attaches citations to individual TextBlocks
 * (each with the URL/title it drew from), not as a separate "here's what I
 * found" block a caller can just read off. Collecting and re-rendering them
 * as a visible Markdown list is what turns "the model says it found sources"
 * into something a Critic (or a human) can actually check - see
 * company/architecture/08-four-eyes-and-critic-mode.md's point that evidence
 * must be verifiable, not merely self-described.
 */
function collectWebSources(blocks: Anthropic.TextBlock[]): WebSource[] {
  const byUrl = new Map<string, WebSource>();
  for (const block of blocks) {
    for (const citation of block.citations ?? []) {
      if (citation.type === "web_search_result_location" && !byUrl.has(citation.url)) {
        byUrl.set(citation.url, { url: citation.url, title: citation.title });
      }
    }
  }
  return [...byUrl.values()];
}

/**
 * Splices a "Sources" list in just before the trailing ```artifact-meta
 * fence (or at the very end, if there isn't one) so it survives
 * artifactMeta.ts's content/meta split and shows up as part of the saved
 * artifact rather than getting silently dropped.
 */
function insertSourcesBlock(text: string, sources: WebSource[]): string {
  if (sources.length === 0) return text;
  const block = `\n\n## Sources (live web search, this run)\n${sources
    .map((s, i) => `${i + 1}. [${s.title ?? s.url}](${s.url})`)
    .join("\n")}\n`;
  const fenceMatch = text.match(/```artifact-meta[\s\S]*?```\s*$/i);
  if (fenceMatch?.index !== undefined) {
    return text.slice(0, fenceMatch.index) + block + "\n" + text.slice(fenceMatch.index);
  }
  return text + block;
}

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
      ...(params.enableWebSearch
        ? {
            tools: [
              {
                type: "web_search_20250305" as const,
                name: "web_search" as const,
                max_uses: params.maxWebSearches ?? DEFAULT_WEB_SEARCH_MAX_USES,
              },
            ],
          }
        : {}),
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
            // Not retryable: this already burned the full timeout budget once.
            // Retrying would just hang for up to PROVIDER_TIMEOUT_MS again per
            // attempt (index.ts's MAX_RETRIES=3 loop previously turned one
            // 3-minute timeout into up to ~12 minutes before the run actually
            // failed) - a hang that already used its whole budget isn't the
            // same kind of "try again, it might just be a blip" condition as
            // a rate limit or a 5xx.
            false,
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

  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const rawText = textBlocks.map((b) => b.text).join("\n");
  const text = params.enableWebSearch
    ? insertSourcesBlock(rawText, collectWebSources(textBlocks))
    : rawText;

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
