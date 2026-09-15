import type { LLMProvider } from "../types";
import { callAnthropic } from "./anthropic";
import { callGroq } from "./groq";
import { callOpenRouter } from "./openrouter";
import { callGemini } from "./gemini";
import { ProviderCallError, type ProviderCallParams, type ProviderCallResult } from "./types";

export { ProviderCallError };
export type { ProviderCallParams, ProviderCallResult };

const RUNNERS: Record<
  LLMProvider,
  (params: ProviderCallParams) => Promise<ProviderCallResult>
> = {
  anthropic: callAnthropic,
  groq: callGroq,
  openrouter: callOpenRouter,
  gemini: callGemini,
};

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: "Anthropic",
  groq: "Groq Cloud",
  openrouter: "OpenRouter",
  gemini: "Google Gemini",
};

// Sensible starting points, editable by the user in the UI - model
// availability and naming on these platforms changes often, so these are
// defaults to override, not a guarantee of what's currently live.
export const PROVIDER_DEFAULT_MODEL: Record<LLMProvider, string> = {
  anthropic: "claude-opus-5",
  groq: "llama-3.3-70b-versatile",
  openrouter: "anthropic/claude-sonnet-5",
  gemini: "gemini-2.5-pro",
};

// Server-side fallback env var per provider, used only when the run's
// caller left the API key field blank.
const ENV_KEY_VAR: Record<LLMProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export function isValidProvider(value: unknown): value is LLMProvider {
  return (
    typeof value === "string" &&
    (["anthropic", "groq", "openrouter", "gemini"] as const).includes(
      value as LLMProvider,
    )
  );
}

/**
 * Resolves which API key a run will actually use: the key the caller
 * supplied (user-provided, from the UI), or - only if that's blank - the
 * matching server env var. Returns which source won, so the run record can
 * say so, without ever storing the key itself.
 */
export function resolveApiKey(
  provider: LLMProvider,
  suppliedKey: string | undefined,
): { apiKey: string; source: "user_provided" | "server_env" } {
  const trimmed = suppliedKey?.trim();
  if (trimmed) {
    return { apiKey: trimmed, source: "user_provided" };
  }
  const envVar = ENV_KEY_VAR[provider];
  const envKey = process.env[envVar];
  if (envKey) {
    return { apiKey: envKey, source: "server_env" };
  }
  throw new Error(
    `No API key supplied for ${PROVIDER_LABELS[provider]}, and ${envVar} is not set on the server either.`,
  );
}

const MAX_RETRIES = 3;

export async function runProviderTurn(
  provider: LLMProvider,
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  const runner = RUNNERS[provider];
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await runner(params);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof ProviderCallError && err.retryable;
      if (!retryable || attempt === MAX_RETRIES) {
        throw err;
      }
      const backoffMs = 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("runProviderTurn failed with an unknown error");
}
