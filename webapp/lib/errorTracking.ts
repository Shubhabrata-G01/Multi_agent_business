// Error tracking hook (STEP 6 item 5). Always logs structurally (STEP 6
// item 1); additionally POSTs to ERROR_WEBHOOK_URL when configured, so this
// wires into whatever the operator already uses - Sentry's inbound webhook
// integration, a Slack/Discord webhook, PagerDuty's Events API, or a custom
// receiver - without this app depending on any specific vendor SDK. Never
// throws: a broken webhook must not take down whatever was already failing.
import { logger, type LogContext } from "./logger";

const WEBHOOK_TIMEOUT_MS = 5000;

export async function captureException(
  message: string,
  err: unknown,
  context?: LogContext,
): Promise<void> {
  logger.error(message, context, err);

  // Read fresh on every call (not cached at module load) so tests can
  // toggle it via vi.stubEnv and a real deployment can change it without a
  // restart-order dependency.
  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
        context,
        timestamp: new Date().toISOString(),
        app: "ai-company-builder",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (webhookErr) {
    logger.warn("error-tracking webhook delivery failed", context, webhookErr);
  }
}
