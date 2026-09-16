import { NextResponse } from "next/server";
import { requireOrgRun } from "@/lib/apiAuth";
import { addComment, listComments } from "@/lib/reviews";
import { requireSameOrigin } from "@/lib/csrf";
import { z } from "zod";

const createCommentSchema = z.object({
  flowStep: z.string().trim().min(1).max(20),
  attempt: z.number().int().min(1).max(1000),
  taskId: z.string().trim().max(100).optional().nullable(),
  body: z.string().trim().min(1).max(10_000),
});

/** Any org member may view or leave a comment on any step's artifact (STEP 5
 * item 7) - independent of the formal gate-approval flow. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authResult = await requireOrgRun(id);
  if (authResult.response) return authResult.response;

  const { searchParams } = new URL(request.url);
  const flowStep = searchParams.get("flow_step") ?? undefined;
  return NextResponse.json({ comments: await listComments(id, flowStep) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const { id } = await params;
  const authResult = await requireOrgRun(id);
  if (authResult.response || !authResult.user) return authResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const comment = await addComment({
    runId: id,
    flowStep: parsed.data.flowStep,
    attempt: parsed.data.attempt,
    taskId: parsed.data.taskId,
    author: { id: authResult.user.id, email: authResult.user.email ?? authResult.user.id },
    body: parsed.data.body,
  });

  return NextResponse.json({ comment }, { status: 201 });
}
