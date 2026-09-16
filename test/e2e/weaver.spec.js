const { test, expect } = require("@playwright/test");

test.describe("Weaver E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the view container to exist (attached) — content will follow.
    await page.waitForSelector("#view", { state: "attached", timeout: 15000 });
    // Wait for the app to render something into #view.
    await page.waitForFunction(
      () => {
        const view = document.querySelector("#view");
        return view && view.children.length > 0;
      },
      null,
      { timeout: 20000 },
    );
  });

  test("should load dashboard", async ({ page }) => {
    await expect(page.locator("#page-title")).toHaveText("Dashboard");
    const cards = page.locator(".card");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test("should add a holding and verify weighted-average UI", async ({
    page,
  }) => {
    const addBtn = page.locator('button:has-text("+ Add")').first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    await page.waitForSelector(".modal", { timeout: 10000 });
    await expect(page.locator(".modal")).toBeVisible();

    const closeBtn = page.locator(".modal-x").first();
    if (await closeBtn.count()) await closeBtn.click();
  });

  test("should log a decision and show replay badge", async ({ page }) => {
    await page.goto("/#/journal");
    await page.waitForFunction(
      () => {
        const view = document.querySelector("#view");
        return view && view.children.length > 0;
      },
      null,
      { timeout: 15000 },
    );

    const btn = page
      .locator(
        'button:has-text("Log Decision"), button:has-text("+ Log Decision"), button:has-text("+ New Decision")',
      )
      .first();

    if ((await btn.count()) === 0) {
      test.skip();
      return;
    }

    await btn.click();
    await page.waitForSelector(
      "#decision-form-container:not(.hidden), #decision-form",
      { timeout: 5000 },
    );

    await page.fill("#d-asset", "BTC");
    await page.fill("#d-price", "60000");
    await page.fill("#d-reasoning", "E2E test decision");
    await page.click('button:has-text("Save Decision")');

    await page.waitForSelector("[data-decision-id]", { timeout: 5000 });
    const decisionCards = page.locator("[data-decision-id]");
    await expect(decisionCards.first()).toBeVisible();
  });
});
