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

  // Every scenario below calls run() or computeAssessment() against
  // shared state. Clear the 60s TTL cache before each test so a
  // previous scenario cannot leak its result forward.
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

    // decision-engine-v2 uses canonical actions: MONITOR, REVIEW, ACT, EXIT, IGNORE
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

    // decision-engine-v2 correctly maps risk signals to "REVIEW"
    expect(priority.recommendedAction).to.equal("REVIEW");
    expect(priority.recommendedAction).to.not.be.oneOf([
      "BUY",
      "SELL",
      "EXECUTE_TRADE",
    ]);
  });

  // ── Scenario E: the empty-profile pipeline ─────────────────────
  //
  // Regression guard for the relevance-collapse bug. Before the fix:
  // an empty profile produced relevance 0, score 0, and the
  // `score > 0` filter in run() dropped the decision with no
  // warning. A REGIME_SHIFT signal — which is information about the
  // market environment, not about a position — was therefore
  // invisible to any user without a portfolio.
  //
  // This scenario is the first test in the suite that calls run()
  // end to end. The four scenarios above verify computeAssessment
  // and computeDecisionPriority in isolation; none of them exercise
  // the filter at the tail of run(), which is where the bug lived.
  describe("Scenario E: empty-profile pipeline", () => {
    let saved;

    beforeEach(() => {
      // Snapshot the globals this scenario overwrites so a failed
      // assertion cannot leak stub state into other spec files.
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
      // Restore in reverse order of assignment, tolerating deletes
      // (a key that was undefined before the test should be
      // undefined after, not left as a stale stub).
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
      // Empty profile — the state every new user starts in, and the
      // state in which relevance collapses to 0 without a baseline.
      W.portfolio = { all: () => [] };
      W.watchlist = { list: () => [] };
      W.theses = { all: () => [] };
      W.journal = { all: () => [] };
      W.behavior = { analyze: () => ({ pattern: "none" }) };
      W.store = { get: () => ({}) };

      // Trivial signal contract for this test — the shape validation
      // of a real signal is exercised by types.js's own unit tests.
      W.intelligence = {
        is: { signal: () => true },
      };

      // Well-formed evidence with a finite confidence, so the
      // assessment path is fully determined. The regime signal
      // below produces: relevance = 0.3 (baseline), confidence =
      // 0.53, impact ≈ 0.53 * 0.53 * 0.2, urgency = 0.5.
      // Score ≈ 0.0045, comfortably above the `score > 0` filter.
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

      // Before the fix, this array was empty: relevance was 0, the
      // score was 0, and the `score > 0` filter in run() dropped the
      // decision silently.
      expect(decisions).to.have.lengthOf(1);
      expect(decisions[0]._signalType).to.equal("REGIME_SHIFT");
      expect(decisions[0].eligibility).to.equal("ELIGIBLE");
      expect(decisions[0].score).to.be.greaterThan(0);
      expect(decisions[0].recommendedAction).to.be.oneOf(["MONITOR", "REVIEW"]);
    });

    it("an asset-specific signal without a match is still dropped, and that is intentional", async () => {
      // Counterpart to the test above. The baseline relevance is
      // for market-wide types only; an UNLOCK on an asset the user
      // does not hold has relevance 0, score 0, and is correctly
      // filtered out. This guard ensures the fix did not become
      // "keep everything" by accident.
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

      // An UNLOCK for an unheld, unwatched, unthesised asset does
      // not concern this user. Relevance is 0, score is 0, filter
      // drops it. That behaviour is deliberate.
      expect(decisions).to.have.lengthOf(0);
    });
  });
});

console.log("✅ Decision pipeline integration fixtures loaded.");
