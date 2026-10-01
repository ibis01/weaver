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

  beforeEach(() => {
    calls = [];
    originalFetch = global.fetch;
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
    global.fetch = originalFetch;
    if (typeof window !== "undefined") window.fetch = originalFetch;
  });

  const workerHitCount = () =>
    calls.filter((u) => u.includes("weaver-proxy.ibis01-weaver.workers.dev"))
      .length;

  it("routes api.coinpaprika.com direct — never hits the Worker", async () => {
    try {
      await W.api.coin("bitcoin");
    } catch (_) {
      /* response shape may fail validation; the routing is what matters */
    }
    expect(workerHitCount()).to.equal(0);
    expect(calls.some((u) => u.includes("api.coinpaprika.com"))).to.equal(true);
  });

  it("routes api.binance.com direct — never hits the Worker", async () => {
    try {
      await W.api.chart("bitcoin", 7);
    } catch (_) {
      /* same */
    }
    expect(workerHitCount()).to.equal(0);
    expect(calls.some((u) => u.includes("api.binance.com"))).to.equal(true);
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
