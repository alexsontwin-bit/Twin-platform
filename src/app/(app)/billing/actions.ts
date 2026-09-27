"use server"

import { z } from "zod"

import { requireUser } from "@/lib/auth"
import { isPaidPlan } from "@/lib/billing/plan"
import { stripe, PLAN_PRICE_IDS, type SelfServePlan, type BillingInterval } from "@/lib/stripe"

const createCheckoutSessionSchema = z.object({
  plan: z.enum(["INDIVIDUAL", "PROFESSIONAL"], {
    message: "Select a valid plan.",
  }),
  billingInterval: z.enum(["monthly", "yearly"], {
    message: "Select monthly or yearly billing.",
  }),
})

export type CreateCheckoutSessionResult =
  | { success: true; checkoutUrl: string }
  | { success: false; error: string }

export async function createCheckoutSession(input: unknown): Promise<CreateCheckoutSessionResult> {
  const parsed = createCheckoutSessionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid plan." }
  }

  const plan = parsed.data.plan as SelfServePlan
  const billingInterval = parsed.data.billingInterval as BillingInterval

  let user
  try {
    user = await requireUser()
  } catch {
    return { success: false, error: "You must be signed in to upgrade." }
  }

  const priceId = PLAN_PRICE_IDS[plan][billingInterval]
  if (!priceId) {
    // Genuinely expected right now — StripeSetupGuide.md Section 3's
    // Price IDs haven't been created/filled in yet. A clear, specific
    // error here (not a raw Stripe API crash) is the correct behavior
    // until pricing is finalized, not a bug to silently work around.
    return {
      success: false,
      error: "This plan isn't available for checkout yet — pricing hasn't been finalized.",
    }
  }

  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.stripeCustomerId ? undefined : user.email,
      // If this user already has a Stripe customer, reuse it — never
      // create a second Stripe customer for the same app user (that would
      // split their billing history and break the webhook's ability to
      // find "the" customer for this account).
      customer: user.stripeCustomerId ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      // client_reference_id is the critical link back to this app's own
      // userId — the webhook handler (below, Step 3's other half) reads
      // this from checkout.session.completed to know WHICH internal user
      // just paid, since Stripe has no concept of our own user ids.
      client_reference_id: user.id,
      metadata: { userId: user.id, plan, billingInterval },
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
    })

    if (!session.url) {
      return { success: false, error: "Could not start checkout — please try again." }
    }

    return { success: true, checkoutUrl: session.url }
  } catch {
    return { success: false, error: "Something went wrong starting checkout — please try again." }
  }
}

export type CreatePortalSessionResult =
  | { success: true; portalUrl: string }
  | { success: false; error: string }

/**
 * MonetizationPlan.md Step 5 — lets a paying customer manage/cancel their
 * own subscription via Stripe's hosted portal, without emailing support.
 */
export async function createPortalSession(): Promise<CreatePortalSessionResult> {
  let user
  try {
    user = await requireUser()
  } catch {
    return { success: false, error: "You must be signed in to manage billing." }
  }

  // A DEMO user (never checked out) has no stripeCustomerId at all — the
  // "Manage Billing" button is only rendered for a paid user in Settings,
  // but this Server Action is still the real access boundary (a client
  // could call it directly), so this check is not just a UI convenience —
  // it is what actually prevents a null customerId from ever reaching the
  // Stripe API and crashing this request.
  if (!user.stripeCustomerId) {
    return { success: false, error: "No billing account found for your plan." }
  }

  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/settings`,
    })
    return { success: true, portalUrl: session.url }
  } catch {
    return { success: false, error: "Something went wrong opening billing — please try again." }
  }
}

/**
 * MonetizationPlan.md Step 3's own testing prompt flagged this exact race
 * as the most commonly-missed bug in the whole checkout flow: Stripe's
 * redirect back to success_url is a full browser navigation the user's own
 * connection speed controls, while the webhook that actually updates
 * User.plan fires independently from Stripe's servers — it is entirely
 * normal (not a rare edge case) for a user to land on the success page
 * BEFORE the webhook has been received and processed. Polled from
 * billing/success's client component so a user who just paid never sees a
 * stale "still on Demo" state.
 */
export async function getCurrentPlanStatus(): Promise<{ isPaid: boolean }> {
  const user = await requireUser()
  return { isPaid: isPaidPlan(user) }
}
