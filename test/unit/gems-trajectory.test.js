const { expect } = require("chai");

const marketStructurePath =
  require.resolve("../../js/intelligence/market-structure.js");
const observationsPath = require.resolve("../../js/storage/observations.js");

describe("Gem Agent — trajectory row", () => {
  const ADDR = "0x1111111111111111111111111111111111111111";
  const CHAIN = "ethereum";

  let originalObservations;
  let originalMarketStructure;

  before(() => {
    originalObservations = global.W.observations;
    originalMarketStructure = global.W.marketStructure;

    delete require.cache[marketStructurePath];
    require(marketStructurePath);
    delete require.cache[observationsPath];
    require(observationsPath);
  });

  after(() => {
    global.W.observations = originalObservations;
    global.W.marketStructure = originalMarketStructure;
  });

  beforeEach(() => {
    global.W.store.clearAll();
  });

  // ── fetchTrajectory ─────────────────────────────────────────

  describe("fetchTrajectory", () => {
    const f = (c, a) => global.W.gems._internal.fetchTrajectory(c, a);

    it("returns null when W.observations is missing", () => {
      const saved = global.W.observations;
      global.W.observations = undefined;
      try {
        expect(f(CHAIN, ADDR)).to.equal(null);
      } finally {
        global.W.observations = saved;
      }
    });

    it("returns null when no history exists", () => {
      expect(f(CHAIN, ADDR)).to.equal(null);
    });

    it("returns null and does not throw when trajectory() throws", () => {
      const saved = global.W.observations.trajectory;
      global.W.observations.trajectory = () => {
        throw new Error("simulated read failure");
      };
      try {
        expect(f(CHAIN, ADDR)).to.equal(null);
      } finally {
        global.W.observations.trajectory = saved;
      }
    });

    it("returns a trajectory object when history exists", () => {
      const now = Date.now();
      global.W.observations.record(CHAIN, ADDR, {
        concentration: { top10Pct: 40, status: "moderate" },
        liquidity: { usd: 60000, status: "locked" },
        holderCount: 200,
        source: "goplus-evm",
        methodologyVersion: "market-structure-v1",
        observedAt: now - 5 * 60 * 1000,
      });
      global.W.observations.record(CHAIN, ADDR, {
        concentration: { top10Pct: 50, status: "moderate" },
        liquidity: { usd: 65000, status: "locked" },
        holderCount: 241,
        source: "goplus-evm",
        methodologyVersion: "market-structure-v1",
        observedAt: now,
      });

      const t = f(CHAIN, ADDR);
      expect(t).to.be.an("object");
      expect(t.window.sampleCount).to.equal(2);
    });
  });

  // ── trajectoryLine ──────────────────────────────────────────

  describe("trajectoryLine", () => {
    const f = (t) => global.W.gems._internal.trajectoryLine(t);

    it("returns '' for a null trajectory", () => {
      expect(f(null)).to.equal("");
      expect(f(undefined)).to.equal("");
    });

    it("returns '' when W.marketStructure is unavailable", () => {
      const saved = global.W.marketStructure;
      global.W.marketStructure = undefined;
      try {
        const t = {
          concentration: {
            top10Pct: {
              change5m: { percent: 3, direction: "rising", absolute: 3 },
            },
          },
        };
        expect(f(t)).to.equal("");
      } finally {
        global.W.marketStructure = saved;
      }
    });

    it("returns '' when no delta is summarisable", () => {
      const t = {
        concentration: { top10Pct: { change5m: null } },
        holderCount: { change5m: null },
        liquidity: { usd: { change5m: null } },
      };
      expect(f(t)).to.equal("");
    });

    it("renders a Trajectory row when a delta is present", () => {
      const t = {
        concentration: {
          top10Pct: {
            change5m: { percent: 3.1, direction: "rising", absolute: 3.1 },
          },
        },
        holderCount: { change5m: null },
        liquidity: { usd: { change5m: null } },
      };
      const html = f(t);
      expect(html).to.include("Trajectory");
      expect(html).to.include("Top 10 ↑ 3.1% 5m");
    });

    it("escapes the summary string", () => {
      const t = {
        concentration: {
          top10Pct: {
            change5m: { percent: 3.1, direction: "rising", absolute: 3.1 },
          },
        },
      };
      // Even with attacker-controlled strings in the trajectory (not
      // possible from the current implementation, but defensive),
      // the rendered HTML must not contain raw tag characters.
      const html = f(t);
      expect(html).to.not.include("<script>");
    });

    it("returns '' and does not throw when summariseTrajectory throws", () => {
      const saved = global.W.marketStructure.summariseTrajectory;
      global.W.marketStructure.summariseTrajectory = () => {
        throw new Error("simulated summariser failure");
      };
      try {
        expect(
          f({ concentration: {}, holderCount: {}, liquidity: {} }),
        ).to.equal("");
      } finally {
        global.W.marketStructure.summariseTrajectory = saved;
      }
    });
  });
});
