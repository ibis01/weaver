// scripts/capture-ui-baseline.js
// Captures every primary route at three viewports for UI-001 baseline.
// Run with: node scripts/capture-ui-baseline.js
// Requires the local server on http://127.0.0.1:5500

import { chromium } from "playwright";
import { mkdir } from "fs/promises";

const BASE = "http://127.0.0.1:5500";
const OUT = "docs/ui-baseline";

const ROUTES = [
  ["dashboard", "#/dashboard"],
  ["portfolio", "#/portfolio"],
  ["watchlist", "#/watchlist"],
  ["discover", "#/gems"],
  ["shield", "#/shield"],
  ["track-record", "#/track"],
  ["settings", "#/settings"],
  ["token-analysis", "#/token/BTC"],
  ["ai-insights", "#/ai"],
  ["alerts", "#/alerts"],
  ["explorer", "#/explorer"],
];

const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900 }],
  ["tablet-768", { width: 768, height: 1024 }],
  ["mobile-390", { width: 390, height: 844 }],
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const [name, size] of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: size,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    for (const [routeName, hash] of ROUTES) {
      const url = `${BASE}/${hash}`;
      process.stdout.write(`  ${name} → ${routeName} ... `);
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        // Small settle for async renders
        // Wait for the market table to finish rendering, then a short
        // settle for the sparkline canvas draws. On some viewports the
        // fetch + render sequence takes longer than the previous 800ms
        // fixed wait.
        await page
          .waitForFunction(
            () => {
              const rows = document.querySelector("#d-rows");
              if (!rows) return true; // route doesn't have a market table
              const text = rows.textContent || "";
              return (
                !text.includes("Loading") &&
                !text.includes("No data available") &&
                text.trim().length > 20
              );
            },
            { timeout: 8000 },
          )
          .catch(() => {}); // non-blocking; screenshot anyway if it times out

        await page.waitForTimeout(400); // settle for canvas sparklines
        await page.screenshot({
          path: `${OUT}/${name}--${routeName}.png`,
          fullPage: true,
        });
        console.log("ok");
      } catch (err) {
        console.log(`FAIL (${err.message.split("\n")[0]})`);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nBaseline written to ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
