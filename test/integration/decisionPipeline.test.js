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
    expect(priority.methodologyVersion).to.equal("decision-engine-v1");
    expect(priority.explanation).to.include("Confidence: 90%");
    expect(priority.recommendedAction).to.be.oneOf([
      "REVIEW_RISK",
      "REVIEW_THESIS",
      "LOG_DECISION",
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
    expect(priority.score).to.equal(0);
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

    expect(priority.recommendedAction).to.equal("REVIEW_RISK");
    expect(priority.recommendedAction).to.not.be.oneOf([
      "BUY",
      "SELL",
      "EXECUTE_TRADE",
    ]);
  });
});

console.log("✅ Decision pipeline integration fixtures loaded.");
