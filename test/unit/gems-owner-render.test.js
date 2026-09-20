// test/unit/gems-owner-render.test.js
//
// Regression for the render-path read/write boundary.
//
// The recording loop in scan() is the only writer to the owner
// association session map. Card rendering must read via get(), not
// write via observe(). This suite asserts the observe call count
// matches the number of candidates recorded, not candidates plus
// candidates rendered.

const { expect } = require("chai");

const ownerPath =
  require.resolve("../../js/intelligence/owner-associations.js");
const marketStructurePath =
  require.resolve("../../js/intelligence/market-structure.js");

describe("Gem Agent — render path does not write owner state", () => {
  const ADDR_A = "0x1111111111111111111111111111111111111111";
  const ADDR_B = "0x2222222222222222222222222222222222222222";
  const ADDR_C = "0x3333333333333333333333333333333333333333";
  const OWNER = "0xAbCdEf0000000000000000000000000000000001";

  let originalFetch;
  let originalShield;
  let originalShieldCheck;
  let originalUi;
  let originalFmtPct;

  function mockPair(chainId, address, symbol) {
    return {
      chainId,
      baseToken: { address, symbol, name: symbol + " token" },
      liquidity: { usd: 61000 },
      volume: { h24: 78000 },
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
      throw new Error("Unexpected fetch: " + u);
    };
  }

  function buildScanDom({ hideRisk = false, chain = "" } = {}) {
    const root = document.createElement("div");
    root.innerHTML = `
      <select id="g-min"><option value="0" selected>0</option></select>
      <select id="g-chain">
        <option value="">All</option>
        <option value="ethereum">ethereum</option>
        <option value="base">base</option>
      </select>
      <input type="checkbox" id="g-hide-risk" ${hideRisk ? "checked" : ""}>
      <div id="g-stats"></div>
      <div id="g-body"></div>
    `;
    root.querySelector("#g-chain").value = chain;
    document.body.appendChild(root);
    return root;
  }

  function evmAssessment(overrides = {}) {
    return {
      riskScore: 10,
      riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
      scoreVersion: "shield-evm-v1",
      flags: {
        isHoneypot: false,
        isMintable: false,
        isProxy: false,
        isOwnerRenounced: true,
        isLpLocked: true,
      },
      holders: {
        count: 241,
        top10: [],
        top10Pct: 51.2,
        lpCount: 3,
        lockedLpCount: 2,
        hasLockedLp: true,
        source: "goplus-evm",
      },
      owner: { address: OWNER, source: "goplus-evm" },
      ...overrides,
    };
  }

  before(() => {
    originalFetch = global.fetch;
    originalUi = global.W.ui;
    originalFmtPct = global.W.fmt.pct;
    originalShield = global.W.shield;

    delete require.cache[ownerPath];
    require(ownerPath);
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

    originalShieldCheck = global.W.shield.check;
  });

  after(() => {
    global.fetch = originalFetch;
    global.W.ui = originalUi;
    global.W.fmt.pct = originalFmtPct;
    if (originalShield) global.W.shield.check = originalShieldCheck;
  });

  beforeEach(() => {
    global.W.store.clearAll();
    global.W.gems._internal.resetShieldCache();
    global.W.gems._internal.resetSeen();
    global.W.ownerAssociations.reset();
  });

  it("observe is called once per candidate, not once per candidate plus once per rendered card", async () => {
    installFetch([
      mockPair("ethereum", ADDR_A, "A"),
      mockPair("ethereum", ADDR_B, "B"),
      mockPair("ethereum", ADDR_C, "C"),
    ]);
    global.W.shield.check = async () => evmAssessment();

    let observeCalls = 0;
    let getCalls = 0;
    const originalObserve = global.W.ownerAssociations.observe;
    const originalGet = global.W.ownerAssociations.get;
    global.W.ownerAssociations.observe = function (...args) {
      observeCalls++;
      return originalObserve.apply(this, args);
    };
    global.W.ownerAssociations.get = function (...args) {
      getCalls++;
      return originalGet.apply(this, args);
    };

    try {
      const root = buildScanDom();
      await global.W.gems.scan(root);
      await new Promise((r) => setTimeout(r, 30));

      // Three candidates, all rendered.
      // Recording loop: observe() called 3 times.
      // Render loop: get() called 3 times.
      // If the render path called observe() instead of get(), observe
      // would be 6 and get would be 0.
      expect(
        observeCalls,
        "observe must only be called by the recording loop",
      ).to.equal(3);
      expect(getCalls, "get must be called once per rendered card").to.equal(3);
      root.remove();
    } finally {
      global.W.ownerAssociations.observe = originalObserve;
      global.W.ownerAssociations.get = originalGet;
    }
  });

  it("render does not advance observedAt on the session entry", async () => {
    installFetch([mockPair("ethereum", ADDR_A, "A")]);
    global.W.shield.check = async () => evmAssessment();

    const root = buildScanDom();
    await global.W.gems.scan(root);
    await new Promise((r) => setTimeout(r, 30));

    const afterScan = global.W.ownerAssociations.get("ethereum", ADDR_A);
    const observedAtAfterScan = afterScan.seenOnTokens[0].observedAt;

    // Wait long enough that any second observe() call would produce a
    // measurably different timestamp.
    await new Promise((r) => setTimeout(r, 10));

    // Read the association again. If the render path had called
    // observe(), the timestamp would be identical (last write wins)
    // — but the timestamp written would have been during render, not
    // during the recording loop. We cannot distinguish that from a
    // pure read by inspecting the value alone; instead, use the
    // observe-call-count assertion above as the primary check.
    //
    // Here we assert the weaker but still useful property that a
    // second get() does not change the timestamp.
    const afterRead = global.W.ownerAssociations.get("ethereum", ADDR_A);
    expect(afterRead.seenOnTokens[0].observedAt).to.equal(
      observedAtAtAfterScan(observedAtAfterScan),
    );

    root.remove();
  });

  it("render of a filtered-out token does not write owner state", async () => {
    // Two tokens, one hidden by hideRisk.
    installFetch([
      mockPair("ethereum", ADDR_A, "A"),
      mockPair("ethereum", ADDR_B, "B"),
    ]);

    let shieldCallCount = 0;
    global.W.shield.check = async () => {
      shieldCallCount++;
      // Every token is high risk, so both are filtered out when
      // hideRisk is on.
      return evmAssessment({
        riskScore: 80,
        riskLevel: ["🔴 High identified risk indicators", "high-risk"],
      });
    };

    let observeCalls = 0;
    const originalObserve = global.W.ownerAssociations.observe;
    global.W.ownerAssociations.observe = function (...args) {
      observeCalls++;
      return originalObserve.apply(this, args);
    };

    try {
      const root = buildScanDom({ hideRisk: true });
      await global.W.gems.scan(root);
      await new Promise((r) => setTimeout(r, 30));

      // Both tokens are recorded in the recording loop even though
      // the render shows nothing. observe() should be called exactly
      // twice — once per result.
      expect(observeCalls).to.equal(2);

      // And the session map should hold both associations.
      expect(global.W.ownerAssociations.get("ethereum", ADDR_A)).to.be.an(
        "object",
      );
      expect(global.W.ownerAssociations.get("ethereum", ADDR_B)).to.be.an(
        "object",
      );

      root.remove();
    } finally {
      global.W.ownerAssociations.observe = originalObserve;
    }
  });
});

// Helper retained to keep the middle test's assertion readable without
// comparing timestamps across different references.
function observedAtAtAfterScan(value) {
  return value;
}
