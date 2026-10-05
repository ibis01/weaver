const { expect } = require("chai");

global.window.W = global.W;
require("../../js/intelligence/meme-opportunity.js");

describe("Meme opportunity engine", () => {
  const basePair = {
    chainId: "solana",
    pairCreatedAt: Date.now() - 24 * 60 * 60 * 1000,
    liquidity: { usd: 250000 },
    volume: { h24: 900000 },
    priceChange: { h1: 8, h6: 22, h24: 48 },
    txns: { h24: { buys: 1200, sells: 800 } },
  };

  it("returns a versioned, explainable opportunity assessment", () => {
    const result = W.memeOpportunity.analyze(basePair, { sourceCount: 2 });
    expect(result.methodologyVersion).to.equal("meme-opportunity-v1");
    expect(result.opportunityScore).to.be.within(0, 100);
    expect(result.confidence).to.be.within(0, 100);
    expect(result.breakdown).to.have.property("liquidityQuality");
    expect(result.reasons).to.be.an("array").that.is.not.empty;
    expect(result.vetoes).to.deep.equal([]);
  });

  it("hard-rejects a honeypot even when momentum is strong", () => {
    const result = W.memeOpportunity.analyze(basePair, {
      security: { honeypot: true },
    });
    expect(result.verdict).to.equal("SECURITY_REJECTED");
    expect(result.eligible).to.equal(false);
    expect(result.opportunityScore).to.be.at.most(15);
    expect(result.vetoes.join(" ")).to.match(/honeypot/i);
  });

  it("penalizes thin liquidity and extreme volume/liquidity ratios", () => {
    const result = W.memeOpportunity.analyze({
      ...basePair,
      liquidity: { usd: 30000 },
      volume: { h24: 3000000 },
    });
    expect(result.opportunityScore).to.be.lessThan(60);
    expect(result.penalties.join(" ")).to.match(/liquidity|wash/i);
  });

  it("reduces confidence when market evidence is incomplete", () => {
    const result = W.memeOpportunity.analyze({
      liquidity: { usd: 100000 },
      priceChange: { h24: 20 },
    });
    expect(result.confidence).to.equal(null);
    expect(result.verdict).to.be.oneOf([
      "WATCH_FOR_CONFIRMATION",
      "INSUFFICIENT_DATA",
    ]);
  });

  it("penalizes concentrated holders and coordinated wallet clusters", () => {
    const result = W.memeOpportunity.analyze(basePair, {
      observation: { concentration: { top10Pct: 72 } },
      graphReport: { clusteredSharePct: 24 },
    });
    expect(result.breakdown.top10Pct).to.equal(72);
    expect(result.breakdown.clusteredSharePct).to.equal(24);
    expect(result.penalties.join(" ")).to.match(/Top 10|Behavioural wallet/);
    expect(result.opportunityScore).to.be.lessThan(70);
  });

  it("reports estimated exit slippage and penalizes weak execution quality", () => {
    const result = W.memeOpportunity.analyze({
      ...basePair,
      liquidity: { usd: 12000 },
    });
    expect(result.breakdown.estimatedSellSlippagePct).to.be.greaterThan(10);
    expect(result.breakdown.executionRisk).to.be.at.least(75);
    expect(result.penalties.join(" ")).to.match(/slippage|liquidity/i);
  });
});
