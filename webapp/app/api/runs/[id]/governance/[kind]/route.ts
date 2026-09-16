import { NextResponse } from "next/server";
import { getAssumptionRegister, getDecisionLog } from "@/lib/artifactStore";
import { requireOwnedRun } from "@/lib/apiAuth";

// Derived views over the artifact store's claims, shaped to match
// company/governance/assumption-register-template.md and
// decision-log-template.md's field names (see webapp/lib/artifactStore.ts).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const { id, kind } = await params;
  const authResult = await requireOwnedRun(id);
  if (authResult.response) return authResult.response;

  if (kind === "assumptions") {
    return NextResponse.json({ assumptions: await getAssumptionRegister(id) });
  }
  if (kind === "decisions") {
    return NextResponse.json({ decisions: await getDecisionLog(id) });
  }
  return NextResponse.json(
    { error: `Unknown governance view '${kind}'. Use 'assumptions' or 'decisions'.` },
    { status: 404 },
  );
}
