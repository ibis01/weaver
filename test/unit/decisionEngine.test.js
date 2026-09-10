const { expect } = require("chai");

describe("Decision Engine (Hardened)", () => {
  it("should compute personal context with enriched fields", () => {
    const decisionEngine = global.W.decisionEngine;
    const assetId = { symbol: "BTC" };
    const portfolio = [{ symbol: "BTC", value: 5000 }];
    const context = decisionEngine.computePersonalContext(
      assetId,
      portfolio,
      [],
      [],
      [],
      { pattern: "none" },
      {},
    );
    expect(context.portfolioWeight).to.be.a("number");
    expect(context.behavioralRisk).to.equal("NONE");
  });

  it("should compute assessment with portfolio-aware impact", () => {
    const decisionEngine = global.W.decisionEngine;
    const signal = {
      id: "s1",
      type: "PRICE_MOVE",
      assetId: { symbol: "BTC" },
      rawData: { impactValue: 0.8 },
    };
    const context = {
      portfolioWeight: 0.5,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 0,
      behavioralRisk: "NONE",
    };
    const evidence = { confidence: 0.9 };
    const assessment = decisionEngine.computeAssessment(
      signal,
      context,
      evidence,
    );
    expect(assessment.impact).to.be.a("number");
    expect(assessment.relevance).to.be.greaterThan(0);
  });

  it("should not produce REBALANCE action", () => {
    const decisionEngine = global.W.decisionEngine;
    const signal = { id: "s1", type: "PRICE_MOVE", assetId: { symbol: "BTC" } };
    const assessment = {
      relevance: 0.8,
      impact: 0.7,
      urgency: 0.6,
      confidence: 0.9,
    };
    const priority = decisionEngine.computeDecisionPriority(signal, assessment);
    expect(priority.recommendedAction).to.not.equal("REBALANCE");
    expect([
      "MONITOR",
      "REVIEW_THESIS",
      "REVIEW_RISK",
      "LOG_DECISION",
    ]).to.include(priority.recommendedAction);
    expect(priority.score).to.be.a("number");
  });
});
