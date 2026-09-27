import type { User } from "@prisma/client"

/**
 * MonetizationPlan.md Step 1 — the ONLY place in the codebase that
 * interprets `User.plan`/`subscriptionStatus`. Every gating check anywhere
 * in the app (Server Actions, Server Components, future admin tooling)
 * must call these two functions, never re-implement "is this user paid" or
 * "how many tasks can they create" as a separate ad-hoc comparison —
 * exactly the kind of duplication this project's CodingConventions.md is
 * strict about avoiding elsewhere (see lib/workflow-engine.ts's single-path
 * status-transition rule for the same principle applied to a different
 * concern).
 *
 * Deliberately does NOT read from a NextAuth session/JWT — see
 * MonetizationPlan.md Step 1's architectural note: session data can lag
 * behind a real plan change (e.g. a cancellation) for the lifetime of the
 * user's login session, since JWTs only refresh on login/token-rotation.
 * Both functions take the full `User` row as returned by `requireUser()`
 * (which re-fetches from Postgres on every call), so callers always get a
 * fresh, correct answer.
 */

const DEMO_TASK_LIMIT = 3

/**
 * A `PAST_DUE` subscription (a failed renewal charge, see the
 * invoice.payment_failed webhook handler in Step 3) is deliberately still
 * treated as paid here — a short grace period rather than an instant
 * downgrade avoids punishing a customer for a transient card issue before
 * Stripe's own retry schedule and dunning emails have had a chance to
 * resolve it. Only `CANCELED` (or a `DEMO` plan that never subscribed)
 * loses paid access. Revisit this if the client wants stricter behavior.
 */
export function isPaidPlan(user: Pick<User, "plan" | "subscriptionStatus">): boolean {
  if (user.plan === "DEMO") return false
  return user.subscriptionStatus === "ACTIVE" || user.subscriptionStatus === "PAST_DUE"
}

/**
 * Returns `null` for a paid account, meaning "no limit" — callers must
 * treat `null` as unlimited, not as zero. `MUST be >= 1` per this plan's
 * open-decisions section: OnboardingClient.tsx deep-links every fresh
 * signup straight into /tasks/new as their first authenticated screen, so
 * a cap of 0 would block a brand-new user before they ever see the
 * product work even once.
 */
export function getTaskLimit(user: Pick<User, "plan" | "subscriptionStatus">): number | null {
  if (isPaidPlan(user)) return null
  return DEMO_TASK_LIMIT
}

/**
 * MonetizationPlan.md Step 6 — the Eval Dashboard is deliberately a
 * NARROWER gate than isPaidPlan(): Individual customers do NOT get it,
 * only Professional and Enterprise. This is intentionally a separate
 * function rather than a parameter on isPaidPlan() — that function answers
 * one question ("is this account currently in good standing on ANY paid
 * plan") and must stay simple/reusable everywhere; a feature-specific tier
 * check like this one composes on top of it instead of complicating it.
 * Always call isPaidPlan() first here rather than re-deriving the
 * subscriptionStatus check separately, per this file's own single-source-
 * of-truth rule.
 */
export function hasEvalAccess(user: Pick<User, "plan" | "subscriptionStatus">): boolean {
  if (!isPaidPlan(user)) return false
  return user.plan === "PROFESSIONAL" || user.plan === "ENTERPRISE"
}

const HISTORY_RETENTION_DAYS = {
  DEMO: 7,
  INDIVIDUAL: 30,
  PROFESSIONAL: null,
  ENTERPRISE: null,
} as const

/**
 * MonetizationPlan.md Step 6.5 — a second premium differentiator alongside
 * the Eval Dashboard gate and CSV export: Demo/Individual only see the
 * Observation Log's recent history, Professional/Enterprise see the full,
 * unbounded audit trail. `null` means "no limit," matching getTaskLimit()'s
 * convention. This is a NARROWER cut than hasEvalAccess() (Individual gets
 * 30 days here but zero Eval Dashboard access at all), so it stays its own
 * function rather than being folded into that one.
 *
 * Only bounds how far back a user can query/see — it never deletes Task/
 * AiDraft/Decision rows. A canceled or downgraded account's older history
 * becomes invisible, not destroyed, consistent with this file's existing
 * "never delete data on cancellation" rule (see plan.ts's isPaidPlan note
 * and the Stripe webhook handler's customer.subscription.deleted case).
 */
export function getHistoryRetentionDays(user: Pick<User, "plan" | "subscriptionStatus">): number | null {
  if (!isPaidPlan(user)) return HISTORY_RETENTION_DAYS.DEMO
  return HISTORY_RETENTION_DAYS[user.plan]
}
