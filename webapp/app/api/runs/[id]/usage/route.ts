import { NextResponse } from "next/server";
import { requireOrgRun } from "@/lib/apiAuth";
import { getRunUsageSummary } from "@/lib/usage";

/** Live usage/cost so far for a run (STEP 8 item 4) - polled alongside run
 * status while a run is in progress. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authResult = await requireOrgRun(id); // any org member may view
  if (authResult.response) return authResult.response;

  return NextResponse.json(await getRunUsageSummary(id));
}
