import { defineConfig, devices } from "@playwright/test"

/**
 * Points at the deployed Vercel URL instead of spawning a local dev server —
 * no DATABASE_URL/DIRECT_URL access from here, so tests in this config must
 * create their own state through the real UI (signup form), not Prisma.
 */
export default defineConfig({
  testDir: "./tests/live",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: "https://twin-platform-phi.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
