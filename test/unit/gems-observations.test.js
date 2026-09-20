
//
// Step 2 — Gem scan records market-structure observations.
//
// Design reference: docs/trajectory-design.md, §9 Step 2
//
// Scope verified here:
//   - recordObservation() persists an observation when a usable
//     cached Shield assessment exists
//   - It returns false (without throwing) for every guard condition
//   - Observations are recorded for tokens filtered out of the UI
//   - Cached assessments are recorded, not just freshly fetched
//   - Solana assessments are skipped (source "unavailable")
//   - The scan completes normally when W.observations is missing
//   - Back-to-back scans produce a multi-sample trajectory with
//     null deltas (no interval has elapsed)
//   - Observations spanning a real interval produce a real delta

const { expect } = require("chai");

const observationsPath = require.resolve("../../js/storage/observations.js");
const marketStructurePath =
  require.resolve("../../js/intelligence/market-structure.js");

describe("Gem Agent — observation recording", () => {
  const ADDR_EVM = "0x1111111111111111111111111111111111111111";
  const ADDR_SOL = "SoMeBaSe58AdDrEsS1111111111111111111111111";

  let originalFetch;
  let originalShield;
  let originalShieldCheck;
  let originalUi;
  let originalFmtPct;
  let originalObservations;

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
      ...overrides,
    };
  }

  function solanaAssessment() {
    return {
      riskScore: 10,
      scoreVersion: "shield-solana-v1",
      flags: {},
      holders: {
        count: null,
        top10: null,
        top10Pct: null,
        lpCount: null,
        lockedLpCount: null,
        hasLockedLp: null,
        source: "unavailable",
        reason: "GoPlus Solana endpoint does not return holder distribution.",
      },
    };
  }

  before(() => {
    originalFetch = global.fetch;
    originalUi = global.W.ui;
    originalFmtPct = global.W.fmt.pct;
    originalShield = global.W.shield;
    originalObservations = global.W.observations;

    // Force-fresh loads so this suite is self-contained regardless
    // of Mocha's file ordering.
    delete require.cache[observationsPath];
    require(observationsPath);
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
    global.W.observations = originalObservations;
  });

  beforeEach(() => {
    global.W.store.clearAll();
    global.W.gems._internal.resetShieldCache();
    global.W.gems._internal.resetSeen();
  });

  // ── recordObservation() in isolation ───────────────────────

  describe("recordObservation", () => {
    const rec = (gem) => global.W.gems._internal.recordObservation(gem);

    function gem(chainId, address, symbol) {
      return { pair: mockPair(chainId, address, symbol) };
    }

    function primeShield(chainId, address, assessment) {
      const key = global.W.gems._internal.shieldCacheKey(address, chainId);
      global.W.gems._internal.setCachedShield(key, assessment);
    }

    it("returns false when W.observations is unavailable", () => {
      const saved = global.W.observations;
      global.W.observations = undefined;
      try {
        expect(rec(gem("ethereum", ADDR_EVM, "X"))).to.equal(false);
      } finally {
        global.W.observations = saved;
      }
    });

    it("returns false for a null gem", () => {
      expect(rec(null)).to.equal(false);
      expect(rec(undefined)).to.equal(false);
    });

    it("returns false for a gem without a pair", () => {
      expect(rec({})).to.equal(false);
      expect(rec({ pair: {} })).to.equal(false);
      expect(rec({ pair: { baseToken: {} } })).to.equal(false);
    });

    it("returns false when no shield is cached", () => {
      expect(rec(gem("ethereum", ADDR_EVM, "X"))).to.equal(false);
    });

    it("returns false when the cached shield is an error", () => {
      primeShield("ethereum", ADDR_EVM, { error: true, message: "timeout" });
      expect(rec(gem("ethereum", ADDR_EVM, "X"))).to.equal(false);
    });

    it("returns false when the cached shield is noData", () => {
      primeShield("ethereum", ADDR_EVM, { noData: true });
      expect(rec(gem("ethereum", ADDR_EVM, "X"))).to.equal(false);
    });

    it("returns false when the cached shield is unsupported", () => {
      primeShield("ethereum", ADDR_EVM, { unsupported: true });
      expect(rec(gem("ethereum", ADDR_EVM, "X"))).to.equal(false);
    });

    it("returns false when the observation source is 'unavailable'", () => {
      primeShield("solana", ADDR_SOL, solanaAssessment());
      expect(rec(gem("solana", ADDR_SOL, "S"))).to.equal(false);
    });

    it("records an observation for a valid EVM assessment", () => {
      primeShield("ethereum", ADDR_EVM, evmAssessment());
      const ok = rec(gem("ethereum", ADDR_EVM, "X"));
      expect(ok).to.equal(true);

      const history = global.W.observations.history("ethereum", ADDR_EVM);
      expect(history).to.have.length(1);
      expect(history[0].concentration.top10Pct).to.equal(51.2);
      expect(history[0].holderCount).to.equal(241);
      expect(history[0].source).to.equal("goplus-evm");
    });

    it("returns false and does not throw when W.observations.record throws", () => {
      primeShield("ethereum", ADDR_EVM, evmAssessment());
      const saved = global.W.observations.record;
      global.W.observations.record = () => {
        throw new Error("simulated storage failure");
      };
      try {
        expect(rec(gem("ethereum", ADDR_EVM, "X"))).to.equal(false);
      } finally {
        global.W.observations.record = saved;
      }
    });

    it("successive calls record distinct timestamps", async () => {
      primeShield("ethereum", ADDR_EVM, evmAssessment());
      rec(gem("ethereum", ADDR_EVM, "X"));
      await new Promise((r) => setTimeout(r, 5));
      rec(gem("ethereum", ADDR_EVM, "X"));

      const history = global.W.observations.history("ethereum", ADDR_EVM);
      expect(history).to.have.length(2);
      expect(history[0].observedAt).to.be.below(history[1].observedAt);
    });
  });

  // ── Full scan integration ─────────────────────────────────

  describe("full scan integration", () => {
    it("records observations for tokens scanned with fresh EVM assessments", async () => {
      installFetch([mockPair("ethereum", ADDR_EVM, "X")]);
      global.W.shield.check = async () => evmAssessment();

      const root = buildScanDom();
      await scanAndSettle(root);

      const history = global.W.observations.history("ethereum", ADDR_EVM);
      expect(history).to.have.length(1);
      expect(history[0].holderCount).to.equal(241);
      root.remove();
    });

    it("records observations for filtered-out tokens (hideRisk=true)", async () => {
      installFetch([mockPair("ethereum", ADDR_EVM, "X")]);
      global.W.shield.check = async () =>
        evmAssessment({
          riskScore: 80,
          riskLevel: ["🔴 High identified risk indicators", "high-risk"],
        });

      const root = buildScanDom({ hideRisk: true });
      await scanAndSettle(root);

      const history = global.W.observations.history("ethereum", ADDR_EVM);
      expect(
        history.length,
        "observation must be recorded even when the token is hidden",
      ).to.equal(1);
      root.remove();
    });

    it("records observations for cached assessments, not just fresh", async () => {
      // Prime the cache so the scan finds nothing to fetch.
      const key = global.W.gems._internal.shieldCacheKey(ADDR_EVM, "ethereum");
      global.W.gems._internal.setCachedShield(key, evmAssessment());

      let freshCalls = 0;
      global.W.shield.check = async () => {
        freshCalls++;
        return evmAssessment();
      };

      installFetch([mockPair("ethereum", ADDR_EVM, "X")]);
      const root = buildScanDom();
      await scanAndSettle(root);

      expect(freshCalls, "cached assessment must not trigger a fetch").to.equal(
        0,
      );
      const history = global.W.observations.history("ethereum", ADDR_EVM);
      expect(history).to.have.length(1);
      root.remove();
    });

    it("does not record Solana observations", async () => {
      installFetch([mockPair("solana", ADDR_SOL, "SOLX")]);
      global.W.shield.check = async () => solanaAssessment();

      const root = buildScanDom();
      await scanAndSettle(root);

      expect(global.W.observations.history("solana", ADDR_SOL)).to.deep.equal(
        [],
      );
      root.remove();
    });

    it("scan completes normally when W.observations is missing", async () => {
      installFetch([mockPair("ethereum", ADDR_EVM, "X")]);
      global.W.shield.check = async () => evmAssessment();

      const saved = global.W.observations;
      global.W.observations = undefined;
      try {
        const root = buildScanDom();
        await scanAndSettle(root);
        expect(root.querySelector("#g-body").innerHTML).to.include("X");
        root.remove();
      } finally {
        global.W.observations = saved;
      }
    });

    it("successive scans produce a multi-sample trajectory", async () => {
      installFetch([mockPair("ethereum", ADDR_EVM, "X")]);
      global.W.shield.check = async () => evmAssessment();

      const root = buildScanDom();
      await scanAndSettle(root);
      await scanAndSettle(root);

      const history = global.W.observations.history("ethereum", ADDR_EVM);
      expect(history.length).to.equal(2);

      const t = global.W.observations.trajectory("ethereum", ADDR_EVM);
      expect(t).to.not.equal(null);
      expect(t.window.sampleCount).to.equal(2);

      // The current value is exposed from the most recent observation.
      expect(t.holderCount.current).to.equal(241);

      // The two observations are milliseconds apart, so no 5m delta
      // is computable — the target time (now - 5m) is far outside the
      // 2.5-minute half-interval tolerance. The delta is correctly
      // null, not zero.
      expect(t.holderCount.change5m.absolute).to.equal(null);
      expect(t.holderCount.change5m.percent).to.equal(null);
      expect(t.holderCount.change5m.direction).to.equal("unknown");

      // The same applies to the 15m and 1h windows.
      expect(t.holderCount.change15m.absolute).to.equal(null);
      expect(t.holderCount.change1h.absolute).to.equal(null);

      root.remove();
    });

    it("produces a real delta when observations span a matching interval", async () => {
      // Prime history with an observation five minutes in the past,
      // then run a scan so the current observation lands now. The 5m
      // delta target is exactly between the two, within tolerance.
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      global.W.observations.record("ethereum", ADDR_EVM, {
        concentration: { top10Pct: 40, status: "moderate" },
        liquidity: { usd: 60000, status: "locked" },
        holderCount: 200,
        source: "goplus-evm",
        methodologyVersion: "market-structure-v1",
        observedAt: fiveMinAgo,
      });

      installFetch([mockPair("ethereum", ADDR_EVM, "X")]);
      global.W.shield.check = async () => evmAssessment();

      const root = buildScanDom();
      await scanAndSettle(root);

      const t = global.W.observations.trajectory("ethereum", ADDR_EVM);
      expect(t).to.not.equal(null);
      expect(t.window.sampleCount).to.equal(2);

      // Current: 241 holders. Past: 200. Delta: +41 holders, +20.5%.
      expect(t.holderCount.current).to.equal(241);
      expect(t.holderCount.change5m.absolute).to.equal(41);
      expect(t.holderCount.change5m.percent).to.be.closeTo(20.5, 0.1);
      expect(t.holderCount.change5m.direction).to.equal("rising");

      root.remove();
    });
  });
});
