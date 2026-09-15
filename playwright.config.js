// playwright.config.js
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.CI
      ? "npx --yes http-server -p 8000 -c-1 ."
      : "python3 -m http.server 8000",
    port: 8000,
    reuseExistingServer: !process.env.CI,
    timeout: 30000, // Increased from 10s to 30s for CI stability
  },
});
