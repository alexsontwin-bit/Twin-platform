import type { Page } from "@playwright/test"

/**
 * Logs an already-created test user in through the real /login form (no
 * session-cookie shortcuts).
 *
 * Retries the whole attempt, not just a DB call: this project's real,
 * pre-existing Neon connection flakiness (see tests/support/db.ts) reaches
 * all the way into NextAuth's own `authorize()` callback in src/lib/auth.ts
 * — confirmed directly in a dev-server log during this suite's own runs,
 * where a real login POST failed with "Can't reach database server" and no
 * retry, surfacing to the user as "Incorrect email or password" toast (the
 * LoginForm's generic error branch, since Auth.js swallows the underlying
 * PrismaClientInitializationError). That is a real app-reliability gap
 * worth fixing at the source (see repo's E2E test notes), but retrying here
 * is what makes this helper actually reflect a normal login rather than
 * failing tests on an unrelated infra blip every run.
 */
export async function loginAs(page: Page, email: string, password: string, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await page.goto("/login")
    await page.getByLabel("Email").fill(email)
    // getByLabel("Password") is ambiguous here: PasswordInput's "Show
    // password" toggle button also exposes an accessible name containing
    // "password" (aria-label="Show password"), so plain getByLabel matches
    // both the input and the button under Playwright's strict mode. The
    // input itself has id="password", so target that directly instead.
    await page.locator("#password").fill(password)
    await page.getByRole("button", { name: /sign in/i }).click()

    try {
      await page.waitForURL("**/dashboard", { timeout: 10_000 })
      return
    } catch {
      if (attempt === attempts) throw new Error(`loginAs: gave up after ${attempts} attempts for ${email}`)
    }
  }
}
