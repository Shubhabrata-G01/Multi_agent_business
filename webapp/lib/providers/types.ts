export interface ProviderCallParams {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
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
