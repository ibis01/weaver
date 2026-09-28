// tests/e2e/app.spec.js
// =============================================================
const { test, expect } = require("@playwright/test");

// Anchored on the language browsers actually use in violation
// messages. Chromium, Firefox, and WebKit all emit one of:
//   "Refused to load ... because it violates the following
//    Content Security Policy directive ..."
//   "... violates the following Content Security Policy ..."
// Neither phrase appears in informational "(CSP compliant)" logs.
const CSP_VIOLATION_RE =
  /Refused to .+? because it violates|violates the following Content Security Policy/i;

test.describe("Weaver App Smoke Tests (Constitutional Compliance)", () => {
  test("should load the application shell securely", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#view")).toBeVisible({ timeout: 15000 });
  });

  test("should render the Dashboard view by default", async ({ page }) => {
    await page.goto("/");

    const title = page.locator("#page-title");
    await expect(title).toContainText("Dashboard", { timeout: 15000 });
  });

  test("should not expose CSP violations during bootstrap", async ({
    page,
  }) => {
    const cspConsoleErrors = [];

    // Primary source: securitypolicyviolation events. Registered
    // before any page script runs so violations from the first load
    // are captured. These events carry structured metadata.
    await page.addInitScript(() => {
      window.__CSP_VIOLATIONS__ = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        window.__CSP_VIOLATIONS__.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          sourceFile: e.sourceFile,
          lineNumber: e.lineNumber,
          disposition: e.disposition,
        });
      });
    });

    page.on("console", (msg) => {
      const text = msg.text();
      if (CSP_VIOLATION_RE.test(text)) {
        cspConsoleErrors.push(text);
      }
    });

    page.on("pageerror", (err) => {
      const text = err && err.message ? err.message : "";
      if (CSP_VIOLATION_RE.test(text)) {
        cspConsoleErrors.push(text);
      }
    });

    await page.goto("/");

    // Readiness: the app shell is visible. No networkidle — the app
    // polls for alerts, market data, and news, so the network never
    // idles. Playwright explicitly discourages networkidle.
    await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });

    // Settle window: give deferred work a chance to run.
    await page.waitForTimeout(1500);

    const browserViolations = await page.evaluate(
      () => window.__CSP_VIOLATIONS__ || [],
    );

    if (browserViolations.length > 0) {
      console.error("CSP violations detected:");
      for (const v of browserViolations) {
        console.error(
          `  [${v.disposition}] ${v.violatedDirective} blocked ${v.blockedURI}` +
            (v.sourceFile ? ` at ${v.sourceFile}:${v.lineNumber}` : ""),
        );
      }
    }

    if (cspConsoleErrors.length > 0) {
      console.error("Console CSP violations detected:");
      for (const line of cspConsoleErrors) {
        console.error(`  ${line}`);
      }
    }

    expect(browserViolations, "securitypolicyviolation events").toHaveLength(0);
    expect(cspConsoleErrors, "console CSP errors").toHaveLength(0);
  });
});
