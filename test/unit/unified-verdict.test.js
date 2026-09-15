const { expect } = require("chai");
require("../../js/intelligence/unified-verdict.js");

describe("Unified Verdict composition", () => {
  it("returns explicit schema and methodology versions", () => {
    const verdict = W.unifiedVerdict.compose({
      asset: "BTC",
      technical: {},
      domains: {
        market: "available",
        technical: "available",
        security: "verified",
        holders: "available",
        liquidity: "available",
        freshness: "available",
      },
    });
    expect(verdict.schemaVersion).to.equal("unified-verdict-v1");
    expect(verdict.methodologyVersion).to.equal("methodology-v1");
    expect(verdict.evidenceVersion).to.equal("evidence-gate-v1");
    expect(verdict.scenarioVersion).to.equal("scenario-v1");
    expect(verdict.generatedAt).to.be.a("string");
  });

  it("requires core market and technical domains for sufficiency", () => {
    const verdict = W.unifiedVerdict.compose({
      domains: {
        market: "unavailable",
        technical: "available",
        security: "verified",
      },
    });
    expect(verdict.evidence.status).to.equal("INSUFFICIENT");
    expect(verdict.evidence.reasons.join(" ")).to.include("Market");
  });

  it("marks missing security, holders, liquidity, or freshness as partial", () => {
    const verdict = W.unifiedVerdict.compose({
      technical: {},
      domains: {
        market: "available",
        technical: "available",
        security: "verified",
        holders: "unavailable",
        liquidity: "available",
        freshness: "available",
      },
    });
    expect(verdict.evidence.status).to.equal("PARTIAL");
    expect(verdict.domains.holders.status).to.equal("unavailable");
  });

  it("preserves domain provenance and scenario levels without inventing facts", () => {
    const verdict = W.unifiedVerdict.compose({
      asset: "ETH",
      action: "BUY",
      scenario: "Bullish scenario",
      tradeLevels: { entry: 100, stopLoss: 95, takeProfit: 110 },
      provenance: [{ type: "technical", source: "ohlcv" }],
      domains: {
        market: "available",
        technical: "available",
        security: "verified",
        holders: "available",
        liquidity: "available",
        freshness: "available",
      },
    });
    expect(verdict.scenario.levels).to.deep.equal({
      entry: 100,
      stopLoss: 95,
      takeProfit: 110,
    });
    expect(verdict.provenance[0]).to.deep.equal({
      type: "technical",
      source: "ohlcv",
    });
  });
});
