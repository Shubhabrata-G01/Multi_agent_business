// Approximate USD cost estimation for budgeting/quota purposes (STEP 4 items
// 6-8) - NOT a billing-grade figure. Rates are approximate published list
// prices as of this file's last update; keep in sync with each provider's
// current pricing page. An unlisted model falls back to a conservative
// (higher-than-typical) default rate so an unrecognized/new model is more
// likely to trip a budget ceiling than silently bill past it unnoticed.
import type { LLMProvider } from "./types";

interface Rate {
  inputPer1M: number;
  outputPer1M: number;
}

const DEFAULT_RATE: Rate = { inputPer1M: 5, outputPer1M: 25 };

const RATES: Partial<Record<LLMProvider, Record<string, Rate>>> = {
  anthropic: {
    "claude-opus-5": { inputPer1M: 15, outputPer1M: 75 },
    "claude-sonnet-5": { inputPer1M: 3, outputPer1M: 15 },
    "claude-haiku-4-5-20251001": { inputPer1M: 1, outputPer1M: 5 },
  },
  groq: {
    "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  },
  openrouter: {
    "anthropic/claude-sonnet-5": { inputPer1M: 3, outputPer1M: 15 },
  },
  gemini: {
    "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  },
};

export function estimateCostUsd(
  provider: LLMProvider,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = RATES[provider]?.[model] ?? DEFAULT_RATE;
  return (inputTokens / 1_000_000) * rate.inputPer1M + (outputTokens / 1_000_000) * rate.outputPer1M;
}
