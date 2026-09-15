import { NextResponse } from "next/server";
import { getAssumptionRegister, getDecisionLog } from "@/lib/artifactStore";

// Derived views over the artifact store's claims, shaped to match
// company/governance/assumption-register-template.md and
// decision-log-template.md's field names (see webapp/lib/artifactStore.ts).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const { id, kind } = await params;

  if (kind === "assumptions") {
    return NextResponse.json({ assumptions: getAssumptionRegister(id) });
  }
  if (kind === "decisions") {
    return NextResponse.json({ decisions: getDecisionLog(id) });
  }
  return NextResponse.json(
    { error: `Unknown governance view '${kind}'. Use 'assumptions' or 'decisions'.` },
    { status: 404 },
  );
}
