// @ts-check
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  // E2E specs live under the same test/ tree as unit,
  // integration, and security. See test/e2e/.
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
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
    command: "npx http-server -p 8080 -c-1",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
