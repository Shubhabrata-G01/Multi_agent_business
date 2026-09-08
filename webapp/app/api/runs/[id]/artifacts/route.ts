import { NextResponse } from "next/server";
import { listArtifactVersions, queryArtifacts } from "@/lib/artifactStore";
import type { ClaimType } from "@/lib/types";

const VALID_CLAIM_TYPES: ClaimType[] = [
  "fact",
  "assumption",
  "estimate",
  "inference",
  "recommendation",
  "decision",
];

/**
 * With ?flow_step= set, returns the full immutable version history for that
 * step (content + evidence meta included) - what the UI's "prior versions"
 * expander fetches. Without it, returns the lightweight index filtered by
 * ?agent_id=/?claim_type=, for a run-wide evidence overview.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const flowStep = searchParams.get("flow_step") ?? undefined;
  const agentId = searchParams.get("agent_id") ?? undefined;
  const claimTypeParam = searchParams.get("claim_type") ?? undefined;
  const claimType =
    claimTypeParam && VALID_CLAIM_TYPES.includes(claimTypeParam as ClaimType)
      ? (claimTypeParam as ClaimType)
      : undefined;

  if (flowStep) {
    return NextResponse.json({ versions: listArtifactVersions(id, flowStep) });
  }

  return NextResponse.json({
    artifacts: queryArtifacts(id, { agent_id: agentId, claim_type: claimType }),
  });
}
