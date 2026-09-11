# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: weaver.spec.js >> Weaver E2E >> should log a decision and show replay badge
- Location: test/e2e/weaver.spec.js:41:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('[data-decision-id]') to be visible
    14 × locator resolved to hidden <span class="replay-container" data-decision-id="mtxh83vel8mxw"></span>

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - navigation "Main navigation" [ref=e3]:
      - generic [ref=e4]:
        - img "Weaver logo" [ref=e5]
        - generic [ref=e6]: Weaver
      - menubar [ref=e7]:
        - generic [ref=e8]: PRIMARY
        - link "📊 Dashboard" [ref=e9] [cursor=pointer]:
          - /url: "#/dashboard"
          - generic [ref=e10]: 📊
          - generic [ref=e11]: Dashboard
        - link "🔍 Discover" [ref=e12] [cursor=pointer]:
          - /url: "#/explorer"
          - generic [ref=e13]: 🔍
          - generic [ref=e14]: Discover
        - link "📈 Analyze" [ref=e15] [cursor=pointer]:
          - /url: "#/token"
          - generic [ref=e16]: 📈
          - generic [ref=e17]: Analyze
        - link "💼 Portfolio" [ref=e18] [cursor=pointer]:
          - /url: "#/portfolio"
          - generic [ref=e19]: 💼
          - generic [ref=e20]: Portfolio
        - generic [ref=e21]: MONITOR
        - link "⭐ Watchlist" [ref=e22] [cursor=pointer]:
          - /url: "#/watchlist"
          - generic [ref=e23]: ⭐
          - generic [ref=e24]: Watchlist
        - link "🚨 Alerts" [ref=e25] [cursor=pointer]:
          - /url: "#/alerts"
          - generic [ref=e26]: 🚨
          - generic [ref=e27]: Alerts
        - link "📡 Signals" [ref=e28] [cursor=pointer]:
          - /url: "#/market"
          - generic [ref=e29]: 📡
          - generic [ref=e30]: Signals
        - generic [ref=e31]: INTELLIGENCE
        - link "📰 News" [ref=e32] [cursor=pointer]:
          - /url: "#/news"
          - generic [ref=e33]: 📰
          - generic [ref=e34]: News
        - link "🐋 Whale Tracker" [ref=e35] [cursor=pointer]:
          - /url: "#/whales"
          - generic [ref=e36]: 🐋
          - generic [ref=e37]: Whale Tracker
        - link "🧠 Smart Money" [ref=e38] [cursor=pointer]:
          - /url: "#/smart"
          - generic [ref=e39]: 🧠
          - generic [ref=e40]: Smart Money
        - link "🎯 Theses" [ref=e41] [cursor=pointer]:
          - /url: "#/theses"
          - generic [ref=e42]: 🎯
          - generic [ref=e43]: Theses
        - link "📓 Journal" [ref=e44] [cursor=pointer]:
          - /url: "#/journal"
          - generic [ref=e45]: 📓
          - generic [ref=e46]: Journal
        - generic [ref=e47]: TOOLS
        - link "🛡️ Token Shield" [ref=e48] [cursor=pointer]:
          - /url: "#/shield"
          - generic [ref=e49]: 🛡️
          - generic [ref=e50]: Token Shield
        - link "🧮 Optimizer" [ref=e51] [cursor=pointer]:
          - /url: "#/optimizer"
          - generic [ref=e52]: 🧮
          - generic [ref=e53]: Optimizer
        - link "🔓 Token Unlocks" [ref=e54] [cursor=pointer]:
          - /url: "#/unlocks"
          - generic [ref=e55]: 🔓
          - generic [ref=e56]: Token Unlocks
        - link "🧠 AI Insights" [ref=e57] [cursor=pointer]:
          - /url: "#/ai"
          - generic [ref=e58]: 🧠
          - generic [ref=e59]: AI Insights
        - link "⚙️ Settings" [ref=e60] [cursor=pointer]:
          - /url: "#/settings"
          - generic [ref=e61]: ⚙️
          - generic [ref=e62]: Settings
    - main [ref=e63]:
      - banner [ref=e64]:
        - heading "Journal" [level=1] [ref=e65]
        - generic [ref=e66]:
          - generic [ref=e67]: 10:36:57 PM
          - combobox "Select currency" [ref=e68]:
            - option "USD" [selected]
            - option "NGN"
            - option "EUR"
            - option "GBP"
            - option "INR"
            - option "JPY"
            - option "AUD"
            - option "CAD"
          - button "Sync your encrypted vault" [ref=e69] [cursor=pointer]: 🔄
      - main [ref=e70]:
        - generic [ref=e71]:
          - heading "📓 Decision Journal" [level=3] [ref=e72]
          - paragraph [ref=e73]: Record WHY you are making a trade. A transaction records WHAT happened; this records WHY.
          - button "+ Log Decision" [ref=e74] [cursor=pointer]
        - generic [ref=e76]:
          - generic [ref=e77]:
            - generic [ref=e78]: BUY BTC @ $60000.00
            - generic [ref=e79]: just now
          - paragraph [ref=e80]: "Reasoning: E2E test decision"
          - generic [ref=e81]:
            - generic [ref=e82]: "Confidence: not stated"
            - generic [ref=e83]: "Horizon: Short-term"
          - button "Delete" [ref=e85] [cursor=pointer]
  - alert
```

# Test source

```ts
  1  | // test/e2e/weaver.spec.js
  2  | const { test, expect } = require("@playwright/test");
  3  | 
  4  | test.describe("Weaver E2E", () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await page.goto("/");
  7  |     await page.waitForSelector("#view", { state: "attached" });
  8  |     // Wait for dashboard to finish loading (either live or snapshot fallback)
  9  |     await page.waitForFunction(
  10 |       () => {
  11 |         const view = document.querySelector("#view");
  12 |         return view && view.querySelector(".cards, .stat-label, .card");
  13 |       },
  14 |       { timeout: 20000 },
  15 |     );
  16 |   });
  17 | 
  18 |   test("should load dashboard", async ({ page }) => {
  19 |     await expect(page.locator("#page-title")).toHaveText("Dashboard");
  20 |     // Dashboard should render something – either stats or a fallback card
  21 |     const cards = page.locator(".card");
  22 |     await expect(cards.first()).toBeVisible({ timeout: 15000 });
  23 |   });
  24 | 
  25 |   test("should add a holding and verify weighted-average UI", async ({
  26 |     page,
  27 |   }) => {
  28 |     // Click "+ Add" button on dashboard
  29 |     const addBtn = page.locator('button:has-text("+ Add")').first();
  30 |     await addBtn.click({ timeout: 10000 });
  31 | 
  32 |     // The picker / form should appear
  33 |     await page.waitForSelector("#h-form, .modal", { timeout: 10000 });
  34 | 
  35 |     // Since we simplified the flow, we can't easily complete it without a coin picker.
  36 |     // Just verify the modal opened.
  37 |     const modal = page.locator(".modal");
  38 |     await expect(modal).toBeVisible();
  39 |   });
  40 | 
  41 |   test("should log a decision and show replay badge", async ({ page }) => {
  42 |     // Navigate to Journal
  43 |     await page.goto("/#/journal");
  44 |     await page.waitForSelector("#view");
  45 | 
  46 |     // Click "+ Log Decision"
  47 |     const btn = page
  48 |       .locator(
  49 |         'button:has-text("Log Decision"), button:has-text("+ Log Decision")',
  50 |       )
  51 |       .first();
  52 |     if (await btn.count()) {
  53 |       await btn.click();
  54 |       await page.waitForSelector("#decision-form-container:not(.hidden)", {
  55 |         timeout: 5000,
  56 |       });
  57 | 
  58 |       // Fill the form
  59 |       await page.fill("#d-asset", "BTC");
  60 |       await page.fill("#d-price", "60000");
  61 |       await page.fill("#d-reasoning", "E2E test decision");
  62 |       await page.click('button:has-text("Save Decision")');
  63 | 
  64 |       // Wait for the decision card to appear
> 65 |       await page.waitForSelector("[data-decision-id]", { timeout: 5000 });
     |                  ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  66 |     }
  67 | 
  68 |     // If no decisions exist yet, this test can be skipped gracefully
  69 |     const decisionCards = page.locator("[data-decision-id]");
  70 |     if ((await decisionCards.count()) > 0) {
  71 |       await expect(decisionCards.first()).toBeVisible();
  72 |     }
  73 |   });
  74 | });
  75 | 
```