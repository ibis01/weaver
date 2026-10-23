// test/unit/gems-persist.test.js
//
// Phase 4 — persistence gate.
// Persistence is an observation record for cohort comparison and must
// fire for every alert-worthy gem, not only smart-money-converged ones.
// Pre-registration §Control requires both converged (treatment) and
// non-converged (control) alerts in the corpus.

const { expect } = require("chai");

const marketStructurePath =
  require.resolve("../../js/intelligence/market-structure.js");

describe("Gem Agent — persistence gate (Phase 4)", () => {
  const ADDR_A = "0x1111111111111111111111111111111111111111";

  let originalFetch;
  let originalUi;
  let originalFmtPct;
  let originalTg;
  let originalTheses;

  function mockPair(chainId, address, symbol) {
    return {
      chainId,
      baseToken: { address, symbol, name: symbol + " token" },
      liquidity: { usd: 200000 },
      volume: { h24: 500000 },
      priceChange: { h1: 5, h6: 5, h24: 15 },
      pairCreatedAt: Date.now() - 20 * 3600 * 1000,
      priceUsd: "0.01",
      url: "https://dexscreener.com/test",
      pairAddress: "0xpair",
    };
  }

  function installFetch(pairs) {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("token-boosts")) {
        return {
          ok: true,
          json: async () =>
            pairs.map((p) => ({
              tokenAddress: p.baseToken.address,
              totalBoosts: 5,
            })),
        };
      }
      if (u.includes("token-profiles")) {
        return { ok: true, json: async () => [] };
      }
      if (u.includes("/latest/dex/tokens/")) {
        return { ok: true, json: async () => ({ pairs }) };
      }
      if (u.includes("/meme/alert")) {
        // Persistence endpoint — accept and record.
        return { ok: true, json: async () => ({ ok: true, key: "test" }) };
      }
      throw new Error("Unexpected fetch: " + u);
    };
  }

  function buildScanDom() {
    const root = document.createElement("div");
    root.innerHTML = `
      <select id="g-min"><option value="0" selected>0</option></select>
      <select id="g-chain"><option value="">All</option></select>
      <input type="checkbox" id="g-hide-risk">
      <div id="g-stats"></div>
      <div id="g-body"></div>
    `;
    document.body.appendChild(root);
    return root;
  }

  before(() => {
    originalFetch = global.fetch;
    originalUi = global.W.ui;
    originalFmtPct = global.W.fmt.pct;
    originalTg = global.W.tg;
    originalTheses = global.W.theses;

    delete require.cache[marketStructurePath];
    require(marketStructurePath);

    global.W.ui = {
      spinner: () => "<div>loading</div>",
      empty: (_i, m) => `<div>${m}</div>`,
      toast: () => {},
    };
    global.W.fmt.pct = (n) =>
      n === undefined || n === null
        ? "—"
        : (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
    global.W.tg = undefined;
    global.W.theses = undefined;
  });

  after(() => {
    global.fetch = originalFetch;
    global.W.ui = originalUi;
    global.W.fmt.pct = originalFmtPct;
    global.W.tg = originalTg;
    global.W.theses = originalTheses;
  });

  beforeEach(() => {
    global.W.gems._internal.resetShieldCache();
    global.W.gems._internal.resetSeen();
    if (
      global.W.gems._internal.resetDeployerBackoff &&
      typeof global.W.gems._internal.resetDeployerBackoff === "function"
    ) {
      global.W.gems._internal.resetDeployerBackoff();
    }
  });

  it("persists non-converged alerts (control cohort)", async () => {
    installFetch([mockPair("ethereum", ADDR_A, "CONTROL")]);

    // Mock smart-money to explicitly NOT converge.
    const savedSmartMoney = global.W.smartMoney;
    global.W.smartMoney = {
      entryAssessment: {
        evaluate: async () => ({
          ok: true,
          hasConvergence: false,
          reason: "not-enough-independent-wallets",
        }),
      },
    };

    // Low-risk shield assessment with enough holders to reach the
    // smart-money evaluation path in _scanImpl.
    const shieldAssessment = {
      riskScore: 10,
      riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
      scoreVersion: "shield-evm-v1",
      holders: {
        count: 100,
        top10: [
          { address: "0xaaa0000000000000000000000000000000000001", pct: 2 },
          { address: "0xaaa0000000000000000000000000000000000002", pct: 2 },
          { address: "0xaaa0000000000000000000000000000000000003", pct: 2 },
        ],
        top10Pct: 6,
        lpCount: 3,
        lockedLpCount: 2,
        hasLockedLp: true,
        source: "goplus-evm",
      },
      owner: { address: null, source: "unavailable" },
      creator: { address: null, source: "unavailable" },
    };
    global.W.shield.check = async () => shieldAssessment;
    const key = global.W.gems._internal.shieldCacheKey(ADDR_A, "ethereum");
    global.W.gems._internal.setCachedShield(key, shieldAssessment);

    // Spy on the persistence endpoint — count /meme/alert POSTs.
    let persistCalls = 0;
    const savedFetch = global.fetch;
    global.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes("/meme/alert")) {
        persistCalls++;
        return { ok: true, json: async () => ({ ok: true, key: "test" }) };
      }
      return savedFetch(url, opts);
    };

    try {
      const root = buildScanDom();
      await global.W.gems.scan(root);
      await new Promise((r) => setTimeout(r, 50));
      root.remove();

      // Non-converged alert with score >= 70 must be persisted.
      // Without this fix, persistCalls === 0 because persistence was
      // gated on hasConvergence.
      expect(
        persistCalls,
        "non-converged alert should still be persisted for control cohort",
      ).to.be.at.least(1);
    } finally {
      global.W.smartMoney = savedSmartMoney;
    }
  });
});
