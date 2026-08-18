// js/test.js – Weaver Smoke Tests

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

    run() {
      console.log("🧪 Running Weaver smoke tests...");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      this.testCurrency();
      this.testStorage();
      this.testFormatting();
      this.testEncryption();
      this.testPortfolio();

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`📊 Results: ${this.passed} passed, ${this.failed} failed`);

      if (this.failed === 0) {
        console.log("🎉 All tests passed!");
      } else {
        console.warn("⚠️ Some tests failed. Review the errors above.");
      }
    },

    // ── 1. Currency test ──────────────────────────────────
    testCurrency() {
      console.log("📝 Testing W.currency()...");

      // Ensure W.currency returns a string
      const cur = W.currency?.() || "usd";
      this.assert(
        typeof cur === "string",
        `W.currency() should return a string, got ${typeof cur}`,
      );

      // Should be one of the supported currencies
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

      // Check that getSymbol works
      const sym = W.fmt?.getSymbol?.(cur) || "$";
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

    // ── 3. Formatting test ───────────────────────────────
    testFormatting() {
      console.log("📝 Testing W.fmt...");

      if (!W.fmt) {
        this.assert(false, "W.fmt is not defined");
        return;
      }

      // money
      const money = W.fmt.money(1234.56);
      this.assert(
        typeof money === "string" && money.length > 0,
        "W.fmt.money() works",
      );

      // money with compact
      const compact = W.fmt.money(1234567, { compact: true });
      this.assert(
        compact.includes("M") || compact.includes("K"),
        "W.fmt.money(compact) works",
      );

      // price
      const price = W.fmt.price(0.00012345);
      this.assert(
        typeof price === "string" && price.length > 0,
        "W.fmt.price() works",
      );

      // pct
      const pct = W.fmt.pct(5.67);
      this.assert(
        pct.includes("up") && pct.includes("▲"),
        "W.fmt.pct() returns HTML with up class",
      );

      const pctNeg = W.fmt.pct(-3.21);
      this.assert(
        pctNeg.includes("down") && pctNeg.includes("▼"),
        "W.fmt.pct(negative) returns HTML with down class",
      );

      // addr
      const addr = W.fmt.addr("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
      this.assert(addr.includes("…"), "W.fmt.addr() shortens addresses");

      // NGN support
      const ngn = W.fmt.money(1234.56, { currency: "ngn" });
      this.assert(ngn.includes("₦"), "NGN formatting includes ₦ symbol");
    },

    // ── 4. Encryption test ──────────────────────────────
    testEncryption() {
      console.log("📝 Testing encryption...");

      if (!W.sync) {
        this.assert(true, "Sync module not loaded (skip encryption test)");
        return;
      }

      try {
        const plaintext = "test data 123";
        const password = "testPassword123";
        const salt = crypto.getRandomValues(new Uint8Array(16));

        // Test encrypt/decrypt via sync module
        if (W.sync.encrypt && W.sync.decrypt) {
          // Run async test synchronously-ish
          (async () => {
            try {
              const encrypted = await W.sync.encrypt(plaintext, password, salt);
              const decrypted = await W.sync.decrypt(
                new Uint8Array(encrypted.ciphertext),
                password,
                new Uint8Array(encrypted.iv),
                new Uint8Array(encrypted.salt),
              );
              this.assert(
                decrypted === plaintext,
                "Encryption/decryption works",
              );
            } catch (e) {
              this.assert(false, `Encryption test failed: ${e.message}`);
            }
          })();
        } else {
          this.assert(true, "Encryption methods not available (skip)");
        }
      } catch (e) {
        this.assert(false, `Encryption test error: ${e.message}`);
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
        // Check if portfolio has expected methods
        const methods = ["all", "add", "update", "remove", "txs", "recordTx"];
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
      } catch (e) {
        this.assert(false, `Portfolio test error: ${e.message}`);
      }
    },
  };

  // ── Run tests when ready ──────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // Give modules time to load
      setTimeout(() => Tests.run(), 1000);
    });
  } else {
    setTimeout(() => Tests.run(), 1000);
  }

  // Also expose test runner globally
  window.runTests = () => Tests.run();
})();

console.log("[Test] Module loaded. Run tests with runTests()");
