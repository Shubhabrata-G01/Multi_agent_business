import { NextResponse } from "next/server";
import { requireOrgRun } from "@/lib/apiAuth";
import { listArtifactVersions } from "@/lib/artifactStore";
import { diffLines, summarizeDiff } from "@/lib/diff";

/**
 * Revision diff between two attempts of the same step's artifact (STEP 5
 * item 4). ?flow_step=05&from=1&to=2 - defaults `from` to `to - 1` (the
 * immediately preceding attempt) when omitted.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authResult = await requireOrgRun(id);
  if (authResult.response) return authResult.response;

  const { searchParams } = new URL(request.url);
  const flowStep = searchParams.get("flow_step");
  if (!flowStep) {
    return NextResponse.json({ error: "Query param 'flow_step' is required." }, { status: 400 });
  }
  const to = Number(searchParams.get("to"));
  if (!Number.isInteger(to) || to < 1) {
    return NextResponse.json({ error: "Query param 'to' must be a positive integer attempt number." }, { status: 400 });
  }
  const from = searchParams.get("from") ? Number(searchParams.get("from")) : to - 1;
  if (!Number.isInteger(from) || from < 1) {
    return NextResponse.json({ error: "Query param 'from' must be a positive integer attempt number." }, { status: 400 });
  }

  const versions = await listArtifactVersions(id, flowStep);
  const fromVersion = versions.find((v) => v.attempt === from);
  const toVersion = versions.find((v) => v.attempt === to);
  if (!fromVersion || !toVersion) {
    return NextResponse.json(
      { error: `Attempt ${!fromVersion ? from : to} not found for step ${flowStep}.` },
      { status: 404 },
    );
  }

  const lines = diffLines(fromVersion.content, toVersion.content);
  return NextResponse.json({
    flow_step: flowStep,
    from,
    to,
    summary: summarizeDiff(lines),
    lines,
  });
}
