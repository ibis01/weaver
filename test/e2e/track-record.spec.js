const { test, expect } = require("@playwright/test");

test.describe("Track Record E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#view");
  });

  test("saves an analysis and shows it in the track record list", async ({
    page,
  }) => {
    // Go to token analysis
    await page.goto("/#/token");
    await page.waitForSelector("#ta-input", { timeout: 10000 });
    await page.fill("#ta-input", "BTC");
    await page.click("#ta-go");
    await page.waitForSelector("#ta-save-track", { timeout: 20000 });
    await page.click("#ta-save-track");
    // Navigate to track record
    await page.goto("/#/track");
    await page.waitForSelector("#tr-list");
    // Confirm at least one card
    const cards = page.locator("#tr-list .card");
    await expect(cards.first()).toBeVisible();
  });
});
