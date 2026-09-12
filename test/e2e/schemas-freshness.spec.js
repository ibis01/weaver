const { test, expect } = require("@playwright/test");

test.describe("Runtime schemas and data freshness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() =>
      Boolean(
        window.W?.schemas &&
        window.W?.dataHealth &&
        window.W?.ui?.renderDataStatus,
      ),
    );
  });

  test("rejects malformed external responses in the browser", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      try {
        window.W.schemas.validate("markets", [
          { id: "btc", symbol: "btc", current_price: "not-a-number" },
        ]);
        return { rejected: false };
      } catch (error) {
        return { rejected: true, name: error.name, schema: error.schema };
      }
    });
    expect(result.rejected).toBe(true);
    expect(result.name).toBe("SchemaValidationError");
    expect(result.schema).toBe("CoinGecko markets[0]");
  });

  test("renders a fresh data indicator with source and age", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "schema-freshness-test-host";
      document.body.appendChild(host);
      window.W.dataHealth.mark("markets", {
        source: "test-provider",
        observedAt: Date.now(),
        staleAfter: 60000,
      });
      window.W.ui.renderDataStatus(host, ["markets"]);
    });
    const status = page.locator("#schema-freshness-test-host .data-status");
    await expect(status).toContainText("Data freshness");
    await expect(status).toContainText("test-provider");
    await expect(status).toContainText("just now");
  });

  test("renders a warning when a data source is stale", async ({ page }) => {
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "schema-stale-test-host";
      document.body.appendChild(host);
      window.W.dataHealth.mark("markets", {
        source: "local-cache",
        observedAt: Date.now() - 3600000,
        staleAfter: 60000,
      });
      window.W.ui.renderDataStatus(host, ["markets"]);
    });
    const status = page.locator("#schema-stale-test-host .data-status");
    await expect(status).toHaveClass(/data-status-stale/);
    await expect(status).toContainText("Data may be stale");
    await expect(status).toContainText("1h old");
    await expect(status).toContainText("Verify important decisions");
  });
});
