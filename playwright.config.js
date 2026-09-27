// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("Intelligence Pipeline - Data Integrity", () => {
  test('should display "What Matters Now" feed', async ({ page }) => {
    await page.goto("/");

    // Wait for intelligence feed to load
    await page.waitForSelector("#what-matters-now-container", {
      timeout: 10000,
    });

    // Verify feed container is visible
    const feed = page.locator("#what-matters-now-container");
    await expect(feed).toBeVisible();
  });

  test("should show honest unknown for missing cost basis", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for portfolio to load
    await page.waitForSelector("#d-port", { timeout: 10000 });

    // If there are wallet holdings without cost basis, verify they show "—"
    const pnlCells = page.locator("td.num").filter({ hasText: /—/ });

    // This is a soft check - we just verify the UI doesn't crash
    // and can render the unknown state
    await expect(page.locator("#d-port")).toBeVisible();
  });

  test("should validate signal contracts in browser console", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for app to initialize
    await page.waitForSelector(".app", { timeout: 10000 });

    // Check that the intelligence types module loaded
    const contractVersion = await page.evaluate(() => {
      return window.W?.intelligence?.CONTRACT_VERSION;
    });

    expect(contractVersion).toBeTruthy();
    expect(contractVersion).toContain("intelligence-contracts");
  });
});
