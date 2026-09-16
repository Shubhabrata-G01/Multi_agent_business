import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadRun } from "@/lib/runStore";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      user: null,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }
  return { user: session.user, response: null };
}

export async function requireOwnedRun(id: string) {
  const result = await requireUser();
  if (result.response || !result.user) return result;
  const run = await loadRun(id);
  if (!run) {
    return {
      user: null,
      run: null,
      response: NextResponse.json({ error: "Run not found" }, { status: 404 }),
    };
  }
  if (run.owner_id !== result.user.id) {
    return {
      user: null,
      run: null,
      response: NextResponse.json({ error: "Run not found" }, { status: 404 }),
    };
  }
  return { user: result.user, run, response: null };
}
