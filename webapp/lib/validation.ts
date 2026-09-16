// Centralized request-body schemas (STEP 4 item 11) for the most sensitive
// inputs - auth and run creation. Strict types + explicit max lengths guard
// against both malformed input and abuse (e.g. a multi-megabyte "name"
// field bloating a row/response indefinitely).
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(12).max(256),
  name: z.string().trim().max(200).optional().nullable(),
});

export const ideaSchema = z.string().trim().min(1).max(4000);

/** Formats a ZodError into a single user-facing message (first issue only -
 * enough to fix and resubmit without dumping the whole schema at them). */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
