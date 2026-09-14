import { composeRoadmap } from "./packs";
import { buildServicesV1Roadmap } from "./templates/servicesV1";
import { buildSoftwareSaasV1Roadmap } from "./templates/softwareSaasV1";
import type { BusinessProfile, Roadmap } from "./types";

// Roadmap composition entry point (§3.4/§5). Selects the base lifecycle template
// from the classified profile, then merges in any capability packs the profile's
// risk flags activate. With no profile this is exactly software-saas-v1.

const SERVICES_RE =
  /\bservic|agenc|consult|\bstudio\b|freelanc|done-for-you|productized service|professional services/i;

/** Choose the base lifecycle template for a profile. Defaults to software-saas-v1;
 * a services/agency/consulting business model or industry selects services-v1. */
export function selectBaseTemplate(profile: BusinessProfile | undefined): Roadmap {
  if (profile) {
    const hay = `${profile.business_model} ${profile.industry}`;
    if (SERVICES_RE.test(hay)) return buildServicesV1Roadmap();
  }
  return buildSoftwareSaasV1Roadmap();
}

/** Full per-run roadmap: selected base template + activated capability packs. */
export function buildRoadmapForProfile(profile: BusinessProfile | undefined): Roadmap {
  return composeRoadmap(selectBaseTemplate(profile), profile);
}
