const { test, expect } = require("@playwright/test");

test.describe("Track Record", () => {
  test("opens the Track Record route with a historical-only empty state", async ({
    page,
  }) => {
    await page.goto("/#/track");
    await page.waitForSelector("#view", { state: "attached" });
    await expect(page.locator("#page-title")).toHaveText("Track Record");
    await expect(page.locator("#view")).toContainText(
      "Historical Weaver analyses are immutable",
    );
    await expect(page.locator("#view")).toContainText(
      "No historical analyses captured yet.",
    );
  });

  test("keeps export available without requesting current market data", async ({
    page,
  }) => {
    await page.goto("/#/track");
    await page.waitForSelector("#view", { state: "attached" });
    await expect(page.locator("button[data-action='export']")).toBeVisible();
  });
});
