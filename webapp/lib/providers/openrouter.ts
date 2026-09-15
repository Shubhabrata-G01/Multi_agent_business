import type { ProviderCallParams, ProviderCallResult } from "./types";
import { callOpenAICompatible } from "./openaiCompatible";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export async function callOpenRouter(
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  return callOpenAICompatible(
    OPENROUTER_BASE_URL,
    {
      // Optional per OpenRouter's docs, but recommended so requests are
      // attributable if you ever check usage on their dashboard.
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "AI Company Builder",
    },
    params,
  );
}
