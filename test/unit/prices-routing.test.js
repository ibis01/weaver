const { expect } = require("chai");

require("../../js/utils/format.js");
require("../../js/api/request-guard.js");
require("../../js/api/schemas.js");
require("../../js/api/prices.js");

// fetchWithProxy is private. These tests exercise it through the public
// API and inspect which URLs actually hit the network. A stubbed
// window.fetch records every request the module makes, including ones
// routed through W.requestGuard (which delegates to window.fetch).

describe("Prices — direct-only routing", () => {
  let originalFetch;
  let calls;

  let originalGlobalFetch;
  let originalWindowFetch;
  let hadWindowFetch;

  beforeEach(() => {
    calls = [];
    // Clear any api_cache:* entries that earlier test files populated.
    // Without this, fetchWithProxy short-circuits on getCached() and
    // never reaches the spy, so the "Worker first" assertion fails.
    try {
      if (typeof localStorage !== "undefined") {
        Object.keys(localStorage)
          .filter((k) => k.indexOf("api_cache") === 0)
          .forEach((k) => localStorage.removeItem(k));
      }
    } catch (_) { /* ignore */ }
    // W.requestGuard is a module singleton whose buckets persist across
    // test files. Earlier tests (dashboard enrich, etc.) consume tokens
    // against the Worker origin; without a reset the coinlore assertion
    // fails intermittently in the full suite but passes in isolation.
    try {
      if (global.W && global.W.requestGuard && typeof global.W.requestGuard.reset === "function") {
        global.W.requestGuard.reset();
      }
    } catch (_) { /* ignore */ }
    // prices.js keeps its own module-level circuit breaker and
    // providerBlockedUntil map. Without a reset, earlier test files
    // can open the circuit for ~90s and every fetchWithProxy call
    // short-circuits before reaching the fetch spy.
    try {
      if (global.W?.api?._internal?.resetProviderBlocks) {
        global.W.api._internal.resetProviderBlocks();
      }
    } catch (_) { /* ignore */ }
    originalGlobalFetch = global.fetch;
    if (typeof window !== "undefined") {
      hadWindowFetch = "fetch" in window;
      originalWindowFetch = window.fetch;
    }
    const spy = async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [],
      };
    };
    global.fetch = spy;
    if (typeof window !== "undefined") window.fetch = spy;
  });

  afterEach(() => {
    if (originalGlobalFetch !== undefined) global.fetch = originalGlobalFetch;
    else delete global.fetch;
    if (typeof window !== "undefined") {
      if (hadWindowFetch) window.fetch = originalWindowFetch;
      else delete window.fetch;
    }
  });

  const workerHitCount = () =>
    calls.filter((u) => u.includes("weaver-proxy.ibis01-weaver.workers.dev"))
      .length;

  it("prefers direct for api.coinpaprika.com, Worker available as fallback", async () => {
    try {
      await W.api.coin("bitcoin");
    } catch (_) {
      /* response shape may fail validation; the routing is what matters */
    }
    // Direct was attempted and succeeded; Worker was not needed. The
    // route policy is "direct first" not "direct only" — the fallback
    // path is verified separately in the test below.
    expect(workerHitCount()).to.equal(0);
    const directIdx = calls.findIndex((u) => u.includes("api.coinpaprika.com"));
    expect(directIdx).to.be.greaterThan(-1);
  });

  it("prefers direct for api.binance.com, Worker available as fallback", async () => {
    try {
      await W.api.chart("bitcoin", 7);
    } catch (_) {
      /* chart walks the failover chain; the routing invariant below is
         what matters, not which provider ultimately returned data. */
    }
    const directIdx = calls.findIndex((u) => u.includes("api.binance.com"));
    expect(directIdx).to.be.greaterThan(-1);
    // If binance was ever attempted via the Worker relay, it must be after
    // the direct attempt. Other providers in the same chain (kraken,
    // coinbase, bybit) use Worker-first routing and will hit the Worker
    // regardless — the assertion must be scoped to binance's own URLs,
    // not to the total Worker hit count.
    const binanceWorkerIdx = calls.findIndex(
      (u) =>
        u.includes("weaver-proxy.ibis01-weaver.workers.dev") &&
        u.includes("api.binance.com"),
    );
    if (binanceWorkerIdx !== -1) {
      expect(binanceWorkerIdx).to.be.greaterThan(directIdx);
    }
  });

  it("falls back to Worker for api.binance.com when direct times out", async () => {
    // Replace the default always-success spy with one that fails every
    // direct attempt and succeeds only via the Worker relay. This
    // proves the fallback chain: direct → Worker → (stale cache).
    const fallbackSpy = async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("weaver-proxy.ibis01-weaver.workers.dev")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => [],
        };
      }
      // Simulate a connection-level failure, which surfaces as
      // `!response.ok` with status 0 in the fetch shim.
      return {
        ok: false,
        status: 0,
        headers: { get: () => null },
        json: async () => {
          throw new Error("net::ERR_TIMED_OUT");
        },
      };
    };
    global.fetch = fallbackSpy;
    if (typeof window !== "undefined") window.fetch = fallbackSpy;

    try {
      await W.api.chart("bitcoin", 7);
    } catch (_) {
      /* we only care which URLs were hit */
    }

    expect(workerHitCount()).to.be.greaterThan(0);
    // Both routes were attempted.
    expect(calls.some((u) => u.includes("api.binance.com"))).to.equal(true);
    // Direct was tried before Worker (the ordering guarantee).
    const directIdx = calls.findIndex((u) => u.includes("api.binance.com"));
    const workerIdx = calls.findIndex((u) =>
      u.includes("weaver-proxy.ibis01-weaver.workers.dev"),
    );
    expect(directIdx).to.be.greaterThan(-1);
    expect(workerIdx).to.be.greaterThan(directIdx);
  });

  it("routes api.coinlore.net through the Worker first", async () => {
    try {
      await W.api.markets(["bitcoin"]);
    } catch (_) {
      /* same */
    }
    expect(workerHitCount()).to.be.greaterThan(0);
  });

  describe("DIRECT_ONLY_DOMAINS membership", () => {
    const set = () => W.api._internal.DIRECT_ONLY_DOMAINS;

    it("contains exactly the intended hosts", () => {
      const s = set();
      expect(s).to.be.instanceOf(Set);
      expect([...s].sort()).to.deep.equal([
        "api.binance.com",
        "api.coinpaprika.com",
      ]);
    });

    it("does not match lookalike hostnames", () => {
      const s = set();
      expect(s.has("evil-api.coinpaprika.com")).to.equal(false);
      expect(s.has("api.coinpaprika.com.attacker.com")).to.equal(false);
      expect(s.has("coinpaprika.com")).to.equal(false);
      expect(s.has("binance.com")).to.equal(false);
      expect(s.has("api.binance.com.evil.com")).to.equal(false);
    });

    it("matches the exact hostname for a real URL", () => {
      const s = set();
      const h = new URL("https://api.coinpaprika.com/v1/coins/btc-bitcoin")
        .hostname;
      expect(h).to.equal("api.coinpaprika.com");
      expect(s.has(h)).to.equal(true);
    });

    it("case-normalizes through URL parsing, so mixed-case URLs still match", () => {
      const s = set();
      const h = new URL("https://API.CoinPaprika.com/v1/coins/btc-bitcoin")
        .hostname;
      expect(h).to.equal("api.coinpaprika.com");
      expect(s.has(h)).to.equal(true);
    });
  });
});
