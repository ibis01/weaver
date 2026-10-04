const { expect } = require("chai");

require("../../js/intelligence/technical-analysis.js");

describe("Technical analysis liquidity safeguards", () => {
  function candles(last) {
    const base = Array.from({ length: 24 }, (_, i) => [
      i,
      95,
      100,
      90,
      95,
      1000,
    ]);
    base.push([24, last.open, last.high, last.low, last.close, 2500]);
    return base;
  }

  it("detects a buy-side sweep using the prior range, excluding the current candle", () => {
    const result = W.technicalAnalysis.analyzeCandles(
      candles({ open: 98, high: 105, low: 94, close: 99 }),
    );
    expect(result.smc.liquidity).to.equal("Buy-side liquidity sweep");
  });

  it("detects a sell-side sweep using the prior range, excluding the current candle", () => {
    const result = W.technicalAnalysis.analyzeCandles(
      candles({ open: 92, high: 96, low: 85, close: 91 }),
    );
    expect(result.smc.liquidity).to.equal("Sell-side liquidity sweep");
  });

  it("does not merge unrelated levels because a wide zone sets a large tolerance", () => {
    const result = W.technicalAnalysis.aggregateLiquidity({
      "1d": {
        liquidityZones: [
          {
            type: "buy-side-liquidity",
            level: 100,
            range: [90, 110],
            touches: 1,
            strength: 70,
            swept: false,
          },
        ],
      },
      "15m": {
        liquidityZones: [
          {
            type: "buy-side-liquidity",
            level: 105,
            range: [104.5, 105.5],
            touches: 1,
            strength: 70,
            swept: false,
          },
        ],
      },
    });
    expect(result).to.have.length(2);
  });
});
