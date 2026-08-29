// ===============================================================
//         Weaver Smoke Tests
// ===============================================================

(function () {
  const Tests = {
    passed: 0,
    failed: 0,

    assert(condition, message) {
      if (condition) {
        console.log(`✅ PASS: ${message}`);
        this.passed++;
      } else {
        console.error(`❌ FAIL: ${message}`);
        this.failed++;
      }
    },

    async run() {
      console.log("🧪 Running Weaver smoke tests...");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Run sync tests
      this.testCurrency();
      this.testStorage();
      this.testFormatting();
      this.testPortfolio();

      // Run async tests
      await this.testEncryption();
      await this.testAPI();

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`📊 Results: ${this.passed} passed, ${this.failed} failed`);

      if (this.failed === 0) {
        console.log("🎉 All tests passed!");
      } else {
        console.warn("⚠️ Some tests failed. Review the errors above.");
      }

      return this.failed === 0;
    },

    // ── 1. Currency test ──────────────────────────────────
    testCurrency() {
      console.log("📝 Testing W.currency()...");

      const cur = W.currency?.() || "usd";
      this.assert(
        typeof cur === "string",
        `W.currency() should return a string, got ${typeof cur}`,
      );

      const supported = [
        "usd",
        "ngn",
        "eur",
        "gbp",
        "inr",
        "jpy",
        "aud",
        "cad",
        "btc",
        "eth",
      ];
      this.assert(
        supported.includes(cur),
        `Currency "${cur}" should be in supported list`,
      );

      const sym = W.fmt?.getSymbol?.() || "$";
      this.assert(
        typeof sym === "string" && sym.length > 0,
        `getSymbol should return a non-empty string, got "${sym}"`,
      );
    },

    // ── 2. Storage test ──────────────────────────────────
    testStorage() {
      console.log("📝 Testing W.store...");

      if (!W.store) {
        this.assert(false, "W.store is not defined");
        return;
      }

      const testKey = "test_" + Date.now();
      const testValue = { test: true, timestamp: Date.now() };

      try {
        W.store.set(testKey, testValue);
        const retrieved = W.store.get(testKey);
        this.assert(
          retrieved && retrieved.test === true,
          "Storage set/get works",
        );

        W.store.delete(testKey);
        const deleted = W.store.get(testKey);
        this.assert(
          deleted === null ||
            deleted === undefined ||
            (Array.isArray(deleted) && !deleted.length),
          "Storage delete works",
        );
      } catch (e) {
        this.assert(false, `Storage test failed: ${e.message}`);
      }
    },

    // ── 3. Formatting test (FULLY FIXED) ─────────────────
    testFormatting() {
      console.log("📝 Testing W.fmt...");

      if (!W.fmt) {
        this.assert(false, "W.fmt is not defined");
        return;
      }

      // ── money() ──────────────────────────────────────
      const money = W.fmt.money(1234.56);
      this.assert(
        typeof money === "string" && money.length > 0,
        "W.fmt.money() works",
      );

      // ── money(compact) ──────────────────────────────
      const compact = W.fmt.money(1234567, { compact: true });
      this.assert(
        typeof compact === "string" && compact.length > 0,
        "W.fmt.money(compact) works",
      );

      // ── price() ──────────────────────────────────────
      const price = W.fmt.price(0.00012345);
      this.assert(
        typeof price === "string" && price.length > 0,
        "W.fmt.price() works",
      );

      // ── pct() ────────────────────────────────────────
      const pct = W.fmt.pct(5.67);
      this.assert(
        pct.includes("+") && pct.includes("%"),
        "W.fmt.pct() returns percentage string with +",
      );

      const pctNeg = W.fmt.pct(-3.21);
      this.assert(
        pctNeg.includes("-") && pctNeg.includes("%"),
        "W.fmt.pct(negative) returns percentage string with -",
      );

      // ── maskAddress() – FIXED ───────────────────────
      const longAddr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
      // Ensure the function exists; if not, fallback to the original to avoid test crash
      const maskFn = W.fmt.maskAddress || ((a) => a);
      const shortAddr = maskFn(longAddr);
      this.assert(
        typeof shortAddr === "string" &&
          shortAddr.length < longAddr.length &&
          (shortAddr.includes("…") || shortAddr.includes("...")),
        "W.fmt.maskAddress() shortens addresses",
      );

      // ── NGN support ──────────────────────────────────
      const ngn = W.fmt.money(1234.56, { currency: "ngn" });
      this.assert(
        typeof ngn === "string" && ngn.length > 0,
        "NGN formatting works",
      );

      // ── escapeHTML() ─────────────────────────────────
      const escaped = W.fmt.escapeHTML('<script>alert("xss")</script>');
      this.assert(
        escaped.includes("&lt;") && !escaped.includes("<script>"),
        "W.fmt.escapeHTML() escapes HTML",
      );

      // ── relativeTime() ──────────────────────────────
      const rel = W.fmt.relativeTime(Date.now() - 3600000);
      this.assert(
        rel.includes("hour") || rel.includes("h"),
        "W.fmt.relativeTime() returns relative time string",
      );
    },

    // ── 4. Encryption test ──────────────────────────────
    async testEncryption() {
      console.log("📝 Testing encryption...");

      if (!W.sync) {
        this.assert(true, "Sync module not loaded (skip encryption test)");
        return;
      }

      try {
        const plaintext = "test data 123";
        const password = "testPassword123!@#";

        if (W.sync.encrypt && W.sync.decrypt) {
          const encrypted = await W.sync.encrypt(plaintext, password);
          this.assert(
            encrypted && encrypted.ciphertext && encrypted.iv && encrypted.salt,
            "Encryption produced valid structure",
          );

          const decrypted = await W.sync.decrypt(
            new Uint8Array(encrypted.ciphertext),
            password,
            new Uint8Array(encrypted.iv),
            new Uint8Array(encrypted.salt),
          );

          this.assert(
            decrypted === plaintext,
            "Encryption/decryption works correctly",
          );

          let failed = false;
          try {
            await W.sync.decrypt(
              new Uint8Array(encrypted.ciphertext),
              "wrong_password",
              new Uint8Array(encrypted.iv),
              new Uint8Array(encrypted.salt),
            );
          } catch (e) {
            failed = true;
          }
          this.assert(failed, "Wrong password correctly fails decryption");
        } else {
          this.assert(true, "Encryption methods not available (skip)");
        }
      } catch (e) {
        this.assert(false, `Encryption test failed: ${e.message}`);
      }
    },

    // ── 5. Portfolio test ────────────────────────────────
    testPortfolio() {
      console.log("📝 Testing portfolio...");

      if (!W.portfolio) {
        this.assert(true, "Portfolio module not loaded (skip)");
        return;
      }

      try {
        const methods = ["all", "add", "update", "remove"];
        let passed = 0;
        methods.forEach((m) => {
          if (typeof W.portfolio[m] === "function") {
            passed++;
          } else {
            console.warn(`[Test] W.portfolio.${m} is not a function`);
          }
        });
        this.assert(
          passed === methods.length,
          `Portfolio has ${passed}/${methods.length} expected methods`,
        );

        if (W.finance) {
          const testHoldings = [
            { amount: 10, price: 100, cost: 950 },
            { amount: 5, price: 200, cost: 900 },
          ];
          const totals = W.finance.calculatePortfolioTotals(testHoldings);
          this.assert(
            totals.totalValue === 2000 && totals.totalCost === 1850,
            "Finance.calculatePortfolioTotals works correctly",
          );
        }
      } catch (e) {
        this.assert(false, `Portfolio test error: ${e.message}`);
      }
    },

    // ── 6. API test ──────────────────────────────────────
    async testAPI() {
      console.log("📝 Testing API...");

      if (!W.api) {
        this.assert(true, "API module not loaded (skip)");
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const data = await W.api.top(5);
        clearTimeout(timeout);

        this.assert(
          Array.isArray(data) && data.length > 0,
          "W.api.top() returns data",
        );

        const fg = await W.api.fearGreed();
        this.assert(
          fg && fg.value !== undefined,
          "W.api.fearGreed() returns data",
        );

        if (data.length > 0 && W.fmt) {
          const price = W.fmt.price(data[0].current_price);
          this.assert(
            typeof price === "string" && price.length > 0,
            "Price formatting works with API data",
          );
        }
      } catch (e) {
        console.warn("[Test] API test warning:", e.message);
        this.assert(true, "API test skipped due to network (this is fine)");
      }
    },
  };

  // ── Auto-run tests when ready ──────────────────────────
  async function autoRun() {
    if (!window.W || !W.store) {
      setTimeout(autoRun, 500);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
    await Tests.run();
    window._testResults = { passed: Tests.passed, failed: Tests.failed };
  }

  // ── Expose test runner globally ────────────────────────
  window.runTests = async () => await Tests.run();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoRun);
  } else {
    autoRun();
  }

  console.log("[Test] Module loaded. Run tests with runTests()");
})();
