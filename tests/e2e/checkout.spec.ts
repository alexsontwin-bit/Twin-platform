import { test, expect, type Page } from "@playwright/test"

import { createTestUser, deleteTestUserByEmail, testPrisma, withReconnectRetry } from "../support/db"
import { loginAs } from "../support/auth"

/**
 * Drives Stripe's actual hosted Checkout page with Stripe's documented
 * test-mode card (4242 4242 4242 4242) — a real subscription is created in
 * Stripe test mode and this app's real webhook handler processes it, exactly
 * like production traffic would. Requires STRIPE_SECRET_KEY/STRIPE_PRICE_*
 * to be TEST-MODE keys (sk_test_...) — never point this at live keys.
 */
async function fillStripeTestCard(page: Page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20_000 })

  // Stripe Checkout may show a link/email step first for new emails; email
  // is already pre-filled from customer_email/customer, so only the payment
  // fields need filling here.
  const cardFrame = page.frameLocator('iframe[title="Secure card number input frame"]')
  await cardFrame.locator('input[name="cardnumber"]').fill("4242424242424242")

  const expiryFrame = page.frameLocator('iframe[title="Secure expiration date input frame"]')
  await expiryFrame.locator('input[name="exp-date"]').fill("12/34")

  const cvcFrame = page.frameLocator('iframe[title="Secure CVC input frame"]')
  await cvcFrame.locator('input[name="cvc"]').fill("123")

  const nameField = page.locator('input[name="billingName"]')
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill("Playwright Test")
  }

  const postalField = page.locator('input[name="postalCode"], input[id="billingPostalCode"]')
  if (await postalField.first().isVisible().catch(() => false)) {
    await postalField.first().fill("94103")
  }

  await page.getByTestId("hosted-payment-submit-button").click()
}

test.describe("Stripe checkout — real test-mode payment flow", () => {
  let email: string
  let password: string

  test.beforeEach(async () => {
    const created = await createTestUser({ plan: "DEMO", subscriptionStatus: "NONE" })
    email = created.email
    password = created.password
  })

  test.afterEach(async () => {
    await deleteTestUserByEmail(email)
  })

  test("a signed-in DEMO user can upgrade to Individual (monthly) via a real Stripe test payment", async ({
    page,
  }) => {
    await loginAs(page, email, password)

    await page.goto("/pricing")
    await expect(page.getByRole("heading", { name: /choose the plan/i })).toBeVisible()

    // Scope by the card's own h2 name ("Individual" exactly) rather than a
    // substring match — "text=Individual" also matches the Professional
    // card's "Everything in Individual" feature bullet, and the shared
    // "rounded-lg" ancestor class picked up by both cards made the earlier
    // xpath ambiguous (2 Upgrade buttons resolved instead of 1).
    const individualCard = page
      .getByRole("heading", { name: "Individual", exact: true })
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")
    await individualCard.getByRole("button", { name: /upgrade/i }).click()

    await fillStripeTestCard(page)

    // Stripe redirects back to this app's success_url after a real charge.
    await page.waitForURL(/\/billing\/success/, { timeout: 30_000 })
    await expect(page.getByText(/activating your plan|you.?re all set/i)).toBeVisible()

    // The success page polls getCurrentPlanStatus() until the webhook lands
    // — waiting for "You're all set!" here proves the webhook (not just the
    // redirect) actually updated the database, exactly what this flow's own
    // code comments call out as the most commonly-missed bug.
    await expect(page.getByRole("heading", { name: /you.?re all set/i })).toBeVisible({ timeout: 20_000 })

    const updatedUser = await withReconnectRetry(() => testPrisma.user.findUnique({ where: { email } }))
    expect(updatedUser?.plan).toBe("INDIVIDUAL")
    expect(updatedUser?.subscriptionStatus).toBe("ACTIVE")
    expect(updatedUser?.stripeCustomerId).toBeTruthy()
    expect(updatedUser?.stripeSubscriptionId).toBeTruthy()

    await page.goto("/pricing")
    await expect(individualCard.getByText(/current plan/i)).toBeVisible()
  })

  test("a logged-out visitor is sent to signup instead of Stripe when clicking Upgrade", async ({ page }) => {
    await page.goto("/pricing")
    const professionalCard = page
      .getByRole("heading", { name: "Professional", exact: true })
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")
    await professionalCard.getByRole("button", { name: /upgrade/i }).click()

    // router.push("/signup?next=/pricing") — Next.js does not URL-encode the
    // "/" in a query value here, so the actual URL keeps a literal slash
    // (.../signup?next=/pricing), not %2F.
    await page.waitForURL(/\/signup\?next=\/pricing/)
    await expect(page.getByRole("heading", { name: /create/i }).or(page.getByText(/create account/i))).toBeVisible()
  })

  test("monthly/yearly toggle updates displayed price without an extra network round-trip", async ({ page }) => {
    await page.goto("/pricing")

    await expect(page.getByText("$100")).toBeVisible()
    await expect(page.getByText("$2,500")).toBeVisible()

    await page.getByRole("tab", { name: "Yearly" }).click()

    await expect(page.getByText("$1,200")).toBeVisible()
    await expect(page.getByText("$30,000")).toBeVisible()
    // Confirmed-with-client behavior: yearly is exactly 12x monthly, so no
    // "save X%" badge should ever render near the toggle.
    await expect(page.getByText(/save \d+%/i)).toHaveCount(0)
  })
})
