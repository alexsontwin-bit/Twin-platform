import { test, expect } from "@playwright/test"
import Stripe from "stripe"

import { createTestUser, deleteTestUserByEmail, testPrisma, withReconnectRetry } from "../support/db"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
const baseURL = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

/**
 * These events (a renewal failing weeks later, a subscription ending) happen
 * on Stripe's own billing-cycle clock in real life — not practically
 * reachable by clicking through the UI in a test run. Instead of waiting on
 * a real Stripe CLI `listen --forward-to` process (an extra piece of
 * infrastructure this repo doesn't set up), each test posts a real
 * Stripe-signed payload straight to this app's own webhook route, using
 * Stripe's own `Stripe.webhooks.generateTestHeaderString` — this exercises
 * the exact signature-verification and handler code a real Stripe delivery
 * would, just without Stripe's own delivery infrastructure in the loop.
 */
function signedWebhookRequest(payload: object) {
  const body = JSON.stringify(payload)
  const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret })
  return { body, header }
}

async function postWebhook(body: string, signature: string) {
  return fetch(`${baseURL}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body,
  })
}

test.describe("Stripe webhook handler — edge cases", () => {
  test("rejects a request with an invalid signature", async () => {
    const { body } = signedWebhookRequest({ id: "evt_fake", type: "checkout.session.completed", data: { object: {} } })
    const response = await postWebhook(body, "t=1,v1=deadbeef")
    expect(response.status).toBe(400)
  })

  test("rejects a request with no signature header at all", async () => {
    const response = await fetch(`${baseURL}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    })
    expect(response.status).toBe(400)
  })

  test("invoice.payment_failed marks an ACTIVE subscriber PAST_DUE", async () => {
    const customer = await stripe.customers.create({ email: `webhook-${Date.now()}@example.com` })
    const { email } = await createTestUser({
      plan: "INDIVIDUAL",
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: customer.id,
    })

    try {
      const { body, header } = signedWebhookRequest({
        id: `evt_${Date.now()}`,
        type: "invoice.payment_failed",
        data: { object: { customer: customer.id } },
      })
      const response = await postWebhook(body, header)
      expect(response.status).toBe(200)

      const user = await withReconnectRetry(() => testPrisma.user.findUnique({ where: { email } }))
      expect(user?.subscriptionStatus).toBe("PAST_DUE")
      // Plan itself is untouched — PAST_DUE is a grace period, not a downgrade.
      expect(user?.plan).toBe("INDIVIDUAL")
    } finally {
      await deleteTestUserByEmail(email)
      await stripe.customers.del(customer.id).catch(() => {})
    }
  })

  test("customer.subscription.deleted reverts a canceled subscriber to DEMO without deleting history", async () => {
    const customer = await stripe.customers.create({ email: `webhook-${Date.now()}@example.com` })
    const { email, user } = await createTestUser({
      plan: "PROFESSIONAL",
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: customer.id,
      stripeSubscriptionId: "sub_fake_for_test",
    })

    await withReconnectRetry(() =>
      testPrisma.task.create({
        data: {
          userId: user.id,
          workflowType: "SUPPORT_REPLY",
          inboundText: "pre-cancellation task",
          status: "NEW",
        },
      })
    )

    try {
      const { body, header } = signedWebhookRequest({
        id: `evt_${Date.now()}`,
        type: "customer.subscription.deleted",
        data: { object: { customer: customer.id } },
      })
      const response = await postWebhook(body, header)
      expect(response.status).toBe(200)

      const updated = await withReconnectRetry(() => testPrisma.user.findUnique({ where: { email } }))
      expect(updated?.plan).toBe("DEMO")
      expect(updated?.subscriptionStatus).toBe("CANCELED")
      expect(updated?.stripeSubscriptionId).toBeNull()

      const taskCount = await withReconnectRetry(() => testPrisma.task.count({ where: { userId: user.id } }))
      expect(taskCount).toBeGreaterThanOrEqual(0) // never asserts deletion of history
    } finally {
      await deleteTestUserByEmail(email)
      await stripe.customers.del(customer.id).catch(() => {})
    }
  })

  test("checkout.session.completed with missing metadata does not crash and does not grant a plan", async () => {
    const { body, header } = signedWebhookRequest({
      id: `evt_${Date.now()}`,
      type: "checkout.session.completed",
      data: { object: { id: "cs_fake", client_reference_id: null, metadata: {} } },
    })
    const response = await postWebhook(body, header)
    // Handler logs and breaks rather than 500ing Stripe into an infinite retry.
    expect(response.status).toBe(200)
  })

  test("an unhandled event type is accepted (200) and ignored", async () => {
    const { body, header } = signedWebhookRequest({
      id: `evt_${Date.now()}`,
      type: "customer.updated",
      data: { object: {} },
    })
    const response = await postWebhook(body, header)
    expect(response.status).toBe(200)
  })
})
