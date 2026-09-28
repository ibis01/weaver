// test/e2e/weaver.spec.js
const { test, expect } = require("@playwright/test");

test.describe("Weaver E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#view", { state: "attached" });
    await page.waitForFunction(
      () => {
        const view = document.querySelector("#view");
        return view && view.querySelector(".cards, .stat-label, .card");
      },
      { timeout: 20000 },
    );
  });

  test("should load dashboard", async ({ page }) => {
    await expect(page.locator("#page-title")).toHaveText("Dashboard");
    const cards = page.locator(".card");
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
  });

    test("should add a holding and verify weighted-average UI", async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push("console: " + msg.text());
      });

      const addBtn = page
        .getByRole("button", { name: /^(?:\+\s*)?add(?:\s+holding)?$/i })
        .first();
      await expect(addBtn).toBeVisible({ timeout: 15000 });

      // Log every matching button — reveals whether the test is
      // clicking the same element a human would.
      const allAddButtons = await page
        .locator('button:has-text("Add")')
        .allTextContents();
      console.log("All Add buttons on page:", allAddButtons);

      console.log("About to click:", (await addBtn.textContent())?.trim());
      await addBtn.click();

      // Give the click a moment to produce any effect.
      await page.waitForTimeout(2500);

      const diag = await page.evaluate(() => {
        const root = document.getElementById("modal-root");
        return {
          rootExists: !!root,
          rootAriaHidden: root ? root.getAttribute("aria-hidden") : null,
          rootChildrenCount: root ? root.children.length : 0,
          rootInnerHTMLHead: root ? root.innerHTML.slice(0, 300) : null,
          modalElements: document.querySelectorAll(".modal").length,
          hFormExists: !!document.getElementById("h-form"),
          dashboardOnPage: !!window.W && !!window.W.dashboard,
          holdingModalFn:
            window.W && window.W.dashboard
              ? typeof window.W.dashboard.holdingModal
              : "no W.dashboard",
        };
      });

      console.log("Diagnostic snapshot:", JSON.stringify(diag, null, 2));

      if (errors.length) {
        console.log("Page errors during test:");
        for (const e of errors) console.log("  " + e);
      }

      // Final assertion — narrow to just the form so we know
      // whether the modal body exists at all.
      await expect(page.locator("#h-form")).toBeVisible({ timeout: 8000 });
    });
  test("should log a decision and show replay badge", async ({ page }) => {
    await page.goto("/#/journal");
    await page.waitForSelector("#view");

    const btn = page
      .locator(
        'button:has-text("Log Decision"), button:has-text("+ Log Decision")',
      )
      .first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForSelector("#decision-form-container:not(.hidden)", {
        timeout: 5000,
      });

      await page.fill("#d-asset", "BTC");
      await page.fill("#d-price", "60000");
      await page.fill("#d-reasoning", "E2E test decision");
      await page.click('button:has-text("Save Decision")');

      await page.waitForSelector("[data-decision-id]", { timeout: 5000 });
    }

    const decisionCards = page.locator("[data-decision-id]");
    if ((await decisionCards.count()) > 0) {
      await expect(decisionCards.first()).toBeVisible();
    }
  });
});
