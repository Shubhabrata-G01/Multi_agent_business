import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rateLimit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  // STEP 4 item 13: explicit secure cookie config rather than relying only
  // on Auth.js's own HTTPS auto-detection - httpOnly (never readable from
  // client JS), sameSite=lax (sent on top-level navigation, not
  // cross-site POSTs - CSRF-hardening for the session cookie itself), and
  // the `__Secure-` prefix + `secure: true` in production (browser refuses
  // to ever send it over plain HTTP).
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string"
          ? credentials.email.trim().toLowerCase()
          : "";
        const password = typeof credentials?.password === "string"
          ? credentials.password
          : "";
        if (!email || !password) return null;

        // STEP 4 item 5: bound login attempts per email, independent of the
        // signup route's own per-IP limit - this is what actually protects
        // against credential-stuffing/brute-force against one account.
        if (isRateLimited(email, "login")) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) session.user.id = String(token.userId);
      return session;
    },
  },
  pages: { signIn: "/login" },
});
