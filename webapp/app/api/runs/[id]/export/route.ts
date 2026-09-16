import { NextResponse } from "next/server";
import { requireOrgRun } from "@/lib/apiAuth";
import { buildArtifactIndexCsv, buildJsonAuditBundle, buildMarkdownExport } from "@/lib/exportBundle";

const FORMATS = ["json", "markdown", "csv"] as const;

/**
 * Complete export (STEP 5 item 9): ?format=json for the full audit bundle
 * (run + artifacts + assumption register + decision log + evidence ledger +
 * approval history + comments + reviews), ?format=markdown for a
 * human-readable summary, ?format=csv for the artifact index.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authResult = await requireOrgRun(id); // any org member may export
  if (authResult.response || !authResult.run) return authResult.response;
  const run = authResult.run;

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";
  if (!(FORMATS as readonly string[]).includes(format)) {
    return NextResponse.json(
      { error: `Invalid format '${format}'. Use one of: ${FORMATS.join(", ")}.` },
      { status: 400 },
    );
  }

  if (format === "markdown") {
    const markdown = await buildMarkdownExport(run);
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="run-${id}.md"`,
      },
    });
  }

  if (format === "csv") {
    const csv = await buildArtifactIndexCsv(run);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="run-${id}-artifacts.csv"`,
      },
    });
  }

  const bundle = await buildJsonAuditBundle(run);
  return NextResponse.json(bundle);
}
