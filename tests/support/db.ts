import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

/**
 * Separate client from src/lib/prisma.ts's singleton — tests run outside
 * Next.js's process, so there's no hot-reload issue to guard against, and a
 * dedicated client makes it obvious this connection's lifecycle is owned by
 * the test suite (disconnected in global teardown).
 *
 * Uses DIRECT_URL (Neon's unpooled endpoint), not the shared pooled
 * DATABASE_URL the dev server itself uses. Measured directly against this
 * project's pooled endpoint: ~40% of fresh connections failed outright with
 * "Can't reach database server," worsening over a long-running Playwright
 * session — a real Neon pooler flakiness this repo's own code comments
 * already allude to, not something caused by this test code. The unpooled
 * DIRECT_URL is far more stable for a sequential test client's connection
 * pattern and avoids competing with the dev server's own pool for
 * DATABASE_URL's connection_limit.
 */
export const testPrisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL! } } })

const TEST_EMAIL_PREFIX = "playwright-test+"

export function uniqueTestEmail(label: string): string {
  return `${TEST_EMAIL_PREFIX}${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

export const TEST_PASSWORD = "TestPassword123!"

/**
 * This project's own known Neon "connection blip" (referenced in webhook
 * route.ts and CheckoutSuccessStatus.tsx) is not rare or Stripe-related —
 * measured directly against this env's DATABASE_URL, roughly 2 in 5 fresh
 * connections to the pooled endpoint fail outright with "Can't reach
 * database server" before ever reaching a query, unrelated to any Stripe
 * call or idle timeout. Retrying a fresh query (not the same failed
 * connection) resolves it in practice, but this masks a real infra
 * flakiness worth fixing at the source (e.g. Neon pooler/region, or an
 * unpooled DIRECT_URL for test/dev traffic) rather than something to
 * silently tolerate forever.
 */
export async function withReconnectRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes("Can't reach database server")) throw error
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)))
    }
  }
  throw lastError
}

export async function createTestUser(overrides?: {
  email?: string
  plan?: "DEMO" | "INDIVIDUAL" | "PROFESSIONAL" | "ENTERPRISE"
  subscriptionStatus?: "NONE" | "ACTIVE" | "PAST_DUE" | "CANCELED"
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
}) {
  const email = overrides?.email ?? uniqueTestEmail("user")
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  const user = await withReconnectRetry(() =>
    testPrisma.user.create({
      data: {
        email,
        passwordHash,
        name: "Playwright Test User",
        hasOnboarded: true,
        plan: overrides?.plan ?? "DEMO",
        subscriptionStatus: overrides?.subscriptionStatus ?? "NONE",
        stripeCustomerId: overrides?.stripeCustomerId ?? null,
        stripeSubscriptionId: overrides?.stripeSubscriptionId ?? null,
      },
    })
  )

  return { user, email, password: TEST_PASSWORD }
}

/**
 * Task.userId is a RESTRICT foreign key (never cascade-deleted, per this
 * app's own "never delete history on cancellation" rule) — a test user with
 * any Task rows must have them removed first or the User delete itself
 * violates that constraint. Decision rows carry the same relation.
 */
export async function deleteTestUserByEmail(email: string) {
  const user = await withReconnectRetry(() => testPrisma.user.findUnique({ where: { email } }))
  if (!user) return
  await withReconnectRetry(() => testPrisma.decision.deleteMany({ where: { actorUserId: user.id } })).catch(() => {})
  await withReconnectRetry(() => testPrisma.task.deleteMany({ where: { userId: user.id } }))
  await withReconnectRetry(() => testPrisma.user.delete({ where: { id: user.id } }))
}

/** Cleans up every user this suite created, in case an individual test's own cleanup was skipped by a failure. */
export async function cleanupAllTestUsers() {
  const users = await testPrisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { id: true, email: true },
  })
  for (const u of users) {
    await deleteTestUserByEmail(u.email)
  }
}
