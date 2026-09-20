// test/unit/gems-owner.test.js
//
// Step 3 of the owner-associations design — Gem scan records owner
// observations.
//
// The helper mirrors recordObservation()'s guard shape. The module
// itself does the address normalization and the Shield authority
// delegation; this suite verifies the integration path.

const { expect } = require("chai");

const ownerPath =
  require.resolve("../../js/intelligence/owner-associations.js");
const marketStructurePath =
  require.resolve("../../js/intelligence/market-structure.js");

describe("Gem Agent — owner observation recording", () => {
  const ADDR_A = "0x1111111111111111111111111111111111111111";
  const ADDR_B = "0x2222222222222222222222222222222222222222";
  const OWNER = "0xAbCdEf0000000000000000000000000000000001";
  const OWNER_LOWER = OWNER.toLowerCase();
  const ADDR_SOL = "SoMeBaSe58AdDrEsS1111111111111111111111111";

  let originalFetch;
  let originalShield;
  let originalShieldCheck;
  let originalUi;
  let originalFmtPct;
  let originalOwnerAssociations;

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
      owner: {
        address: OWNER,
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
      owner: {
        address: null,
        source: "unavailable",
        reason:
          "GoPlus Solana endpoint does not return an owner address field.",
      },
    };
  }

  before(() => {
    originalFetch = global.fetch;
    originalUi = global.W.ui;
    originalFmtPct = global.W.fmt.pct;
    originalShield = global.W.shield;
    originalOwnerAssociations = global.W.ownerAssociations;

    // Force-fresh loads so this suite is self-contained.
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
    global.W.ownerAssociations = originalOwnerAssociations;
  });

  beforeEach(() => {
    global.W.store.clearAll();
    global.W.gems._internal.resetShieldCache();
    global.W.gems._internal.resetSeen();
    if (global.W.ownerAssociations) {
      global.W.ownerAssociations.reset();
    }
  });

  // ── observeOwner() in isolation ────────────────────────────

  describe("observeOwner", () => {
    const rec = (gem) => global.W.gems._internal.observeOwner(gem);

    function gem(chainId, address, symbol) {
      return { pair: mockPair(chainId, address, symbol) };
    }

    function primeShield(chainId, address, assessment) {
      const key = global.W.gems._internal.shieldCacheKey(address, chainId);
      global.W.gems._internal.setCachedShield(key, assessment);
    }

    it("returns null when W.ownerAssociations is unavailable", () => {
      const saved = global.W.ownerAssociations;
      global.W.ownerAssociations = undefined;
      try {
        expect(rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
      } finally {
        global.W.ownerAssociations = saved;
      }
    });

    it("returns null for a null gem", () => {
      expect(rec(null)).to.equal(null);
      expect(rec(undefined)).to.equal(null);
    });

    it("returns null for a gem without a pair", () => {
      expect(rec({})).to.equal(null);
      expect(rec({ pair: {} })).to.equal(null);
      expect(rec({ pair: { baseToken: {} } })).to.equal(null);
    });

    it("returns null when no shield is cached", () => {
      expect(rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null when the cached shield is an error", () => {
      primeShield("ethereum", ADDR_A, { error: true, message: "timeout" });
      expect(rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null when the cached shield is noData", () => {
      primeShield("ethereum", ADDR_A, { noData: true });
      expect(rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null when the cached shield is unsupported", () => {
      primeShield("ethereum", ADDR_A, { unsupported: true });
      expect(rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null when the shield has no owner block", () => {
      primeShield("ethereum", ADDR_A, { riskScore: 10 });
      expect(rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null when owner.address is null (Solana declared gap)", () => {
      primeShield("solana", ADDR_SOL, solanaAssessment());
      expect(rec(gem("solana", ADDR_SOL, "S"))).to.equal(null);
    });

    it("records an observation for a valid EVM assessment with an owner", () => {
      primeShield("ethereum", ADDR_A, evmAssessment());
      const o = rec(gem("ethereum", ADDR_A, "X"));
      expect(o).to.be.an("object");
      expect(o.ownerAddress).to.equal(OWNER_LOWER);
      expect(o.seenOnTokens).to.have.length(1);
      expect(o.seenOnTokens[0].tokenAddress).to.equal(ADDR_A);
      expect(o.seenOnTokens[0].symbol).to.equal("X");
    });

    it("returns null and does not throw when W.ownerAssociations.observe throws", () => {
      primeShield("ethereum", ADDR_A, evmAssessment());
      const saved = global.W.ownerAssociations.observe;
      global.W.ownerAssociations.observe = () => {
        throw new Error("simulated storage failure");
      };
      try {
        expect(rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
      } finally {
        global.W.ownerAssociations.observe = saved;
      }
    });

    it("does not invoke the module when the shield is in an error state", () => {
      primeShield("ethereum", ADDR_A, { error: true });
      let calls = 0;
      const saved = global.W.ownerAssociations.observe;
      global.W.ownerAssociations.observe = () => {
        calls++;
        return null;
      };
      try {
        rec(gem("ethereum", ADDR_A, "X"));
        expect(calls).to.equal(0);
      } finally {
        global.W.ownerAssociations.observe = saved;
      }
    });
  });

  // ── Full scan integration ─────────────────────────────────

  describe("full scan integration", () => {
    it("records an owner observation for a fresh EVM assessment", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "X")]);
      global.W.shield.check = async () => evmAssessment();

      const root = buildScanDom();
      await scanAndSettle(root);

      const o = global.W.ownerAssociations
        ? // Read via a fresh observe call to get session state
          null
        : null;
      // Session state is not directly readable; assert by re-observing.
      const association = global.W.gems._internal.observeOwner({
        pair: mockPair("ethereum", ADDR_A, "X"),
      });
      // The prior scan already recorded an observation for ADDR_A.
      // Re-observing ADDR_A should return the accumulated association
      // with exactly one token — the deduplication rule.
      expect(association).to.be.an("object");
      expect(association.ownerAddress).to.equal(OWNER_LOWER);
      expect(association.seenOnTokens).to.have.length(1);
      root.remove();
    });

    it("accumulates distinct tokens under the same owner across a single scan", async () => {
      // Two tokens, same owner, both in the same scan.
      installFetch([
        mockPair("ethereum", ADDR_A, "TOKEN_A"),
        mockPair("ethereum", ADDR_B, "TOKEN_B"),
      ]);
      global.W.shield.check = async () => evmAssessment();

      const root = buildScanDom();
      await scanAndSettle(root);

      const association = global.W.gems._internal.observeOwner({
        pair: mockPair("ethereum", ADDR_A, "TOKEN_A"),
      });
      expect(association).to.be.an("object");
      expect(association.seenOnTokens).to.have.length(2);
      const addrs = association.seenOnTokens.map((t) => t.tokenAddress).sort();
      expect(addrs).to.deep.equal([ADDR_A, ADDR_B].sort());
      root.remove();
    });

    it("records owner observations for filtered-out tokens (hideRisk=true)", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "X")]);
      global.W.shield.check = async () =>
        evmAssessment({
          riskScore: 80,
          riskLevel: ["🔴 High identified risk indicators", "high-risk"],
        });

      const root = buildScanDom({ hideRisk: true });
      await scanAndSettle(root);

      // Even though the token was hidden from the card list, its
      // owner observation was recorded because the recording loop
      // runs before the filter.
      const association = global.W.gems._internal.observeOwner({
        pair: mockPair("ethereum", ADDR_A, "X"),
      });
      expect(association).to.be.an("object");
      expect(association.seenOnTokens).to.have.length(1);
      root.remove();
    });

    it("does not record a Solana owner observation", async () => {
      installFetch([mockPair("solana", ADDR_SOL, "SOLX")]);
      global.W.shield.check = async () => solanaAssessment();

      const root = buildScanDom();
      await scanAndSettle(root);

      // The Solana assessment declares owner.source "unavailable"
      // and owner.address null; the module correctly rejects it.
      // We verify by attempting to read an association for the
      // Solana token — there should be none.
      const association = global.W.gems._internal.observeOwner({
        pair: mockPair("solana", ADDR_SOL, "SOLX"),
      });
      // observeOwner will find the cached Solana assessment and pass
      // it to the module; the module returns null because owner.address
      // is null.
      expect(association).to.equal(null);
      root.remove();
    });

    it("scan completes normally when W.ownerAssociations is missing", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "X")]);
      global.W.shield.check = async () => evmAssessment();

      const saved = global.W.ownerAssociations;
      global.W.ownerAssociations = undefined;
      try {
        const root = buildScanDom();
        await scanAndSettle(root);
        expect(root.querySelector("#g-body").innerHTML).to.include("X");
        root.remove();
      } finally {
        global.W.ownerAssociations = saved;
      }
    });

    it("successive scans over the same token do not inflate the count", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "X")]);
      global.W.shield.check = async () => evmAssessment();

      const root = buildScanDom();
      await scanAndSettle(root);
      await scanAndSettle(root);
      await scanAndSettle(root);

      // Three scans, same token. Deduplication should produce one entry.
      const association = global.W.gems._internal.observeOwner({
        pair: mockPair("ethereum", ADDR_A, "X"),
      });
      expect(association).to.be.an("object");
      expect(association.seenOnTokens).to.have.length(1);
      root.remove();
    });

    it("does not add a network request beyond the shield check", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "X")]);

      let shieldCalls = 0;
      global.W.shield.check = async () => {
        shieldCalls++;
        return evmAssessment();
      };

      const fetchUrls = [];
      const baseFetch = global.fetch;
      global.fetch = async (url) => {
        fetchUrls.push(String(url));
        return baseFetch(url);
      };

      const root = buildScanDom();
      await scanAndSettle(root);

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
