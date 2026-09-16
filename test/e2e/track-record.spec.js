const { test, expect } = require("@playwright/test");

test.describe("Track Record E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#view", { state: "attached", timeout: 15000 });
    await page.waitForFunction(
      () => {
        const view = document.querySelector("#view");
        return view && view.children.length > 0;
      },
      null,
      { timeout: 20000 },
    );
  });

  test("route #/track renders the Track Record view", async ({ page }) => {
    await page.evaluate(() => {
      location.hash = "#/track";
    });
    await page.waitForFunction(
      () => {
        const title = document.getElementById("page-title");
        return title && title.textContent === "Track Record";
      },
      null,
      { timeout: 5000 },
    );
    await expect(page.locator("#page-title")).toHaveText("Track Record");
  });

  test("sidebar Track Record link is wired to #/track", async ({ page }) => {
    const nav = page.locator('#nav a[data-id="track"]');
    await expect(nav).toBeVisible({ timeout: 5000 });
    await expect(nav).toHaveAttribute("href", "#/track");
    await expect(nav).toContainText("Track Record");
  });

  test("renders a record that was written to storage", async ({ page }) => {
    await page.evaluate(() => {
      W.store.set("track_record", []);
      W.trackRecord.createFromAnalysis(
        {
          asset: "BTC",
          opportunityScore: 72,
          confidence: 0.78,
          scoringVersion: "test-vs-1",
          methodologyVersion: "test-vm-1",
        },
        { symbol: "BTC", name: "Bitcoin" },
      );
    });

    await page.goto("/#/track");
    await page.waitForSelector("#tr-list", { timeout: 10000 });

    const cards = page.locator("#tr-list .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    await expect(cards.first()).toContainText("BTC");
  });
});
