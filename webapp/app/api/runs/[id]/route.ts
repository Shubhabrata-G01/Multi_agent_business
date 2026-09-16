import { NextResponse } from "next/server";
import { healIfStale } from "@/lib/orchestrator";
import { requireOrgRun } from "@/lib/apiAuth";

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
