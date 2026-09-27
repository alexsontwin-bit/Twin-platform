import { NextResponse } from "next/server"
import type Stripe from "stripe"

import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

/**
 * MonetizationPlan.md Step 3 — the actual account-update logic for the
 * whole payment flow lives here, not in the checkout-session action.
 * Stripe calls this endpoint directly, unauthenticated (it is not a
 * logged-in browser request) — see the CRITICAL note in
 * src/proxy.ts's config.matcher, which must exclude this path or every
 * single webhook delivery gets redirected to /login and silently fails.
 *
 * Signature verification (below) is the ONLY thing standing between this
 * endpoint and anyone on the internet being able to forge a
 * "checkout.session.completed" event and grant themselves a free paid
 * plan — never remove or weaken it.
 */
export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret." }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    // Deliberately generic — never echo back why verification failed
    // (timing/oracle information for an attacker probing this endpoint).
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object
        const userId = session.client_reference_id ?? session.metadata?.userId
        const plan = session.metadata?.plan

        if (!userId || (plan !== "INDIVIDUAL" && plan !== "PROFESSIONAL")) {
          // Missing/malformed metadata on a real Stripe-signed event would
          // mean a bug in createCheckoutSession, not a forged request (the
          // signature already passed) — log-worthy, but don't 500 Stripe
          // into an infinite retry loop over something retrying won't fix.
          console.error("checkout.session.completed missing userId/plan metadata", session.id)
          break
        }

        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id

        await prisma.user.update({
          where: { id: userId },
          data: {
            plan,
            subscriptionStatus: "ACTIVE",
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
          },
        })
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id

        const status = mapStripeStatus(subscription.status)
        const currentPeriodEnd = getCurrentPeriodEnd(subscription)

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionStatus: status,
            currentPeriodEnd,
          },
        })
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id

        // MonetizationPlan.md's open-decisions section: revert to
        // demo-capped access, never delete the account's existing
        // task/decision history.
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan: "DEMO",
            subscriptionStatus: "CANCELED",
            stripeSubscriptionId: null,
            currentPeriodEnd: null,
          },
        })
        break
      }

      case "invoice.payment_failed": {
        // A RENEWAL charge failing, weeks/months after a successful
        // initial checkout — distinct from a decline at checkout time
        // (Stripe Checkout itself handles that, this event never fires
        // for it). Without this handler, a customer whose card expires
        // would keep full paid access indefinitely, since
        // subscription.updated does not fire immediately on a failed
        // renewal attempt.
        const invoice = event.data.object
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id

        if (customerId) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "PAST_DUE" },
          })
        }
        break
      }

      default:
        // Unhandled event types are expected and fine — Stripe sends many
        // event types this app doesn't need to react to.
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Stripe webhook handler error:", error)
    // A 500 tells Stripe to retry this event later (its own backoff
    // schedule) — correct behavior for a transient failure (e.g. a
    // momentary DB connection blip, which this project has hit before),
    // rather than silently dropping an event Stripe will never resend.
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 })
  }
}

function mapStripeStatus(status: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELED" {
  if (status === "active" || status === "trialing") return "ACTIVE"
  if (status === "past_due" || status === "unpaid") return "PAST_DUE"
  return "CANCELED"
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items.data[0]
  if (!item?.current_period_end) return null
  return new Date(item.current_period_end * 1000)
}
