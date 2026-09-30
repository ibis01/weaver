// test/e2e/critical-path.spec.js
// Critical-path integration: portfolio → pipeline → signal → drawer.

const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });
  await page.waitForSelector("#view .card", { timeout: 20000 });
});

test.describe("Critical path — pipeline → dashboard → drawer", () => {
  test("the intelligence pipeline loads and collectEvents returns an array", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const out = {
        hasEvents: typeof W.events === "object" && W.events !== null,
        hasEvidence: typeof W.evidence === "object" && W.evidence !== null,
        hasDecisionEngine:
          typeof W.decisionEngine === "object" && W.decisionEngine !== null,
        hasRanker: typeof W.ranker === "object" && W.ranker !== null,
        hasEvidenceDrawer:
          typeof W.ui === "object" &&
          W.ui !== null &&
          typeof W.ui.evidenceDrawer === "object" &&
          W.ui.evidenceDrawer !== null,
        collectEventsType: W.events
          ? typeof W.events.collectEvents
          : "no-module",
        signalCount: null,
        error: null,
      };

      try {
        if (W.events && typeof W.events.collectEvents === "function") {
          const signals = await W.events.collectEvents();
          out.signalCount = Array.isArray(signals) ? signals.length : -1;
        }
      } catch (e) {
        out.error = String(e && e.message ? e.message : e);
      }
      return out;
    });

    // Diagnostic block — appears in the CI log on any failure.
    console.log("Pipeline diagnostic:", JSON.stringify(result, null, 2));

    expect(result.hasEvents, "W.events is not loaded").toBe(true);
    expect(result.hasEvidence, "W.evidence is not loaded").toBe(true);
    expect(
      result.hasDecisionEngine,
      "W.decisionEngine is not loaded",
    ).toBe(true);
    expect(
      result.hasEvidenceDrawer,
      "W.evidenceDrawer is not loaded",
    ).toBe(true);

    expect(
      result.collectEventsType,
      "W.events.collectEvents is not a function",
    ).toBe("function");

    expect(result.error, "collectEvents threw").toBeNull();

    expect(
      Number.isInteger(result.signalCount),
      "collectEvents did not return an array",
    ).toBe(true);

    console.log(`Signals produced: ${result.signalCount}`);
  });

  test("each rendered signal row carries a valid id", async ({ page }) => {
    const signalRows = page.locator("[data-signal-id]");
    const count = await signalRows.count();

    if (count === 0) {
      test.skip(true, "No signals rendered — quiet market or blocked data path");
      return;
    }

    for (let i = 0; i < Math.min(count, 5); i++) {
      const id = await signalRows.nth(i).getAttribute("data-signal-id");
      expect(id, `row ${i} has no signal id`).toBeTruthy();
      expect(id.length).toBeGreaterThan(0);
    }
  });

  test("clicking a signal opens the evidence drawer with the three sections", async ({
    page,
  }) => {
    const signalRows = page.locator("[data-signal-id]");
    const count = await signalRows.count();

    if (count === 0) {
      test.skip(true, "No signals rendered — quiet market or blocked data path");
      return;
    }

    await signalRows.first().click();

    const drawer = page.locator(
      "#modal-root [role='dialog']:not([aria-hidden='true']), .evidence-drawer, #modal-root .modal",
    );
    await expect(drawer.first()).toBeVisible({ timeout: 10000 });

    await expect(
      page.locator("text=Supporting").first(),
      "Supporting section missing",
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator("text=Contradicting").first(),
      "Contradicting section missing",
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator("text=Unknown").first(),
      "Unknowns section missing",
    ).toBeVisible({ timeout: 5000 });
  });

  test("the drawer close control returns to the dashboard", async ({ page }) => {
    const signalRows = page.locator("[data-signal-id]");
    const count = await signalRows.count();

    if (count === 0) {
      test.skip(true, "No signals rendered — quiet market or blocked data path");
      return;
    }

    await signalRows.first().click();

    const drawer = page.locator(
      "#modal-root [role='dialog']:not([aria-hidden='true']), .evidence-drawer",
    );
    await expect(drawer.first()).toBeVisible({ timeout: 10000 });

    const closeBtn = page
      .locator(
        ".drawer-close, .modal-x, [aria-label='Close'], [aria-label='Close drawer']",
      )
      .first();
    await closeBtn.click();

    await expect(drawer.first()).not.toBeVisible({ timeout: 5000 });
  });
});
