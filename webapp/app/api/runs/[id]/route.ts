import { NextResponse } from "next/server";
import { healIfStale } from "@/lib/orchestrator";
import { requireOrgRun } from "@/lib/apiAuth";
import { canDeleteRun } from "@/lib/authz";
import { deleteRunData } from "@/lib/dataRetention";
import { requireSameOrigin } from "@/lib/csrf";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authResult = await requireOrgRun(id); // any org member may view
  if (authResult.response || !authResult.run) return authResult.response;
  const run = authResult.run;
  // Every poll of a running run is the moment a dead-but-still-"running"
  // run (e.g. its executeRun loop got killed by a server restart) gets
  // caught and flipped to "failed" - see healIfStale's doc comment.
  return NextResponse.json(await healIfStale(run));
}

/**
 * Permanently deletes a run and everything derived from it (STEP 6 item 8) -
 * artifacts, job, usage/provider-error events, comments, reviews.
 * Irreversible; requires OWNER/ADMIN (see lib/authz.ts's canDeleteRun).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const { id } = await params;
  const authResult = await requireOrgRun(id, canDeleteRun);
  if (authResult.response) return authResult.response;

  try {
    await deleteRunData(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ status: "deleted" });
}
