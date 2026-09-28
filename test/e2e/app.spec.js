const { test, expect } = require("@playwright/test");

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

  test("should not expose CSP violations during bootstrap", async ({ page }) => {
    const cspConsoleErrors = [];

    // Register a securitypolicyviolation listener before any page
    // script runs. This catches violations from the very first load,
    // including ones that never surface as console errors.
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
      if (CSP_VIOLATION_RE.test(err.message)) {
        cspConsoleErrors.push(err.message);
      }
    });

    await page.goto("/");

    // Wait for the app shell to be visible. Do NOT use networkidle:
    // the app polls for alerts, market data, and news, so the
    // network never goes idle. Playwright marks networkidle as
    // discouraged for exactly this reason.
    await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });

    // Give deferred work a window to run — dynamic imports, module
    // bootstrap continuations, short setTimeout chains. Any CSP
    // violation from that work fires inside this window.
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

    expect(browserViolations, "securitypolicyviolation events").toHaveLength(0);
    expect(cspConsoleErrors, "console CSP errors").toHaveLength(0);
  });
});
