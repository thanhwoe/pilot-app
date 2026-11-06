import { defineConfig, devices } from "@playwright/test";
import { API_PORT, API_URL, E2E_DATABASE_URL, WEB_PORT, WEB_URL } from "./e2e/servers";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // The API from #5, with the dev code endpoint on so tests can read sign-in codes.
      command: `node e2e/prepare-db.mts ${E2E_DATABASE_URL} && pnpm --filter @gop/api db:migrate && pnpm --filter @gop/api start`,
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        PORT: String(API_PORT),
        CORS_ORIGINS: WEB_URL,
        NODE_ENV: "test",
        DEV_SIGN_IN_CODES: "true",
        // Empty, so a key in apps/api/.env can not make the e2e runs email their throwaway addresses.
        RESEND_API_KEY: "",
        AUTH_SECRET: "e2e-only-secret-not-for-any-real-environment",
      },
    },
    {
      // A production build, so the session cookie is Secure as it is in production.
      command: `pnpm build && pnpm start --port ${WEB_PORT}`,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { API_URL },
    },
  ],
});
