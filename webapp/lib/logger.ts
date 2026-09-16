// Structured JSON logging (STEP 6 item 1). One JSON object per line to
// stdout/stderr - the standard shape for a container platform's log
// aggregator to parse without a custom parser. Every call site can attach a
// requestId (lib/requestId.ts) and/or runId (STEP 6 item 2's correlation
// ids) via the `context` object.
type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  runId?: string;
  jobId?: string;
  workerId?: string;
  userId?: string;
  organizationId?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, context?: LogContext, err?: unknown): void {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  if (err !== undefined) {
    entry.error = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
  }
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext, err?: unknown) => write("warn", message, context, err),
  error: (message: string, context?: LogContext, err?: unknown) => write("error", message, context, err),
};
