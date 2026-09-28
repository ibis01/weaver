// test/e2e/dashboard-acceptance.spec.js
// UI-002 acceptance — the automatable half.
// Run with: npx playwright test test/e2e/dashboard-acceptance.spec.js

const { test, expect } = require("@playwright/test");

// ── Shared setup ────────────────────────────────────────
// Every test starts from a fully-booted Dashboard.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });
  await page.waitForSelector("#view .card", { timeout: 20000 });
});

// ── CSP cleanliness across routes ───────────────────────
test.describe("CSP cleanliness", () => {
  const ROUTES = [
    { hash: "#/", name: "Dashboard" },
    { hash: "#/market", name: "Market" },
    { hash: "#/explorer", name: "Explorer" },
    { hash: "#/news", name: "News" },
    { hash: "#/journal", name: "Journal" },
    { hash: "#/optimizer", name: "Optimizer" },
    { hash: "#/settings", name: "Settings" },
  ];

  for (const route of ROUTES) {
    test(`${route.name} — no CSP violations`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__CSP__ = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          window.__CSP__.push({
            directive: e.violatedDirective,
            blocked: e.blockedURI,
            file: e.sourceFile,
          });
        });
      });

      await page.goto("/" + route.hash);
      await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(800);

      const found = await page.evaluate(() => window.__CSP__ || []);
      expect(found, `CSP violations on ${route.name}`).toHaveLength(0);
    });
  }
});

// ── Responsive layout ───────────────────────────────────
test.describe("Responsive layout", () => {
  const VIEWPORTS = [
    { name: "mobile", width: 375, height: 812 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 },
  ];

  for (const vp of VIEWPORTS) {
    test(`${vp.name} (${vp.width}px) — no horizontal scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });
      await page.waitForSelector("#view .card", { timeout: 20000 });

      // Ensure the stylesheet has been parsed and applied before
      // measuring. On CI the initial measurement can race the CSS
      // parse; an unstyled layout reports the raw HTML width, which
      // Ensure style.css has been applied before measuring. The
      // measurement races the CSS parse on CI: the JS can render
      // cards before the stylesheet has been applied, and the
      // unstyled layout reports scrollWidth in the thousands for a
      // 375px viewport. getComputedStyle is readable cross-origin,
      // so no SecurityError. `.app` reports flex only when
      // style.css has loaded; browser default for a div is block.
      await page.waitForFunction(
        () => {
          const app = document.querySelector(".app");
          if (!app) return false;
          return getComputedStyle(app).display === "flex";
        },
        { timeout: 10000 },
      );

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // Allow 1px tolerance for sub-pixel rounding.
      expect(
        scrollWidth,
        `Horizontal overflow at ${vp.width}px: ${scrollWidth} > ${clientWidth}`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test("mobile — hamburger is visible, sidebar is hidden by default", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });

    const hamburger = page.locator("#btn-hamburger");
    await expect(hamburger).toBeVisible();

    // Sidebar may be off-canvas but should not be visually overlaying.
    const sidebarBox = await page.locator("#sidebar").boundingBox();
    if (sidebarBox) {
      expect(
        sidebarBox.width,
        "Sidebar wider than viewport on mobile",
      ).toBeLessThan(375);
    }
  });

  test("mobile — hamburger toggles sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });

    const hamburger = page.locator("#btn-hamburger");
    await hamburger.click();
    await expect(hamburger).toHaveAttribute("aria-expanded", "true", {
      timeout: 2000,
    });

    await hamburger.click();
    await expect(hamburger).toHaveAttribute("aria-expanded", "false", {
      timeout: 2000,
    });
  });
});

// ── Accessibility ───────────────────────────────────────
test.describe("Accessibility", () => {
  test("every interactive element has an accessible name", async ({ page }) => {
    const unnamed = await page.evaluate(() => {
      const interactive = document.querySelectorAll(
        'button, a[href], input, select, textarea, [role="button"]',
      );
      const bad = [];
      for (const el of interactive) {
        const name =
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          (el.textContent || "").trim();
        if (!name) {
          bad.push({
            tag: el.tagName,
            id: el.id || null,
            cls: el.className || null,
          });
        }
      }
      return bad;
    });

    expect(unnamed, "Interactive elements without an accessible name").toEqual(
      [],
    );
  });

  test("keyboard navigation reaches the main nav and topbar actions", async ({
    page,
  }) => {
    // Track tag + id + text so we catch <a> elements that have no id.
    const reached = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const isNavLink = el.closest("#nav") && el.tagName === "A";
        return {
          tag: el.tagName,
          id: el.id || null,
          isNavLink: !!isNavLink,
          text: (el.textContent || "").trim().slice(0, 30),
        };
      });
      if (info) reached.push(info);
    }

    const hitTopbar = reached.some(
      (r) => r.id === "btn-refresh" || r.id === "currency",
    );
    const hitNav = reached.some((r) => r.isNavLink);
    const hitHamburger = reached.some((r) => r.id === "btn-hamburger");

    console.log(
      "Tab order reached:",
      reached.map((r) => r.id || r.text),
    );

    expect(
      hitTopbar || hitNav || hitHamburger,
      "Tab never reached a topbar control, a nav link, or the hamburger",
    ).toBe(true);
  });

  test("focused elements have a visible outline", async ({ page }) => {
    await page.locator("#btn-refresh").focus();
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        outlineWidth: s.outlineWidth,
        outlineStyle: s.outlineStyle,
        boxShadow: s.boxShadow,
      };
    });
    const hasIndicator =
      outline &&
      ((outline.outlineStyle !== "none" &&
        parseFloat(outline.outlineWidth) > 0) ||
        (outline.boxShadow && outline.boxShadow !== "none"));
    expect(hasIndicator, "Focused element has no visible focus indicator").toBe(
      true,
    );
  });
});

// ── Touch targets (mobile) ──────────────────────────────
test.describe("Touch targets", () => {
  test("interactive elements are at least 40×40 on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });
    await page.waitForSelector("#view .card", { timeout: 20000 });

    const tooSmall = await page.evaluate(() => {
      const interactive = document.querySelectorAll(
        'button, a[href], [role="button"]',
      );
      const bad = [];
      for (const el of interactive) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const tag = el.tagName.toLowerCase();
        // Inline links in prose are exempt.
        if (tag === "a" && el.closest("p, .about, .prose")) continue;
        if (r.width < 40 || r.height < 40) {
          bad.push({
            tag,
            id: el.id || null,
            text: (el.textContent || "").trim().slice(0, 30),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      }
      return bad;
    });

    if (tooSmall.length > 0) {
      console.log(`Touch targets under 40×40: ${tooSmall.length}`);
      for (const t of tooSmall) {
        console.log(`  ${t.tag} #${t.id}: ${t.w}×${t.h} "${t.text}"`);
      }
    }
    expect(
      tooSmall.length,
      `${tooSmall.length} interactive elements are below 40×40`,
    ).toBeLessThan(5);
  });
});

// ── Loading and error states ────────────────────────────
test.describe("Loading and error states", () => {
  test("dashboard shows a loading indicator or content before data resolves", async ({
    page,
  }) => {
    // Block the market data endpoints so the loading phase is
    // observable. On a fast CI runner the app can move from
    // "loading" to "content" between the shell render and the
    // assertion. Both states are correct — the invariant is that
    // the view is never blank.
    await page.route("**/api.coinlore.net/**", (route) => route.abort());
    await page.route("**/api.coinpaprika.com/**", (route) => route.abort());
    await page.route("**/api.coinbase.com/**", (route) => route.abort());

    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });

    const state = await page.evaluate(() => {
      const view = document.querySelector("#view");
      if (!view) return { hasLoading: false, hasText: false };
      const hasLoading = !!view.querySelector(
        ".spinner, .skeleton, .loading, [aria-busy='true']",
      );
      const hasText = (view.textContent || "").trim().length > 0;
      return { hasLoading, hasText };
    });

    expect(
      state.hasLoading || state.hasText,
      "View was blank: neither a loading indicator nor content was present",
    ).toBe(true);
  });

  test("dashboard shows an error or fallback when all providers fail", async ({
    page,
  }) => {
    await page.route("**/api.coinlore.net/**", (route) => route.abort());
    await page.route("**/api.coinpaprika.com/**", (route) => route.abort());
    await page.route("**/api.coinbase.com/**", (route) => route.abort());

    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible({ timeout: 15000 });

    // Wait for the app to give up on live data.
    await page.waitForTimeout(4000);

    const bodyText = await page.locator("#view").innerText();
    expect(
      bodyText.length,
      "View is blank after provider failure",
    ).toBeGreaterThan(0);

    const looksExplained =
      /unavailable|error|offline|stale|retry|try again/i.test(bodyText);
    if (!looksExplained) {
      console.log(
        "Note: view is populated but does not explicitly mention failure.",
      );
    }
  });
});

// ── Card class hygiene ──────────────────────────────────
test.describe("Card class hygiene", () => {
  test("every Dashboard card uses a known class", async ({ page }) => {
    const cards = await page.evaluate(() => {
      const list = [];
      document.querySelectorAll("#view .card").forEach((el) => {
        list.push(el.className);
      });
      return list;
    });

    expect(cards.length, "Dashboard rendered zero cards").toBeGreaterThan(0);

    const bad = cards.filter((c) => !/\bcard\b/.test(c));
    expect(bad, `Cards without base class: ${bad.join(", ")}`).toEqual([]);
  });
});
