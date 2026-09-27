/**
 * This project's Neon Postgres endpoint drops a real, measurable fraction of
 * fresh connections (confirmed directly: ~40-70% failure rate on isolated
 * connection attempts during testing, both against the pooled and unpooled
 * endpoints) — not a rare edge case. Without this wrapper, a Server Action's
 * first Prisma call hitting this throws an unhandled
 * PrismaClientInitializationError, which for signup/actions.ts's `signup()`
 * meant the whole action failed before React could take over — observed
 * directly causing the browser to fall back to a native HTML form GET
 * submission (leaking the password into the URL/browser history) instead of
 * showing the intended "something went wrong" error state.
 *
 * Every Server Action or Route Handler's FIRST Prisma call in its request
 * (the one most likely to hit a cold/dropped connection) should go through
 * this, matching the pattern already used for background jobs elsewhere in
 * this app (the Stripe webhook handler, CheckoutSuccessStatus's polling).
 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes("Can't reach database server")) throw error
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)))
    }
  }
  throw lastError
}
