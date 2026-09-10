const { expect } = require("chai");

describe("Thesis Health (Evidence-Based)", () => {
  const thesisHealth = global.W.thesisHealth;

  it("should mark thesis as INVALIDATED when price drops >40%", () => {
    const thesis = { id: "t1", entryPrice: 100, direction: "bullish" };
    const marketData = { price: 55 };
    const result = thesisHealth.evaluate(thesis, marketData, []);
    expect(result.status).to.equal("Invalidated");
  });

  it("should evaluate thesis as STRENGTHENING when price and regime align", () => {
    const thesis = { id: "t2", entryPrice: 100, direction: "bullish" };
    const marketData = { price: 120, regime: "RISK-ON" };
    const result = thesisHealth.evaluate(thesis, marketData, []);
    expect(result.status).to.equal("Strengthening");
  });

  it("should avoid equating price movement with thesis health", () => {
    const thesis = { id: "t3", entryPrice: 100, direction: "bearish" };
    const marketData = { price: 120 };
    const result = thesisHealth.evaluate(thesis, marketData, []);
    expect(result.status).to.equal("Healthy");
  });
});
