import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
  const email = typeof obj.email === "string" ? obj.email.trim().toLowerCase() : "";
  const password = typeof obj.password === "string" ? obj.password : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (password.length < 12) {
    return NextResponse.json(
      { error: "Password must be at least 12 characters." },
      { status: 400 },
    );
  }

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
