const { expect } = require("chai");

require("../../js/intelligence/market-structure.js");

describe("Market Structure — observations", () => {
  function evmAssessment(overrides = {}) {
    return {
      riskScore: 20,
      riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
      scoreVersion: "shield-evm-v1",
      flags: {
        isHoneypot: false,
        isMintable: false,
        isProxy: false,
        isOwnerRenounced: true,
        isLpLocked: true,
      },
      buyTax: "0.0",
      sellTax: "0.0",
      holders: {
        count: 241,
        top10: [
          { address: "0xa", percent: 12.5, isContract: false, isLocked: false },
          { address: "0xb", percent: 8.3, isContract: false, isLocked: false },
        ],
        top10Pct: 51.2,
        lpCount: 3,
        lockedLpCount: 2,
        hasLockedLp: true,
        source: "goplus-evm",
      },
      ...overrides,
    };
  }

  const pair = {
    liquidity: { usd: 61000 },
    volume: { h24: 78000 },
  };

  describe("observe", () => {
    it("returns null for a missing assessment", () => {
      expect(W.marketStructure.observe(null, pair)).to.equal(null);
    });

    it("produces a well-shaped observation for a complete EVM assessment", () => {
      const o = W.marketStructure.observe(evmAssessment(), pair);
      expect(o.concentration.top10Pct).to.equal(51.2);
      expect(o.concentration.status).to.equal("moderate");
      expect(o.liquidity.usd).to.equal(61000);
      expect(o.liquidity.status).to.equal("locked");
      expect(o.holderCount).to.equal(241);
      expect(o.source).to.equal("goplus-evm");
      expect(o.methodologyVersion).to.equal("market-structure-v1");
      expect(o.observedAt).to.be.a("number");
    });

    it("classifies concentration as 'concentrated' when top10 >= 60%", () => {
      const a = evmAssessment();
      a.holders.top10Pct = 72;
      const o = W.marketStructure.observe(a, pair);
      expect(o.concentration.status).to.equal("concentrated");
    });

    it("classifies concentration as 'distributed' when top10 < 30%", () => {
      const a = evmAssessment();
      a.holders.top10Pct = 15;
      const o = W.marketStructure.observe(a, pair);
      expect(o.concentration.status).to.equal("distributed");
    });

    it("returns 'unknown' concentration when top10Pct is missing", () => {
      const a = evmAssessment();
      a.holders.top10Pct = null;
      const o = W.marketStructure.observe(a, pair);
      expect(o.concentration.top10Pct).to.equal(null);
      expect(o.concentration.status).to.equal("unknown");
    });

    it("returns 'unknown' liquidity when hasLockedLp is missing", () => {
      const a = evmAssessment();
      a.holders.hasLockedLp = null;
      const o = W.marketStructure.observe(a, pair);
      expect(o.liquidity.status).to.equal("unknown");
    });

    it("returns 'unlocked' liquidity when hasLockedLp is false", () => {
      const a = evmAssessment();
      a.holders.hasLockedLp = false;
      const o = W.marketStructure.observe(a, pair);
      expect(o.liquidity.status).to.equal("unlocked");
    });

    it("handles a Solana-shaped assessment without fabricating data", () => {
      const solana = {
        riskScore: 15,
        scoreVersion: "shield-solana-v1",
        flags: {
          mintable: { active: false },
          freezable: { active: false },
          balanceMutable: { active: false },
        },
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
      const o = W.marketStructure.observe(solana, pair);
      expect(o.concentration.top10Pct).to.equal(null);
      expect(o.concentration.status).to.equal("unknown");
      expect(o.liquidity.status).to.equal("unknown");
      expect(o.source).to.equal("unavailable");
      // The Solana flags should still flow through.
      expect(o.flags.mintable).to.equal(false);
      expect(o.flags.freezable).to.equal(false);
    });

    it("never fabricates a status from missing data", () => {
      const empty = { flags: {} };
      const o = W.marketStructure.observe(empty, pair);
      expect(o.concentration.status).to.equal("unknown");
      expect(o.liquidity.status).to.equal("unknown");
      expect(o.holderCount).to.equal(null);
      expect(o.source).to.equal("unavailable");
    });

    it("preserves liquidity usd when the pair supplies it", () => {
      const o = W.marketStructure.observe(evmAssessment(), {
        liquidity: { usd: 12345.67 },
      });
      expect(o.liquidity.usd).to.equal(12345.67);
    });

    it("sets liquidity usd to null when the pair omits it", () => {
      const o = W.marketStructure.observe(evmAssessment(), {});
      expect(o.liquidity.usd).to.equal(null);
    });
  });

  describe("summarise", () => {
    it("produces a human-readable one-line summary", () => {
      const o = W.marketStructure.observe(evmAssessment(), pair);
      const s = W.marketStructure.summarise(o);
      expect(s).to.include("Top 10 hold 51.2%");
      expect(s).to.include("LP locked");
    });

    it("states unknown for missing concentration rather than guessing", () => {
      const a = evmAssessment();
      a.holders.top10Pct = null;
      a.holders.hasLockedLp = null;
      const s = W.marketStructure.summarise(W.marketStructure.observe(a, pair));
      expect(s).to.include("Holder concentration: unknown");
      expect(s).to.include("LP lock: unknown");
    });

    it("returns null for a missing observation", () => {
      expect(W.marketStructure.summarise(null)).to.equal(null);
    });
  });

  describe("concentrationStatus", () => {
    const f = W.marketStructure._internal.concentrationStatus;
    it("returns 'unknown' for non-finite input", () => {
      expect(f(null)).to.equal("unknown");
      expect(f(undefined)).to.equal("unknown");
      expect(f(NaN)).to.equal("unknown");
    });
    it("buckets finite values correctly at boundaries", () => {
      expect(f(0)).to.equal("distributed");
      expect(f(29.99)).to.equal("distributed");
      expect(f(30)).to.equal("moderate");
      expect(f(59.99)).to.equal("moderate");
      expect(f(60)).to.equal("concentrated");
      expect(f(100)).to.equal("concentrated");
    });
  });
});
