import Stripe from "stripe"

/**
 * MonetizationPlan.md Step 3 — single shared Stripe client, same singleton
 * pattern as lib/prisma.ts, for the same reason (avoid creating a new
 * client per request across dev hot-reloads).
 */
const globalForStripe = globalThis as unknown as { stripe?: Stripe }

function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. See StripeSetupGuide.md for how to get your test-mode keys."
    )
  }
  return new Stripe(secretKey)
}

export const stripe = globalForStripe.stripe ?? createStripeClient()

if (process.env.NODE_ENV !== "production") {
  globalForStripe.stripe = stripe
}

/**
 * Maps this app's internal plan+interval identifiers to the Stripe Price
 * IDs configured in .env.local (see StripeSetupGuide.md Section 3).
 * Confirmed pricing (2026-09-27): Individual $100/mo or $1,200/yr,
 * Professional $2,500/mo or $30,000/yr — the yearly price is exactly 12x
 * monthly, not a discounted rate, so there's no "percent off" to compute
 * anywhere in this app, only two flat Price IDs per plan. Enterprise is
 * deliberately NOT included — confirmed with the client as "Contact Us"
 * (email) only, with no self-serve Stripe price, ever.
 */
export const PLAN_PRICE_IDS = {
  INDIVIDUAL: {
    monthly: process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY,
    yearly: process.env.STRIPE_PRICE_INDIVIDUAL_YEARLY,
  },
  PROFESSIONAL: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY,
  },
} as const

export type SelfServePlan = keyof typeof PLAN_PRICE_IDS
export type BillingInterval = "monthly" | "yearly"
