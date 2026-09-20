const { expect } = require("chai");

const marketStructurePath =
  require.resolve("../../js/intelligence/market-structure.js");

describe("Market Structure — trajectory summarisation", () => {
  before(() => {
    delete require.cache[marketStructurePath];
    require(marketStructurePath);
  });

  function traj(overrides = {}) {
    return {
      concentration: {
        top10Pct: { change5m: null, change15m: null, change1h: null },
      },
      liquidity: { usd: { change5m: null, change15m: null, change1h: null } },
      holderCount: { change5m: null, change15m: null, change1h: null },
      ...overrides,
    };
  }

  function delta(percent, direction, absolute) {
    return { percent, direction, absolute: absolute ?? percent };
  }

  describe("summariseTrajectory", () => {
    const f = (t) => global.W.marketStructure.summariseTrajectory(t);

    it("returns null for null/undefined input", () => {
      expect(f(null)).to.equal(null);
      expect(f(undefined)).to.equal(null);
      expect(f("not an object")).to.equal(null);
    });

    it("returns null when no delta is available", () => {
      expect(f(traj())).to.equal(null);
    });

    it("returns null when all deltas are direction 'unknown'", () => {
      const t = traj({
        holderCount: {
          change5m: { percent: null, direction: "unknown", absolute: null },
        },
      });
      expect(f(t)).to.equal(null);
    });

    it("formats a 5m concentration delta with rising arrow", () => {
      const t = traj({
        concentration: {
          top10Pct: {
            change5m: delta(3.1, "rising"),
            change15m: null,
            change1h: null,
          },
        },
      });
      expect(f(t)).to.equal("Top 10 ↑ 3.1% 5m");
    });

    it("formats a falling delta with a downward arrow", () => {
      const t = traj({
        concentration: {
          top10Pct: {
            change5m: delta(-4.2, "falling"),
            change15m: null,
            change1h: null,
          },
        },
      });
      expect(f(t)).to.equal("Top 10 ↓ 4.2% 5m");
    });

    it("formats a stable delta with a neutral arrow", () => {
      const t = traj({
        holderCount: {
          change5m: { percent: 0.5, absolute: 2, direction: "stable" },
        },
      });
      expect(f(t)).to.equal("Holders → 2 5m");
    });

    it("formats a holder delta using the absolute value", () => {
      const t = traj({
        holderCount: {
          change5m: { percent: 20.5, absolute: 41, direction: "rising" },
        },
      });
      expect(f(t)).to.equal("Holders ↑ 41 5m");
    });

    it("formats a liquidity delta using the percentage", () => {
      const t = traj({
        liquidity: { usd: { change5m: delta(8.5, "rising") } },
      });
      expect(f(t)).to.equal("Liquidity ↑ 8.5% 5m");
    });

    it("combines multiple metrics in one string", () => {
      const t = traj({
        concentration: { top10Pct: { change5m: delta(3.1, "rising") } },
        holderCount: {
          change5m: { percent: 10, absolute: 12, direction: "rising" },
        },
        liquidity: { usd: { change5m: delta(-2, "falling") } },
      });
      expect(f(t)).to.equal(
        "Top 10 ↑ 3.1% 5m · Holders ↑ 12 5m · Liquidity ↓ 2.0% 5m",
      );
    });

    it("prefers the 5m interval over 15m and 1h", () => {
      const t = traj({
        concentration: {
          top10Pct: {
            change5m: delta(3.1, "rising"),
            change15m: delta(5.5, "rising"),
            change1h: delta(7.0, "rising"),
          },
        },
      });
      expect(f(t)).to.include("5m");
      expect(f(t)).to.not.include("15m");
      expect(f(t)).to.not.include("1h");
    });

    it("falls back to 15m when 5m is null", () => {
      const t = traj({
        concentration: {
          top10Pct: {
            change5m: { percent: null, direction: "unknown", absolute: null },
            change15m: delta(5.5, "rising"),
            change1h: null,
          },
        },
      });
      expect(f(t)).to.equal("Top 10 ↑ 5.5% 15m");
    });

    it("falls back to 1h when 5m and 15m are null", () => {
      const t = traj({
        concentration: {
          top10Pct: {
            change5m: null,
            change15m: null,
            change1h: delta(12.0, "rising"),
          },
        },
      });
      expect(f(t)).to.equal("Top 10 ↑ 12.0% 1h");
    });

    it("handles a missing metric without crashing", () => {
      const t = { concentration: { top10Pct: null } };
      expect(f(t)).to.equal(null);
    });
  });
});
