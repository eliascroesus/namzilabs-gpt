import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "./node_modules/.bin/next dev -H 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      APP_ENV: "test",
      APP_URL: "http://127.0.0.1:3000",
      APP_PASSWORD: "prototype-test-password",
      APP_ORGANIZATION_ID: "00000000-0000-4000-8000-000000000001",
      APP_USER_ID: "prototype-test-admin",
      APP_ROLE: "owner",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
