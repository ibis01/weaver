const { expect } = require("chai");
const thesisHealth = require("../../js/intelligence/thesis-health.js");

describe("Thesis Health (Evidence-Based)", () => {
  it("should mark thesis as INVALIDATED when price drops >40%", () => {
    const thesis = { id: "t1", entryPrice: 100, direction: "bullish" };
    const marketData = { price: 55 };
    const health = thesisHealth.evaluate(thesis, marketData);
    expect(health.status).to.equal("INVALIDATED");
    expect(health.healthScore).to.equal(0);
  });

  it("should evaluate thesis as STRENGTHENING when price and regime align", () => {
    const thesis = { id: "t2", entryPrice: 100, direction: "bullish" };
    const marketData = { price: 110, regime: "RISK-ON" };
    const health = thesisHealth.evaluate(thesis, marketData);
    expect(health.status).to.equal("STRENGTHENING");
    expect(health.healthScore).to.be.above(60);
  });

  it("should avoid equating price movement with thesis health", () => {
    // Test that a small price drop doesn't automatically invalidate
    const thesis = { id: "t3", entryPrice: 100, direction: "bullish" };
    const marketData = { price: 95 };
    const health = thesisHealth.evaluate(thesis, marketData);
    expect(health.status).to.not.equal("INVALIDATED");
    expect(health.healthScore).to.be.above(50);
  });
});
