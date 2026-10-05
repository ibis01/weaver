const { expect } = require("chai");

global.window.W = global.W;
require("../../js/intelligence/meme-calibration.js");

describe("Meme alert calibration", () => {
  const start = "2026-01-01T00:00:00.000Z";

  it("recognizes a durable, executable opportunity", () => {
    const result = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: 1, liquidityUsd: 100000 },
      [
        { observedAt: "2026-01-01T01:00:00.000Z", priceUsd: 1.4, liquidityUsd: 120000 },
        { observedAt: "2026-01-02T00:00:00.000Z", priceUsd: 1.3, liquidityUsd: 90000 },
      ],
    );
    expect(result.valid).to.equal(true);
    expect(result.durable).to.equal(true);
    expect(result.executable).to.equal(true);
    expect(result.outcome).to.equal("DURABLE_OPPORTUNITY");
  });

  it("identifies liquidity collapse as execution failure risk", () => {
    const result = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: 1, liquidityUsd: 100000 },
      [
        { observedAt: "2026-01-01T02:00:00.000Z", priceUsd: 1.8, liquidityUsd: 20000 },
        { observedAt: "2026-01-02T00:00:00.000Z", priceUsd: 1.5, liquidityUsd: 15000, canSell: false },
      ],
    );
    expect(result.executable).to.equal(false);
    expect(result.outcome).to.equal("EXECUTION_FAILURE_RISK");
  });

  it("summarizes durable and executable rates", () => {
    const summary = W.memeCalibration.summarize([
      { valid: true, durable: true, executable: true, horizonReturnPct: 30, maxDrawdownPct: 10 },
      { valid: true, durable: false, executable: true, horizonReturnPct: 5, maxDrawdownPct: 25 },
      { valid: false },
    ]);
    expect(summary.evaluated).to.equal(2);
    expect(summary.durableRate).to.equal(0.5);
    expect(summary.executableRate).to.equal(1);
    expect(summary.calibrationScore).to.equal(50);
  });
});
