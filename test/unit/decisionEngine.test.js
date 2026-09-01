const { expect } = require("chai");
const decisionEngine = require("../../js/intelligence/decision-engine.js");

describe("Decision Engine", () => {
  it("should compute relevance from personal context", () => {
    const assetId = { symbol: "BTC" };
    const context = {
      portfolioWeight: 0.5,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 2,
      behavioralRisk: "NONE",
    };
    const relevance = decisionEngine.computePersonalContext(assetId, context);
    expect(relevance.portfolioWeight).to.equal(0.5);
  });

  it("should compute assessment with confidence from evidence", () => {
    const signal = {
      type: "PRICE_MOVE",
      rawData: { price_change_percentage_24h: 8 },
    };
    const personalContext = {
      portfolioWeight: 0.5,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 1,
      behavioralRisk: "NONE",
    };
    const evidence = { confidence: 0.85 };
    const assessment = decisionEngine.computeAssessment(
      signal,
      personalContext,
      evidence,
    );
    expect(assessment.relevance).to.be.above(0.5);
    expect(assessment.urgency).to.be.closeTo(0.8, 0.1);
    expect(assessment.confidence).to.equal(0.85);
  });

  it("should prioritize signals correctly", () => {
    const signal1 = {
      id: "s1",
      type: "PRICE_MOVE",
      rawData: { price_change_percentage_24h: 5 },
    };
    const signal2 = {
      id: "s2",
      type: "UNLOCK",
      rawData: { date: Date.now() + 1 * 86400000 },
    };
    // Mock context and evidence
    // ...
  });
});
