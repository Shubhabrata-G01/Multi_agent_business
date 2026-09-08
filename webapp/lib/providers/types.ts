// Bounds a single call attempt (not the whole retry sequence) - a call that
// exceeds this is aborted and treated as a retryable failure by index.ts's
// retry loop, rather than hanging indefinitely. This app previously had a
// call hang for 20+ minutes with no error surfaced at all: the Anthropic
// SDK's own default 10-minute timeout plus its own default 2 internal
// retries compounded with index.ts's retry loop. Every provider aborts at
// this bound, and index.ts's loop is the only layer that retries.
export const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 180_000);

export interface ProviderCallParams {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
  // Anthropic-only: turns on the provider's server-side web_search tool for
  // this call (see anthropic.ts). Ignored by every other provider's runner -
  // they don't read this field, so passing it is a harmless no-op there.
  enableWebSearch?: boolean;
  maxWebSearches?: number;
}

export interface ProviderCallResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type ProviderRunner = (
  params: ProviderCallParams,
) => Promise<ProviderCallResult>;

export class ProviderCallError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}
