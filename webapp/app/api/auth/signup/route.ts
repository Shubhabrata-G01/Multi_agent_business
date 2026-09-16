import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { requireSameOrigin } from "@/lib/csrf";
import { firstIssueMessage, signupSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const originCheck = requireSameOrigin(request);
  if (originCheck) return originCheck;

  const rateLimited = checkRateLimit(clientIp(request), "signup");
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name: name || null,
      password_hash,
      memberships: {
        create: {
          role: "OWNER",
          organization: { create: { name: name ? `${name}'s workspace` : `${email}'s workspace` } },
        },
      },
    },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
