const { expect } = require("chai");

// Load the production decision engine into the shared JSDOM test runtime.
global.window.W = global.W;
require("../../js/intelligence/decision-engine.js");

describe("Decision Pipeline Scenarios", () => {
  const asset = { id: "bitcoin", symbol: "BTC" };

  function makeSignal(overrides = {}) {
    return {
      id: "signal-1",
      type: "PRICE_MOVE",
      source: "coingecko",
      timestamp: Date.now(),
      assetId: asset,
      rawData: {
        price_change_percentage_24h: 12,
        impactValue: 0.9,
        title: "BTC moved sharply",
      },
      ...overrides,
    };
  }

  function context(overrides = {}) {
    return {
      assetId: asset,
      portfolioWeight: 0.8,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 0,
      behavioralRisk: "NONE",
      riskLimit: 0.5,
      timeHorizon: "medium",
      thesisHealth: 80,
      decisionConfidence: null,
      chainExposure: 0,
      sectorExposure: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    if (W.decisionEngine && W.decisionEngine.clearCache) {
      W.decisionEngine.clearCache();
    }
  });

  it("Scenario A: strong evidence produces a positive, explainable priority", () => {
    const evidence = { confidence: 0.9 };
    const assessment = W.decisionEngine.computeAssessment(
      makeSignal(),
      context(),
      evidence,
    );
    const priority = W.decisionEngine.computeDecisionPriority(
      makeSignal(),
      assessment,
    );

    expect(assessment.confidence).to.equal(0.9);
    expect(assessment.impact).to.be.greaterThan(0.6);
    expect(priority.score).to.be.greaterThan(0);
    expect(priority.eligibility).to.equal("ELIGIBLE");
    expect(priority.methodologyVersion).to.equal("decision-engine-v2");
    expect(priority.explanation).to.include("Confidence: 90%");

    expect(priority.recommendedAction).to.be.oneOf([
      "REVIEW",
      "ACT",
      "MONITOR",
    ]);
  });

  it("Scenario B: conflicting evidence remains visible through lower confidence", () => {
    const evidence = { confidence: 0.25 };
    const assessment = W.decisionEngine.computeAssessment(
      makeSignal({
        rawData: {
          price_change_percentage_24h: -12,
          impactValue: 0.9,
          title: "Conflicting move",
        },
      }),
      context(),
      evidence,
    );
    const priority = W.decisionEngine.computeDecisionPriority(
      makeSignal(),
      assessment,
    );

    expect(assessment.confidence).to.equal(0.25);
    expect(priority.score).to.be.lessThan(0.1);
    expect(priority.explanation).to.include("Confidence: 25%");
  });

  it("Scenario C: insufficient evidence never fabricates confidence", () => {
    const assessment = W.decisionEngine.computeAssessment(
      makeSignal(),
      context(),
      { confidence: null },
    );
    const priority = W.decisionEngine.computeDecisionPriority(
      makeSignal(),
      assessment,
    );

    expect(assessment.confidence).to.equal(null);
    expect(assessment.impact).to.equal(null);
    expect(priority.score).to.equal(null);
    expect(priority.eligibility).to.equal("INSUFFICIENT_EVIDENCE");
    expect(priority.explanation).to.include("Confidence: unavailable");
    expect(priority.recommendedAction).to.equal("MONITOR");
  });

  it("Scenario D: a high-impact risk signal recommends review, not an automatic trade", () => {
    const signal = makeSignal({
      type: "SECURITY_RISK",
      rawData: { impactValue: 1, title: "Contract risk detected" },
    });
    const assessment = W.decisionEngine.computeAssessment(signal, context(), {
      confidence: 0.95,
    });
    const priority = W.decisionEngine.computeDecisionPriority(
      signal,
      assessment,
    );

    expect(priority.recommendedAction).to.equal("REVIEW");
    expect(priority.recommendedAction).to.not.be.oneOf([
      "BUY",
      "SELL",
      "EXECUTE_TRADE",
    ]);
  });

  // ── Scenario E: the empty-profile pipeline ─────────────────────
  describe("Scenario E: empty-profile pipeline", () => {
    let saved;

    beforeEach(() => {
      saved = {
        portfolio: W.portfolio,
        watchlist: W.watchlist,
        theses: W.theses,
        journal: W.journal,
        behavior: W.behavior,
        store: W.store,
        events: W.events,
        evidence: W.evidence,
        intelligence: W.intelligence,
      };
    });

    afterEach(() => {
      const keys = [
        "portfolio",
        "watchlist",
        "theses",
        "journal",
        "behavior",
        "store",
        "events",
        "evidence",
        "intelligence",
      ];
      for (const k of keys) {
        if (saved[k] === undefined) delete W[k];
        else W[k] = saved[k];
      }
      if (W.decisionEngine && W.decisionEngine.clearCache) {
        W.decisionEngine.clearCache();
      }
    });

    it("a market-wide signal survives an empty profile and appears in run()", async () => {
      W.portfolio = { all: () => [] };
      W.watchlist = { list: () => [] };
      W.theses = { all: () => [] };
      W.journal = { all: () => [] };
      W.behavior = { analyze: () => ({ pattern: "none" }) };
      W.store = { get: () => ({}) };

      W.intelligence = {
        is: { signal: () => true },
      };

      W.evidence = {
        build: () => ({ confidence: 0.53, incomplete: false, reasoning: [] }),
      };

      const regime = {
        id: "sig-regime-1",
        type: "REGIME_SHIFT",
        source: "weaver_regime",
        timestamp: Date.now(),
        assetId: {
          chainId: "unknown",
          contractAddress: null,
          symbol: "BTC",
          coingeckoId: null,
          name: "BTC",
        },
        rawData: {
          title: "Market Regime Shift: TRANSITION",
          impactValue: 0.53,
          dataCompleteness: 1,
          interpretationConfidence: 0.53,
        },
        metadata: {
          corroborationCount: 1,
          dataCompleteness: 1,
          interpretationConfidence: 0.53,
        },
      };
      W.events = { collectEvents: async () => [regime] };

      const decisions = await W.decisionEngine.run();

      expect(decisions).to.have.lengthOf(1);
      expect(decisions[0]._signalType).to.equal("REGIME_SHIFT");
      expect(decisions[0].eligibility).to.equal("ELIGIBLE");
      expect(decisions[0].score).to.be.greaterThan(0);
      expect(decisions[0].recommendedAction).to.be.oneOf(["MONITOR", "REVIEW"]);
    });

    it("an asset-specific signal without a match is still dropped, and that is intentional", async () => {
      W.portfolio = { all: () => [] };
      W.watchlist = { list: () => [] };
      W.theses = { all: () => [] };
      W.journal = { all: () => [] };
      W.behavior = { analyze: () => ({ pattern: "none" }) };
      W.store = { get: () => ({}) };
      W.intelligence = { is: { signal: () => true } };
      W.evidence = {
        build: () => ({ confidence: 0.5, incomplete: false, reasoning: [] }),
      };

      const unlock = {
        id: "sig-unlock-1",
        type: "UNLOCK",
        source: "token_unlocks",
        timestamp: Date.now(),
        assetId: {
          chainId: "unknown",
          contractAddress: null,
          symbol: "ARB",
          coingeckoId: "arbitrum",
          name: "Arbitrum",
        },
        rawData: {
          title: "Arbitrum Unlock: 92,000,000",
          impactValue: 0.6,
          dataCompleteness: 1,
          interpretationConfidence: 0.5,
        },
        metadata: {
          corroborationCount: 1,
          dataCompleteness: 1,
          interpretationConfidence: 0.5,
        },
      };
      W.events = { collectEvents: async () => [unlock] };

      const decisions = await W.decisionEngine.run();

      expect(decisions).to.have.lengthOf(0);
    });
  });

  // ── Scenario F: PRICE_MOVE tier gating ────────────────────────
  describe("Scenario F: PRICE_MOVE tier gating", () => {
    let saved;

    beforeEach(() => {
      saved = {
        portfolio: W.portfolio,
        watchlist: W.watchlist,
        theses: W.theses,
        journal: W.journal,
        behavior: W.behavior,
        store: W.store,
        events: W.events,
        evidence: W.evidence,
        intelligence: W.intelligence,
      };

      W.portfolio = { all: () => [] };
      W.watchlist = { list: () => [] };
      W.theses = { all: () => [] };
      W.journal = { all: () => [] };
      W.behavior = { analyze: () => ({ pattern: "none" }) };
      W.store = { get: () => ({}) };
      W.intelligence = { is: { signal: () => true } };
      W.evidence = {
        build: () => ({ confidence: 0.7, incomplete: false, reasoning: [] }),
      };
    });

    afterEach(() => {
      const keys = [
        "portfolio",
        "watchlist",
        "theses",
        "journal",
        "behavior",
        "store",
        "events",
        "evidence",
        "intelligence",
      ];
      for (const k of keys) {
        if (saved[k] === undefined) delete W[k];
        else W[k] = saved[k];
      }
      if (W.decisionEngine && W.decisionEngine.clearCache) {
        W.decisionEngine.clearCache();
      }
    });

    function priceMove(symbol, coingeckoId, tier, changePct) {
      return {
        id: `price-${symbol}-${tier}`,
        type: "PRICE_MOVE",
        source: "market_scanner",
        timestamp: Date.now(),
        assetId: {
          chainId: "unknown",
          contractAddress: null,
          symbol,
          coingeckoId,
          name: symbol,
        },
        rawData: {
          title: `${symbol} moved ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% in 24h`,
          impactValue: Math.min(1, Math.abs(changePct) / 15),
          marketCapTier: tier,
          price_change_percentage_24h: changePct,
          dataCompleteness: 0.9,
          interpretationConfidence: 0.7,
        },
        metadata: {
          corroborationCount: 1,
          dataCompleteness: 0.9,
          interpretationConfidence: 0.7,
        },
      };
    }

    it("a major-cap price move surfaces for an empty profile", async () => {
      W.events = {
        collectEvents: async () => [priceMove("BTC", "bitcoin", "major", -5.2)],
      };

      const decisions = await W.decisionEngine.run();

      expect(decisions).to.have.lengthOf(1);
      expect(decisions[0]._signalType).to.equal("PRICE_MOVE");
      expect(decisions[0].eligibility).to.equal("ELIGIBLE");
      expect(decisions[0].score).to.be.greaterThan(0);
    });

    it("a mid-cap price move of the same size is correctly filtered out", async () => {
      W.events = {
        collectEvents: async () => [priceMove("ARB", "arbitrum", "mid", -5.2)],
      };

      const decisions = await W.decisionEngine.run();

      expect(decisions).to.have.lengthOf(0);
    });

    it("isMarketWide is exposed and matches the documented rule", () => {
      const f = W.decisionEngine._internal.isMarketWide;
      expect(typeof f).to.equal("function");

      expect(f({ type: "REGIME_SHIFT" })).to.equal(true);
      expect(f({ type: "UNLOCK" })).to.equal(false);

      expect(
        f({ type: "PRICE_MOVE", rawData: { marketCapTier: "major" } }),
      ).to.equal(true);
      expect(
        f({ type: "PRICE_MOVE", rawData: { marketCapTier: "mid" } }),
      ).to.equal(false);
      expect(
        f({ type: "PRICE_MOVE", rawData: { marketCapTier: "small" } }),
      ).to.equal(false);
      expect(f({ type: "PRICE_MOVE" })).to.equal(false);
    });
  });

  // ── Scenario G: PRICE_MOVE scanner gates ──────────────────────
  describe("Scenario G: PRICE_MOVE scanner gates", () => {
    let savedEvents;

    beforeEach(() => {
      savedEvents = W.events;
      // Load the production events module. It may already be loaded
      // in a prior spec; requiring again is idempotent because the
      // module overwrites W.events.
      global.window.W = global.W;
      require("../../js/intelligence/events.js");
    });

    afterEach(() => {
      if (savedEvents === undefined) delete W.events;
      else W.events = savedEvents;
    });

    function makeUniverse(count, opts = {}) {
      const markets = [];
      for (let i = 0; i < count; i++) {
        markets.push({
          id: `coin${i}`,
          symbol: `C${i}`,
          name: `Coin ${i}`,
          current_price: 1,
          price_change_percentage_24h: opts.change ?? 1,
          market_cap: opts.cap ?? 2e9,
          total_volume: opts.volume ?? 1e8,
        });
      }
      return markets;
    }

    it("cross-sectional z fires on a move against a calm market", () => {
      // Universe: fifteen assets at +0.5%, one major at -3.5%.
      // The major clears its 3% floor and its z is far below the
      // mean — a real market dislocation.
      const markets = makeUniverse(15, { change: 0.5, cap: 2e9 });
      markets.push({
        id: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        current_price: 60000,
        price_change_percentage_24h: -3.5,
        market_cap: 1.2e12,
        total_volume: 5e9,
      });

      const events = W.events._internal.collectPriceEvents(markets);
      const btc = events.find((e) => e.assetId.symbol === "BTC");
      expect(btc).to.exist;
      expect(btc.rawData.marketCapTier).to.equal("major");
      expect(btc.rawData.zScore).to.be.lessThan(-2.0);
    });

    it("volume confirmation suppresses a move on thin volume", () => {
      const markets = makeUniverse(15, { change: 1, cap: 2e9 });
      // One asset moves 20% on 0.1× average volume.
      markets.push({
        id: "thin",
        symbol: "THIN",
        name: "Thin",
        current_price: 1,
        price_change_percentage_24h: 20,
        market_cap: 5e8,
        total_volume: 1e7,
      });

      const events = W.events._internal.collectPriceEvents(markets);
      const thin = events.find((e) => e.assetId.symbol === "THIN");
      expect(thin).to.not.exist;
    });

    it("emission is capped at MAX_PRICE_MOVE_EVENTS", () => {
      const markets = [];
      for (let i = 0; i < 30; i++) {
        markets.push({
          id: `major${i}`,
          symbol: `M${i}`,
          name: `Major ${i}`,
          current_price: 100,
          price_change_percentage_24h: 15 - i * 0.1,
          market_cap: 2e10,
          total_volume: 1e9,
        });
      }
      const events = W.events._internal.collectPriceEvents(markets);
      expect(events.length).to.be.at.most(
        W.events._internal.MAX_PRICE_MOVE_EVENTS,
      );
    });

    it("_distribution returns null below MIN_SCANNED_UNIVERSE", () => {
      const small = W.events._internal._distribution([1, 2, 3, 4, 5]);
      expect(small).to.equal(null);
    });

    it("_distribution returns mean and std for a valid population", () => {
      const d = W.events._internal._distribution([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
      expect(d).to.not.equal(null);
      expect(d.n).to.equal(12);
      expect(d.mean).to.equal(6.5);
      expect(d.std).to.be.greaterThan(0);
    });
  });
});

console.log("✅ Decision pipeline integration fixtures loaded.");
