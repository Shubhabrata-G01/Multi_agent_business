import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rateLimit";

const secureCookies = process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_INSECURE !== "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  // STEP 4 item 13: explicit secure cookie config rather than relying only
  // on Auth.js's own HTTPS auto-detection - httpOnly (never readable from
  // client JS), sameSite=lax (sent on top-level navigation, not
  // cross-site POSTs - CSRF-hardening for the session cookie itself), and
  // the `__Secure-` prefix + `secure: true` whenever the app is actually
  // served over HTTPS (browser refuses to ever send/store it over plain
  // HTTP). NODE_ENV alone isn't a safe proxy for that: a production
  // deployment reachable directly over HTTP (no TLS-terminating proxy in
  // front yet, e.g. testing via a bare IP:port) would have every sign-in
  // silently fail to persist a session, since the browser drops both the
  // `secure` cookie and the `__Secure-` prefixed name outside HTTPS. Set
  // AUTH_COOKIE_INSECURE=true to opt out for such a deployment.
  cookies: {
    sessionToken: {
      name: secureCookies ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookies,
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
