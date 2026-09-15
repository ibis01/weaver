const { expect } = require("chai");
require("../../js/features/token-analysis.js");

describe("Token Analysis action thresholds", () => {
  const fundamentals = { available: true, score: 75, bias: "supportive" };
  const technical = (bias, alignment = "4/4", confidence = 70) => ({
    bias,
    confidence,
    multiTimeframe: {
      timeframeAlignment: alignment,
      liquidityZones: [
        { type: "sell-side-liquidity", level: 94, range: [93, 95] },
        { type: "buy-side-liquidity", level: 108, range: [107, 109] },
      ],
    },
    current: 100,
    atr: 2,
  });

  it("returns BUY only when bullish evidence and multi-timeframe alignment clear thresholds", () => {
    const result = W.tokenAnalysis.decisionReport(
      technical("bullish"),
      fundamentals,
      80,
      50,
    );
    expect(result.action).to.equal("BUY");
  });

  it("returns SELL when bearish evidence and aligned timeframes clear thresholds", () => {
    const result = W.tokenAnalysis.decisionReport(
      technical("bearish"),
      { available: true, score: 30, bias: "cautionary" },
      45,
      80,
    );
    expect(result.action).to.equal("SELL");
  });

  it("returns HOLD when timeframe alignment is insufficient", () => {
    const result = W.tokenAnalysis.decisionReport(
      technical("bullish", "2/4"),
      fundamentals,
      85,
      45,
    );
    expect(result.action).to.equal("HOLD");
  });

  it("returns HOLD when the evidence gap is below the directional threshold", () => {
    const result = W.tokenAnalysis.decisionReport(
      technical("bullish"),
      fundamentals,
      58,
      50,
    );
    expect(result.action).to.equal("HOLD");
  });

  it("calculates BUY levels below entry for risk and above entry for target", () => {
    const levels = W.tokenAnalysis.tradeLevels("BUY", technical("bullish"));
    expect(levels.stopLoss).to.be.lessThan(levels.entry);
    expect(levels.takeProfit).to.be.greaterThan(levels.entry);
  });

  it("calculates SELL levels above entry for risk and below entry for target", () => {
    const levels = W.tokenAnalysis.tradeLevels("SELL", technical("bearish"));
    expect(levels.stopLoss).to.be.greaterThan(levels.entry);
    expect(levels.takeProfit).to.be.lessThan(levels.entry);
  });

  it("returns no trade levels for HOLD", () => {
    expect(W.tokenAnalysis.tradeLevels("HOLD", technical("bullish"))).to.equal(
      null,
    );
  });

  it("returns no levels for missing, zero, negative, or non-finite ATR", () => {
    for (const atr of [undefined, 0, -2, NaN, Infinity]) {
      expect(
        W.tokenAnalysis.tradeLevels("BUY", { current: 100, atr }),
      ).to.equal(null);
    }
  });

  it("returns no levels for missing, zero, negative, or non-finite entry", () => {
    for (const current of [undefined, 0, -100, NaN, Infinity]) {
      expect(W.tokenAnalysis.tradeLevels("BUY", { current, atr: 2 })).to.equal(
        null,
      );
    }
  });

  it("falls back to ATR targets when liquidity zones are absent or malformed", () => {
    const levels = W.tokenAnalysis.tradeLevels("BUY", {
      current: 100,
      atr: 2,
      liquidityZones: [
        { level: "bad", range: [null] },
        { level: 101, range: ["bad", 102] },
      ],
    });
    expect(levels.stopLoss).to.equal(97);
    expect(levels.takeProfit).to.equal(106);
  });

  it("normalizes reversed liquidity-zone ranges", () => {
    const levels = W.tokenAnalysis.tradeLevels("BUY", {
      current: 100,
      atr: 2,
      liquidityZones: [{ level: 105, range: [107, 104] }],
    });
    expect(levels.takeProfit).to.equal(107);
  });

  it("rejects an extreme ATR that would create unusable risk levels", () => {
    expect(
      W.tokenAnalysis.tradeLevels("SELL", { current: 100, atr: 10001 }),
    ).to.equal(null);
  });

  it("marks complete technical and fundamental inputs as sufficient", () => {
    const quality = W.tokenAnalysis.evidenceSufficiency(
      technical("bullish"),
      fundamentals,
    );
    expect(quality.status).to.equal("SUFFICIENT");
  });

  it("marks missing fundamentals or weak alignment as partial", () => {
    expect(
      W.tokenAnalysis.evidenceSufficiency(technical("bullish"), null).status,
    ).to.equal("PARTIAL");
    expect(
      W.tokenAnalysis.evidenceSufficiency(
        technical("bullish", "2/4"),
        fundamentals,
      ).status,
    ).to.equal("PARTIAL");
  });

  it("marks missing technical data as insufficient", () => {
    const quality = W.tokenAnalysis.evidenceSufficiency(null, fundamentals);
    expect(quality.status).to.equal("INSUFFICIENT");
  });

  it("exposes scenario labels without changing internal compatibility actions", () => {
    expect(W.tokenAnalysis.scenarioLabel("BUY")).to.equal("Bullish scenario");
    expect(W.tokenAnalysis.scenarioLabel("SELL")).to.equal("Bearish scenario");
    expect(W.tokenAnalysis.scenarioLabel("HOLD")).to.equal(
      "Neutral / insufficient evidence",
    );
  });
});
