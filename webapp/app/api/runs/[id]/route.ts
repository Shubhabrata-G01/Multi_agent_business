import { NextResponse } from "next/server";
import { loadRun } from "@/lib/runStore";
import { healIfStale } from "@/lib/orchestrator";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  // Every poll of a running run is the moment a dead-but-still-"running"
  // run (e.g. its executeRun loop got killed by a server restart) gets
  // caught and flipped to "failed" - see healIfStale's doc comment.
  return NextResponse.json(healIfStale(run));
}
