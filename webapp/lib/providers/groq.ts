import type { ProviderCallParams, ProviderCallResult } from "./types";
import { callOpenAICompatible } from "./openaiCompatible";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export async function callGroq(
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  return callOpenAICompatible(GROQ_BASE_URL, {}, params);
}
