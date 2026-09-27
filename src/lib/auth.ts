import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

import { prisma } from "@/lib/prisma"
import { withDbRetry } from "@/lib/db-retry"

/**
 * NextAuth.js v5 (Auth.js) config — Credentials provider (email/password),
 * self-hosted, no external auth account. See docs/DataModel.md's User model
 * and docs/ApplicationFlow.md Section 2.
 *
 * Credentials-based auth requires JWT sessions (no database session strategy
 * support) per Auth.js's own Credentials provider docs.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  // Auth.js v5 strictly validates the incoming Host header against
  // NEXTAUTH_URL in production mode (next start) — this check is relaxed
  // in `next dev`, which is exactly why this was never caught until a real
  // production-build test (Test Prompt 4) ran against `next start`: with
  // trustHost unset, every single auth request (session check, credentials
  // callback, etc.) failed with "UntrustedHost" and a 500, meaning NO ONE
  // could sign in at all once deployed. `trustHost: true` is the documented
  // fix for self-hosted/non-auto-detected environments — Vercel's own
  // platform normally sets this automatically, but relying on that instead
  // of setting it explicitly would leave any OTHER host (a custom domain,
  // a different platform, or this exact local `next start` test) broken.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Normalize the same way signup does (trim + lowercase) — emails
        // are stored normalized, and Postgres's default unique comparison
        // is case-sensitive, so a login attempt with different casing than
        // what was typed at signup must still match the same stored row.
        const rawEmail = typeof credentials?.email === "string" ? credentials.email : undefined
        const email = rawEmail?.trim().toLowerCase()
        const password = typeof credentials?.password === "string" ? credentials.password : undefined
        if (!email || !password) return null

        const user = await withDbRetry(() => prisma.user.findUnique({ where: { email } }))
        if (!user) return null

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) return null

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id
      }
      return session
    },
  },
})

/**
 * Shared server-side auth helper — every Server Action and Route Handler
 * that mutates data MUST call this FIRST, before touching Prisma.
 * middleware.ts protects PAGE navigation only; it does NOT protect Server
 * Actions or Route Handlers called directly, so this is mandatory there too
 * (see docs/CodingConventions.md Section 5 and MasterPrompts.md Step 3.1).
 */
export async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  const user = await withDbRetry(() => prisma.user.findUnique({ where: { id: session.user.id } }))
  if (!user) {
    throw new Error("Unauthorized")
  }

  return user
}
