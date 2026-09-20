
//
// Market Structure v2 — the observation from market-structure.js is
// surfaced on the gem card as an additional row.
//
// Design constraints verified here:
//   - The observation is DERIVED from the cached Shield assessment
//     and the DexScreener pair. No new network call is issued.
//   - Missing market structure data means the row is omitted, not
//     filled with "unknown · unknown" noise.
//   - When W.marketStructure is unavailable (test environments,
//     load-order issues), the gem card renders normally without the
//     row. Absence of the row is not a positive signal.
//   - The filter logic is unchanged — market structure is evidence,
//     not a filter.

const { expect } = require("chai");

const marketStructurePath =
  require.resolve("../../js/intelligence/market-structure.js");

describe("Gem Agent — market structure row", () => {
  const ADDR_A = "0x1111111111111111111111111111111111111111";

  let originalFetch;
  let originalShield;
  let originalShieldCheck;
  let originalUi;
  let originalFmtPct;
  let originalMarketStructure;

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

  function buildScanDom({ hideRisk = false } = {}) {
    const root = document.createElement("div");
    root.innerHTML = `
      <select id="g-min"><option value="0" selected>0</option></select>
      <select id="g-chain"><option value="" selected>All</option></select>
      <input type="checkbox" id="g-hide-risk" ${hideRisk ? "checked" : ""}>
      <div id="g-stats"></div>
      <div id="g-body"></div>
    `;
    document.body.appendChild(root);
    return root;
  }

  async function scanAndSettle(root) {
    await global.W.gems.scan(root);
    await new Promise((r) => setTimeout(r, 30));
  }

  before(() => {
    originalFetch = global.fetch;
    originalUi = global.W.ui;
    originalFmtPct = global.W.fmt.pct;
    originalShield = global.W.shield;
    originalMarketStructure = global.W.marketStructure;

    // Force-fresh load of market-structure.js. This suite depends on
    // W.marketStructure being present, and test/setup.js does not
    // load it. Relying on another test file to have loaded it first
    // makes the suite order-dependent: the tests pass in the full
    // run only because market-structure.test.js happens to run
    // before this file, and fail when this file is run in isolation.
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
    global.W.marketStructure = originalMarketStructure;
  });

  beforeEach(() => {
    global.W.gems._internal.resetShieldCache();
    global.W.gems._internal.resetSeen();
  });

  // ── marketStructureLine() helper in isolation ─────────────

  describe("marketStructureLine", () => {
    const line = (o) => global.W.gems._internal.marketStructureLine(o);

    it("returns '' for a null observation", () => {
      expect(line(null)).to.equal("");
    });

    it("returns '' when both concentration and liquidity are unknown", () => {
      const o = {
        concentration: { top10Pct: null, status: "unknown" },
        liquidity: { status: "unknown" },
      };
      expect(line(o)).to.equal("");
    });

    it("renders the concentration when present", () => {
      const o = {
        concentration: { top10Pct: 51.2, status: "moderate" },
        liquidity: { status: "unknown" },
      };
      const html = line(o);
      expect(html).to.include("Top 10: 51.2%");
      expect(html).to.include("moderate");
      expect(html).to.not.include("LP:");
    });

    it("renders the LP status when present", () => {
      const o = {
        concentration: { top10Pct: null, status: "unknown" },
        liquidity: { status: "locked" },
      };
      const html = line(o);
      expect(html).to.include("LP: locked");
      expect(html).to.not.include("Top 10:");
    });

    it("renders both when both are present", () => {
      const o = {
        concentration: { top10Pct: 72.4, status: "concentrated" },
        liquidity: { status: "unlocked" },
      };
      const html = line(o);
      expect(html).to.include("Top 10: 72.4%");
      expect(html).to.include("concentrated");
      expect(html).to.include("LP: unlocked");
    });

    it("escapes injected HTML in status strings", () => {
      const o = {
        concentration: { top10Pct: 10, status: "<script>" },
        liquidity: { status: "unknown" },
      };
      const html = line(o);
      expect(html).to.not.include("<script>");
    });
  });

  // ── buildObservation() graceful degradation ───────────────

  describe("buildObservation", () => {
    it("returns null when the shield is missing", () => {
      expect(global.W.gems._internal.buildObservation(null, {})).to.equal(null);
    });

    it("returns null when W.marketStructure is not loaded", () => {
      const saved = global.W.marketStructure;
      global.W.marketStructure = undefined;
      try {
        const o = global.W.gems._internal.buildObservation(
          { riskScore: 10, flags: {} },
          { liquidity: { usd: 1000 } },
        );
        expect(o).to.equal(null);
      } finally {
        global.W.marketStructure = saved;
      }
    });

    it("returns an observation when both inputs are available", () => {
      const o = global.W.gems._internal.buildObservation(
        {
          riskScore: 10,
          flags: {},
          holders: {
            count: 100,
            top10Pct: 40,
            hasLockedLp: true,
            source: "goplus-evm",
          },
        },
        { liquidity: { usd: 50000 } },
      );
      expect(o).to.be.an("object");
      expect(o.concentration.status).to.equal("moderate");
      expect(o.liquidity.status).to.equal("locked");
    });
  });

  // ── Full scan renders the row ─────────────────────────────

  describe("full scan integration", () => {
    it("renders the structure row when holder data is present", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "STRUCTURED")]);

      global.W.shield.check = async () => ({
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
          top10: [{ address: "0xa", percent: 12.5 }],
          top10Pct: 51.2,
          lpCount: 3,
          lockedLpCount: 2,
          hasLockedLp: true,
          source: "goplus-evm",
        },
      });

      const root = buildScanDom();
      await scanAndSettle(root);

      const html = root.querySelector("#g-body").innerHTML;
      expect(html).to.include("Structure");
      expect(html).to.include("Top 10: 51.2%");
      expect(html).to.include("LP: locked");
      root.remove();
    });

    it("omits the structure row when holder data is missing", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "NOSTRUCT")]);

      global.W.shield.check = async () => ({
        riskScore: 5,
        riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
        scoreVersion: "shield-evm-v1",
        flags: {
          isHoneypot: false,
          isMintable: false,
          isProxy: false,
          isOwnerRenounced: true,
          isLpLocked: true,
        },
        // No holders block at all.
      });

      const root = buildScanDom();
      await scanAndSettle(root);

      const html = root.querySelector("#g-body").innerHTML;
      // The gem itself still renders.
      expect(html).to.include("NOSTRUCT");
      // But no structure row.
      expect(html).to.not.include("Top 10:");
      expect(html).to.not.include("Structure");
      root.remove();
    });

    it("omits the structure row when W.marketStructure is unavailable", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "NOMODULE")]);

      global.W.shield.check = async () => ({
        riskScore: 10,
        scoreVersion: "shield-evm-v1",
        flags: {
          isHoneypot: false,
          isMintable: false,
          isProxy: false,
          isOwnerRenounced: true,
          isLpLocked: true,
        },
        holders: {
          count: 100,
          top10Pct: 40,
          hasLockedLp: true,
          source: "goplus-evm",
        },
      });

      const saved = global.W.marketStructure;
      global.W.marketStructure = undefined;
      try {
        const root = buildScanDom();
        await scanAndSettle(root);

        const html = root.querySelector("#g-body").innerHTML;
        expect(html).to.include("NOMODULE");
        expect(html).to.not.include("Structure");
        root.remove();
      } finally {
        global.W.marketStructure = saved;
      }
    });

    it("does not issue extra network calls beyond the shield check", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "COUNTCALLS")]);

      let shieldCalls = 0;
      global.W.shield.check = async () => {
        shieldCalls++;
        return {
          riskScore: 10,
          scoreVersion: "shield-evm-v1",
          flags: {},
          holders: {
            count: 100,
            top10Pct: 40,
            hasLockedLp: false,
            source: "goplus-evm",
          },
        };
      };

      const fetchUrls = [];
      const baseFetch = global.fetch;
      global.fetch = async (url) => {
        fetchUrls.push(String(url));
        return baseFetch(url);
      };

      const root = buildScanDom();
      await scanAndSettle(root);

      // The scan fetches: boosts, profiles, pairs. That's three.
      // Market structure must not add a fourth.
      const dexscreenerCalls = fetchUrls.filter(
        (u) =>
          u.includes("token-boosts") ||
          u.includes("token-profiles") ||
          u.includes("/latest/dex/tokens/"),
      );
      expect(dexscreenerCalls).to.have.length(3);
      expect(shieldCalls).to.equal(1);
      root.remove();
    });
  });
});
