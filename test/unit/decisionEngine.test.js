const { expect } = require("chai");

describe("Decision Engine (Hardened)", () => {
  it("should compute personal context with enriched fields", () => {
    const assetId = { symbol: "BTC" };
    const portfolio = [
      { symbol: "BTC", value: 5000 },
      { symbol: "ETH", value: 5000 },
    ];
    const watchlist = ["BTC"];
    const theses = [{ symbol: "BTC", status: "active" }];
    const journal = [{ asset: "BTC", timestamp: Date.now() }];
    const behavior = { pattern: "none" };
    const settings = { riskLimit: 0.7, timeHorizon: "long" };

    const context = W.decisionEngine.computePersonalContext(
      assetId,
      portfolio,
      watchlist,
      theses,
      journal,
      behavior,
      settings,
    );
    expect(context.portfolioWeight).to.equal(0.5);
    expect(context.watchlistStatus).to.equal("WATCHING");
    expect(context.thesisStatus).to.equal("ACTIVE");
    expect(context.recentDecisions).to.equal(1);
    expect(context.riskLimit).to.equal(0.7);
    expect(context.timeHorizon).to.equal("long");
  });

  it("should compute assessment with portfolio-aware impact", () => {
    const signal = {
      type: "PRICE_MOVE",
      rawData: { impactValue: 0.8, price_change_percentage_24h: 5 },
    };
    const personalContext = {
      portfolioWeight: 0.2,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 1,
      behavioralRisk: "NONE",
    };
    const evidence = { confidence: 0.85 };
    const assessment = W.decisionEngine.computeAssessment(
      signal,
      personalContext,
      evidence,
    );
    expect(assessment.impact).to.be.closeTo(0.85 * 0.8 * (0.2 * 2 + 0.2), 0.01);
    expect(assessment.relevance).to.be.above(0.5);
  });

  it("should not produce REBALANCE action", () => {
    const signal = {
      type: "PRICE_MOVE",
      rawData: { impactValue: 0.9, price_change_percentage_24h: 10 },
    };
    const personalContext = {
      portfolioWeight: 0.8,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 3,
      behavioralRisk: "NONE",
    };
    const evidence = { confidence: 0.95 };
    const assessment = W.decisionEngine.computeAssessment(
      signal,
      personalContext,
      evidence,
    );
    const priority = W.decisionEngine.computeDecisionPriority(
      signal,
      assessment,
    );
    expect(priority.recommendedAction).to.not.equal("REBALANCE");
    expect([
      "MONITOR",
      "REVIEW_THESIS",
      "REVIEW_RISK",
      "LOG_DECISION",
    ]).to.include(priority.recommendedAction);
  });
});
