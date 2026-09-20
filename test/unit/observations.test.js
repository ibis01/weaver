// test/unit/observations.test.js
//
// Trajectory observations — storage and delta computation.
//
// Design reference: docs/trajectory-design.md

const { expect } = require("chai");

const observationsPath = require.resolve("../../js/storage/observations.js");

describe("Observations — time-series storage", () => {
  let originalStore;
  const CHAIN = "ethereum";
  const ADDR = "0xAbCdEf0000000000000000000000000000000001";

  before(() => {
    // Force-fresh load. Relying on test/setup.js or another test file
    // to load the module would make this suite order-dependent.
    delete require.cache[observationsPath];
    require(observationsPath);
    originalStore = global.W.store;
  });

  after(() => {
    global.W.store = originalStore;
  });

  beforeEach(() => {
    global.W.store.clearAll();
  });

  // ── Key normalization ──────────────────────────────────────

  describe("key normalization", () => {
    // Accessed via a function body, so the lookup defers until the
    // test runs — by which time before() has already loaded the
    // module.
    const k = (c, a) => global.W.observations._internal.key(c, a);

    it("lowercases EVM addresses", () => {
      expect(k("ethereum", ADDR)).to.equal(
        "obs:ethereum:" + ADDR.toLowerCase(),
      );
    });

    it("preserves Solana address case", () => {
      const sol = "SoMeBaSe58AdDrEsS1111111111111111111111111";
      expect(k("solana", sol)).to.equal("obs:solana:" + sol);
    });

    it("returns null for missing chain", () => {
      expect(k(null, ADDR)).to.equal(null);
      expect(k("", ADDR)).to.equal(null);
    });

    it("returns null for missing address", () => {
      expect(k("ethereum", null)).to.equal(null);
      expect(k("ethereum", "")).to.equal(null);
      expect(k("ethereum", "   ")).to.equal(null);
    });

    it("EVM and Solana keys for the same casing do not collide", () => {
      const evm = k("ethereum", ADDR);
      const base = k("base", ADDR);
      expect(evm).to.not.equal(base);
    });
  });

  // ── record / history round-trip ────────────────────────────

  describe("record and history", () => {
    const makeObs = (overrides = {}) => ({
      concentration: { top10Pct: 50 },
      liquidity: { usd: 100000 },
      holderCount: 100,
      source: "goplus-evm",
      methodologyVersion: "market-structure-v1",
      observedAt: Date.now(),
      ...overrides,
    });

    it("history returns [] for a key with no data", () => {
      expect(global.W.observations.history(CHAIN, ADDR)).to.deep.equal([]);
    });

    it("record then history returns the observation", () => {
      const obs = makeObs();
      const ok = global.W.observations.record(CHAIN, ADDR, obs);
      expect(ok).to.equal(true);

      const h = global.W.observations.history(CHAIN, ADDR);
      expect(h).to.have.length(1);
      expect(h[0].holderCount).to.equal(100);
    });

    it("record is idempotent for the same observedAt", () => {
      const t = Date.now();
      const a = makeObs({ observedAt: t, holderCount: 100 });
      const b = makeObs({ observedAt: t, holderCount: 999 });
      global.W.observations.record(CHAIN, ADDR, a);
      global.W.observations.record(CHAIN, ADDR, b);

      const h = global.W.observations.history(CHAIN, ADDR);
      expect(h).to.have.length(1);
      // First write wins — the second is treated as a duplicate.
      expect(h[0].holderCount).to.equal(100);
    });

    it("record returns false for an invalid observation", () => {
      expect(global.W.observations.record(CHAIN, ADDR, null)).to.equal(false);
      expect(global.W.observations.record(CHAIN, ADDR, {})).to.equal(false);
      expect(
        global.W.observations.record(CHAIN, ADDR, { observedAt: "now" }),
      ).to.equal(false);
    });

    it("record returns false for invalid key inputs", () => {
      expect(global.W.observations.record(null, ADDR, makeObs())).to.equal(
        false,
      );
      expect(global.W.observations.record(CHAIN, "", makeObs())).to.equal(
        false,
      );
    });

    it("history returns observations in ascending time order", () => {
      const now = Date.now();
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now - 10000, holderCount: 1 }),
      );
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now, holderCount: 3 }),
      );
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now - 5000, holderCount: 2 }),
      );

      const h = global.W.observations.history(CHAIN, ADDR);
      expect(h.map((o) => o.holderCount)).to.deep.equal([1, 2, 3]);
    });

    it("record clamps future timestamps to now", () => {
      const future = Date.now() + 60 * 60 * 1000;
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: future }),
      );
      const h = global.W.observations.history(CHAIN, ADDR);
      expect(h[0].observedAt).to.be.at.most(Date.now());
    });
  });

  // ── Retention ──────────────────────────────────────────────

  describe("retention", () => {
    const makeObs = (overrides = {}) => ({
      concentration: { top10Pct: 50 },
      liquidity: { usd: 100000 },
      holderCount: 100,
      source: "goplus-evm",
      methodologyVersion: "market-structure-v1",
      observedAt: Date.now(),
      ...overrides,
    });

    it("prunes observations older than the retention window", () => {
      const now = Date.now();
      const tooOld =
        now - (global.W.observations._internal.RETENTION_MS + 60_000);
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: tooOld, holderCount: 1 }),
      );
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now, holderCount: 2 }),
      );

      const h = global.W.observations.history(CHAIN, ADDR);
      expect(h).to.have.length(1);
      expect(h[0].holderCount).to.equal(2);
    });

    it("caps the number of retained observations", () => {
      const now = Date.now();
      const cap = global.W.observations._internal.MAX_OBSERVATIONS;
      // Insert cap + 5 observations, each 10 seconds apart.
      for (let i = 0; i < cap + 5; i++) {
        global.W.observations.record(
          CHAIN,
          ADDR,
          makeObs({ observedAt: now - (cap + 5 - i) * 10_000, holderCount: i }),
        );
      }
      const h = global.W.observations.history(CHAIN, ADDR);
      expect(h.length).to.be.at.most(cap);
      // The most recent observation must be preserved.
      expect(h[h.length - 1].holderCount).to.equal(cap + 4);
    });

    it("prune is a pure function over an array", () => {
      const now = Date.now();
      const list = [
        { observedAt: now - 10_000, holderCount: 1 },
        { observedAt: now - 60 * 60 * 1000 * 3, holderCount: 2 }, // 3h old
        { observedAt: now, holderCount: 3 },
      ];
      const pruned = global.W.observations._internal.prune(list, now);
      expect(pruned.map((o) => o.holderCount)).to.deep.equal([1, 3]);
    });
  });

  // ── trajectory ─────────────────────────────────────────────

  describe("trajectory", () => {
    const makeObs = (overrides = {}) => ({
      concentration: { top10Pct: 50 },
      liquidity: { usd: 100000 },
      holderCount: 100,
      source: "goplus-evm",
      methodologyVersion: "market-structure-v1",
      observedAt: Date.now(),
      ...overrides,
    });

    it("returns null for zero observations", () => {
      expect(global.W.observations.trajectory(CHAIN, ADDR)).to.equal(null);
    });

    it("returns null for a single observation", () => {
      global.W.observations.record(CHAIN, ADDR, makeObs());
      expect(global.W.observations.trajectory(CHAIN, ADDR)).to.equal(null);
    });

    it("computes deltas when observations span a matching interval", () => {
      const now = Date.now();
      // Two observations 5 minutes apart.
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({
          observedAt: now - 5 * 60 * 1000,
          concentration: { top10Pct: 40 },
          liquidity: { usd: 80000 },
          holderCount: 90,
        }),
      );
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({
          observedAt: now,
          concentration: { top10Pct: 50 },
          liquidity: { usd: 100000 },
          holderCount: 100,
        }),
      );

      const t = global.W.observations.trajectory(CHAIN, ADDR);
      expect(t).to.be.an("object");
      expect(t.window.sampleCount).to.equal(2);
      expect(t.methodologyVersion).to.equal("trajectory-v1");

      // 5m delta: 50 - 40 = 10 absolute, 25% percent.
      expect(t.concentration.top10Pct.change5m.absolute).to.equal(10);
      expect(t.concentration.top10Pct.change5m.percent).to.be.closeTo(25, 0.01);
      expect(t.concentration.top10Pct.change5m.direction).to.equal("rising");
    });

    it("returns null delta when no observation falls within tolerance", () => {
      const now = Date.now();
      // Only two observations: one 5m ago, one now. The 15m and 1h
      // windows have no observation within half-interval tolerance.
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now - 5 * 60 * 1000 }),
      );
      global.W.observations.record(CHAIN, ADDR, makeObs({ observedAt: now }));

      const t = global.W.observations.trajectory(CHAIN, ADDR);
      expect(t.concentration.top10Pct.change15m.absolute).to.equal(null);
      expect(t.concentration.top10Pct.change15m.percent).to.equal(null);
      expect(t.concentration.top10Pct.change15m.direction).to.equal("unknown");
      expect(t.concentration.top10Pct.change1h.absolute).to.equal(null);
    });

    it("exposes the current value even when no delta is computable", () => {
      const now = Date.now();
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now - 60 * 60 * 1000, holderCount: 50 }),
      );
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now, holderCount: 75 }),
      );

      const t = global.W.observations.trajectory(CHAIN, ADDR);
      expect(t.holderCount.current).to.equal(75);
      // 1h delta exists: 75 - 50 = 25, 50%.
      expect(t.holderCount.change1h.absolute).to.equal(25);
      expect(t.holderCount.change1h.direction).to.equal("rising");
    });

    it("reports null for missing metric fields without crashing", () => {
      const now = Date.now();
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now - 60_000, holderCount: undefined }),
      );
      global.W.observations.record(
        CHAIN,
        ADDR,
        makeObs({ observedAt: now, holderCount: undefined }),
      );

      const t = global.W.observations.trajectory(CHAIN, ADDR);
      expect(t.holderCount.current).to.equal(null);
      expect(t.holderCount.change5m.absolute).to.equal(null);
      expect(t.holderCount.change5m.direction).to.equal("unknown");
    });
  });

  // ── directionFor ───────────────────────────────────────────

  describe("directionFor", () => {
    // Deferred lookup: the outer before() loads the module before
    // any hook in this describe body runs, but the describe body
    // itself evaluates first. Accessing _internal here at describe
    // time would throw.
    let f;
    before(() => {
      f = global.W.observations._internal.directionFor;
    });

    it("returns 'unknown' for null/NaN", () => {
      expect(f(null)).to.equal("unknown");
      expect(f(undefined)).to.equal("unknown");
      expect(f(NaN)).to.equal("unknown");
    });

    it("returns 'stable' for small percentage changes", () => {
      expect(f(0)).to.equal("stable");
      expect(f(1.9)).to.equal("stable");
      expect(f(-1.9)).to.equal("stable");
    });

    it("returns 'rising' for positive changes beyond threshold", () => {
      expect(f(2)).to.equal("rising");
      expect(f(50)).to.equal("rising");
    });

    it("returns 'falling' for negative changes beyond threshold", () => {
      expect(f(-2)).to.equal("falling");
      expect(f(-50)).to.equal("falling");
    });
  });

  // ── clear ──────────────────────────────────────────────────

  describe("clear", () => {
    it("removes a token's history", () => {
      global.W.observations.record(CHAIN, ADDR, {
        observedAt: Date.now(),
        holderCount: 1,
      });
      expect(global.W.observations.history(CHAIN, ADDR)).to.have.length(1);

      const ok = global.W.observations.clear(CHAIN, ADDR);
      expect(ok).to.equal(true);
      expect(global.W.observations.history(CHAIN, ADDR)).to.deep.equal([]);
    });
  });

  // ── Failure isolation ──────────────────────────────────────

  describe("failure isolation", () => {
    it("record returns false and does not throw when W.store.set throws", () => {
      const saved = global.W.store.set;
      global.W.store.set = () => {
        throw new Error("simulated quota exceeded");
      };
      try {
        const ok = global.W.observations.record(CHAIN, ADDR, {
          observedAt: Date.now(),
          holderCount: 1,
        });
        expect(ok).to.equal(false);
      } finally {
        global.W.store.set = saved;
      }
    });

    it("history returns [] and does not throw when W.store.get throws", () => {
      const saved = global.W.store.get;
      global.W.store.get = () => {
        throw new Error("simulated read error");
      };
      try {
        expect(global.W.observations.history(CHAIN, ADDR)).to.deep.equal([]);
      } finally {
        global.W.store.get = saved;
      }
    });
  });
});
