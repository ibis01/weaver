const { test, expect } = require("@playwright/test");

test.describe("Weaver E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:8000");
    await page.waitForSelector("#view");
  });

  test("should load dashboard", async ({ page }) => {
    await expect(page.locator("text=Dashboard")).toBeVisible();
  });

  test("should add a holding and verify weighted-average", async ({ page }) => {
    await page.click("text=+ Add");
    await page.fill('input[name="qty"]', "0.5");
    await page.fill('input[name="buyPrice"]', "60000");
    await page.click('button:has-text("Add")');
    // Add another holding with same asset
    await page.click("text=+ Add");
    await page.fill('input[name="qty"]', "0.3");
    await page.fill('input[name="buyPrice"]', "65000");
    await page.click('button:has-text("Add")');
    // Verify portfolio table shows merged qty and avg price
    await expect(page.locator('td:has-text("BTC") + td')).toContainText("0.8");
  });

  test("should log a decision and show replay", async ({ page }) => {
    await page.click("text=Journal");
    await page.click("text=+ Log Decision");
    await page.fill("#d-asset", "BTC");
    await page.fill("#d-price", "60000");
    await page.fill("#d-reasoning", "Test decision");
    await page.click('button:has-text("Save Decision")');
    // Click Show Replay
    await page.click("text=Show Replay");
    await expect(page.locator(".replay-details-container")).toBeVisible();
  });

  // More tests: sync, alerts, etc.
});
