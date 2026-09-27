import { defineConfig, devices } from "@playwright/test"

/**
 * Loads .env.local the same way `npm run dev`/Next.js does, so tests see
 * STRIPE_* keys, DATABASE_URL, NEXTAUTH_URL, etc. without duplicating them.
 */
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const PORT = 3000
const BASE_URL = process.env.NEXTAUTH_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 45_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
