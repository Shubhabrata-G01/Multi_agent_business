import { z } from "zod";
import { runProviderTurn } from "./providers";
import type { BusinessProfile, LLMProvider } from "./types";

// LLM-led structured intake (Phase 0c, §3.3): turn a raw idea into a typed
// BusinessProfile the founder reviews before any expensive execution. The parse
// is deterministic and never throws - a malformed model response yields a
// low-confidence default with a validation note, mirroring parseArtifactMeta.

const RiskFlagSchema = z.object({
  kind: z
    .enum([
      "regulatory",
      "payments",
      "health-data",
      "physical-safety",
      "financial-custody",
      "employment",
      "ip",
      "other",
    ])
    .catch("other"),
  detail: z.string().default(""),
  suggested_pack: z.string().default(""),
});

const BusinessProfileSchema = z.object({
  idea: z.string().default(""),
  industry: z.string().default("unknown"),
  business_model: z.string().default("unknown"),
  geography: z.array(z.string()).default([]),
  customer: z.string().default("unknown"),
  maturity: z.enum(["idea", "prototype", "launched", "scaling"]).catch("idea"),
  capital_intensity: z.enum(["low", "medium", "high"]).catch("medium"),
  risk_flags: z.array(RiskFlagSchema).default([]),
  constraints: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]).catch("low"),
  open_questions: z.array(z.string()).default([]),
});

export function defaultBusinessProfile(idea: string, note: string): BusinessProfile {
  return {
    idea,
    industry: "unknown",
    business_model: "unknown",
    geography: [],
    customer: "unknown",
    maturity: "idea",
    capital_intensity: "medium",
    risk_flags: [],
    constraints: [],
    confidence: "low",
    open_questions: [],
    validation_notes: [note],
  };
}

// Pull a JSON object out of a model response: a ```json / ```business-profile
// fence first, then a bare balanced {...}, then the whole trimmed string.
function extractJson(raw: string): string | null {
  const fence = raw.match(/```(?:json|business-profile)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].trim().startsWith("{")) return fence[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) return raw.slice(first, last + 1);
  return null;
}

/**
 * Deterministic normalization after parsing. The idea is always forced to the
 * real submitted idea (never the model's paraphrase). Low-confidence profiles
 * with no open questions get a generic one so the founder is prompted to fill the
 * gap. Every change is recorded in validation_notes.
 */
export function validateBusinessProfile(profile: BusinessProfile, idea: string): BusinessProfile {
  const notes = [...profile.validation_notes];
  let { open_questions } = profile;

  if (profile.idea !== idea) {
    notes.push("Reset 'idea' to the exact submitted text (the model had paraphrased it).");
  }
  if (profile.confidence === "low" && open_questions.length === 0) {
    open_questions = [
      "The classification is low-confidence and raised no specific questions - confirm industry, business model, and target customer before planning.",
    ];
    notes.push("Added a generic open question because confidence was low with none stated.");
  }
  return { ...profile, idea, open_questions, validation_notes: notes };
}

export function parseBusinessProfile(idea: string, rawText: string): BusinessProfile {
  const json = extractJson(rawText);
  if (json) {
    try {
      const parsed = BusinessProfileSchema.safeParse(JSON.parse(json));
      if (parsed.success) {
        return validateBusinessProfile(
          { ...(parsed.data as Omit<BusinessProfile, "validation_notes">), validation_notes: [] },
          idea,
        );
      }
    } catch {
      // fall through to default
    }
  }
  return validateBusinessProfile(
    defaultBusinessProfile(
      idea,
      json
        ? "The classifier response contained JSON that did not match the profile schema; using a low-confidence default."
        : "No JSON profile was found in the classifier response; using a low-confidence default.",
    ),
    idea,
  );
}

export const CLASSIFIER_SYSTEM = `You are a business analyst classifying a raw
business idea before any planning begins. Respond with ONLY a single JSON object
(no prose, no markdown fence) with exactly these fields:

{
  "idea": "<echo the idea>",
  "industry": "<short slug, e.g. b2b-saas, marketplace, fintech-lending, health-tech>",
  "business_model": "<subscription | transactional | marketplace | services | ...>",
  "geography": ["<markets in scope>"],
  "customer": "<who pays, one line>",
  "maturity": "idea" | "prototype" | "launched" | "scaling",
  "capital_intensity": "low" | "medium" | "high",
  "risk_flags": [
    { "kind": "regulatory" | "payments" | "health-data" | "physical-safety" | "financial-custody" | "employment" | "ip" | "other",
      "detail": "<what makes this NOT plain SaaS>",
      "suggested_pack": "<capability pack id, e.g. fintech, regulated-health, marketplace>" }
  ],
  "constraints": ["<founder-stated limits: budget, timeline, no-fundraise, ...>"],
  "confidence": "high" | "medium" | "low",
  "open_questions": ["<what intake still needs from the founder>"]
}

Only add a risk_flag when the idea actually implies it - a plain SaaS idea has an
empty risk_flags array. Be honest about confidence: if the idea is vague, say low
and list the open questions that would resolve it. Do not invent specifics the
idea does not contain.`;

export function buildClassifierUser(idea: string): string {
  return `Classify this business idea:\n\n${idea}`;
}

/** Runs one provider turn to classify an idea. Thin wrapper - the parsing/
 * validation it delegates to is the deterministic, tested part. */
export async function classifyIdea(
  idea: string,
  provider: LLMProvider,
  model: string,
  apiKey: string,
): Promise<BusinessProfile> {
  const result = await runProviderTurn(provider, {
    apiKey,
    model,
    systemPrompt: CLASSIFIER_SYSTEM,
    userMessage: buildClassifierUser(idea),
    maxTokens: 1500,
  });
  return parseBusinessProfile(idea, result.text);
}
