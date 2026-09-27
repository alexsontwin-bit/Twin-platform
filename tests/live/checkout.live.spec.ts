import { test, expect, type Page } from "@playwright/test"

/**
 * Runs against the real deployed app (playwright.live.config.ts), not a
 * local dev server — creates its own throwaway account through the real
 * signup form (no Prisma access to production from here) and drives a real
 * Stripe test-mode checkout end to end, exactly as a real customer would.
 */
const TEST_EMAIL = `live-check-${Date.now()}@example.com`
const TEST_PASSWORD = "LiveTestPassword123!"

async function fillStripeTestCard(page: Page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })

  const cardFrame = page.frameLocator('iframe[title="Secure card number input frame"]')
  await cardFrame.locator('input[name="cardnumber"]').fill("4242424242424242")

  const expiryFrame = page.frameLocator('iframe[title="Secure expiration date input frame"]')
  await expiryFrame.locator('input[name="exp-date"]').fill("12/34")

  const cvcFrame = page.frameLocator('iframe[title="Secure CVC input frame"]')
  await cvcFrame.locator('input[name="cvc"]').fill("123")

  const nameField = page.locator('input[name="billingName"]')
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill("Live Test")
  }

  const postalField = page.locator('input[name="postalCode"], input[id="billingPostalCode"]')
  if (await postalField.first().isVisible().catch(() => false)) {
    await postalField.first().fill("94103")
  }

  await page.getByTestId("hosted-payment-submit-button").click()
}

test("full live flow: signup -> upgrade to Individual via real Stripe test payment -> webhook confirms plan active", async ({
  page,
}) => {
  await page.goto("/signup")
  // Wait for the form to actually be interactive (React hydrated and
  // react-hook-form's handleSubmit attached) before clicking — otherwise a
  // click can hit the raw <button type="submit"> before its onClick/
  // onSubmit handler is wired up, triggering the browser's native form GET
  // submission instead (which is what happened on the first live run here:
  // the page reloaded to /signup?email=...&password=... in plaintext).
  await page.getByRole("heading", { name: /create your account/i }).waitFor()
  await page.waitForLoadState("networkidle")

  await page.getByLabel("Email").fill(TEST_EMAIL)
  await page.locator("#password").fill(TEST_PASSWORD)
  await page.locator("#confirmPassword").fill(TEST_PASSWORD)
  await page.getByRole("button", { name: /create account/i }).click()

  await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

  await page.goto("/pricing")
  await expect(page.getByRole("heading", { name: /choose the plan/i })).toBeVisible()

  const individualCard = page
    .getByRole("heading", { name: "Individual", exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")
  await individualCard.getByRole("button", { name: /upgrade/i }).click()

  await fillStripeTestCard(page)

  await page.waitForURL(/\/billing\/success/, { timeout: 30_000 })
  await expect(page.getByRole("heading", { name: /you.?re all set/i })).toBeVisible({ timeout: 25_000 })

  await page.goto("/pricing")
  await expect(individualCard.getByText(/current plan/i)).toBeVisible()

  await page.goto("/settings")
  await expect(page.getByText(/current plan: individual/i)).toBeVisible()
  await expect(page.getByRole("button", { name: /manage billing/i })).toBeVisible()
})
