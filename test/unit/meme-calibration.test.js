const { expect } = require("chai");

global.window.W = global.W;
require("../../js/intelligence/meme-calibration.js");

describe("Meme alert calibration", () => {
  const start = "2026-01-01T00:00:00.000Z";

  it("recognizes a durable, executable opportunity", () => {
    const result = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: 1, liquidityUsd: 100000 },
      [
        {
          observedAt: "2026-01-01T01:00:00.000Z",
          priceUsd: 1.4,
          liquidityUsd: 120000,
        },
        {
          observedAt: "2026-01-02T00:00:00.000Z",
          priceUsd: 1.3,
          liquidityUsd: 90000,
        },
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
        {
          observedAt: "2026-01-01T02:00:00.000Z",
          priceUsd: 1.8,
          liquidityUsd: 20000,
        },
        {
          observedAt: "2026-01-02T00:00:00.000Z",
          priceUsd: 1.5,
          liquidityUsd: 15000,
          canSell: false,
        },
      ],
    );
    expect(result.executable).to.equal(false);
    expect(result.outcome).to.equal("EXECUTION_FAILURE_RISK");
  });

  it("summarizes durable and executable rates", () => {
    const summary = W.memeCalibration.summarize([
      {
        valid: true,
        durable: true,
        executable: true,
        horizonReturnPct: 30,
        maxDrawdownPct: 10,
      },
      {
        valid: true,
        durable: false,
        executable: true,
        horizonReturnPct: 5,
        maxDrawdownPct: 25,
      },
      { valid: false },
    ]);
    expect(summary.evaluated).to.equal(2);
    expect(summary.durableRate).to.equal(0.5);
    expect(summary.executableRate).to.equal(1);
    expect(summary.calibrationScore).to.equal(50);
  });

  // ── Horizon-validity regression coverage ────────────────────

  it("returns INSUFFICIENT_HORIZON_DATA when no observation reaches the horizon", () => {
    const result = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: 1, liquidityUsd: 100000 },
      [
        {
          observedAt: "2026-01-01T01:00:00.000Z",
          priceUsd: 1.2,
          liquidityUsd: 100000,
          canSell: true,
        },
        {
          observedAt: "2026-01-01T02:00:00.000Z",
          priceUsd: 1.5,
          liquidityUsd: 100000,
          canSell: true,
        },
      ],
      { horizonHours: 24 },
    );
    expect(result.valid).to.equal(false);
    expect(result.reason).to.equal("INSUFFICIENT_HORIZON_DATA");
    expect(result.horizonHours).to.equal(24);
    expect(result.observationCount).to.equal(2);
    // The latest observation (2h) must not be substituted for the 24h outcome.
    expect(result.horizonReturnPct).to.equal(undefined);
    expect(result.durable).to.equal(undefined);
  });

  it("accepts observations within the default 5% horizon tolerance", () => {
    const result = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: 1, liquidityUsd: 100000 },
      [
        {
          // 23h after start — within 5% of a 24h horizon (>=22.8h).
          observedAt: "2026-01-01T23:00:00.000Z",
          priceUsd: 1.5,
          liquidityUsd: 100000,
          canSell: true,
        },
      ],
      { horizonHours: 24 },
    );
    expect(result.valid).to.equal(true);
    expect(result.durable).to.equal(true);
    expect(result.horizonReturnPct).to.be.closeTo(50, 0.001);
  });

  it("tolerance is configurable — 0% requires the horizon exactly", () => {
    const result = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: 1, liquidityUsd: 100000 },
      [
        {
          // 23h — insufficient when tolerance is 0%.
          observedAt: "2026-01-01T23:00:00.000Z",
          priceUsd: 1.5,
          liquidityUsd: 100000,
          canSell: true,
        },
      ],
      { horizonHours: 24, horizonTolerancePct: 0 },
    );
    expect(result.valid).to.equal(false);
    expect(result.reason).to.equal("INSUFFICIENT_HORIZON_DATA");
  });

  it("summarize() excludes INSUFFICIENT_HORIZON_DATA from the denominator", () => {
    const valid = {
      valid: true,
      durable: true,
      executable: true,
      horizonReturnPct: 30,
      maxDrawdownPct: 5,
    };
    const invalid = { valid: false, reason: "INSUFFICIENT_HORIZON_DATA" };
    const summary = W.memeCalibration.summarize([
      valid,
      valid,
      invalid,
      invalid,
    ]);
    expect(summary.evaluated).to.equal(2);
    expect(summary.durableRate).to.equal(1);
    expect(summary.executableRate).to.equal(1);
    expect(summary.calibrationScore).to.equal(100);
  });

  it("distinguishes INSUFFICIENT_HORIZON_DATA from other invalid reasons", () => {
    const missingPrice = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: null, liquidityUsd: 100000 },
      [],
    );
    expect(missingPrice.valid).to.equal(false);
    expect(missingPrice.reason).to.equal("Missing alert price or timestamp");

    const noFuture = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: 1, liquidityUsd: 100000 },
      [],
    );
    expect(noFuture.valid).to.equal(false);
    expect(noFuture.reason).to.equal("No future observations");

    const shortHorizon = W.memeCalibration.evaluate(
      { observedAt: start, priceUsd: 1, liquidityUsd: 100000 },
      [
        {
          observedAt: "2026-01-01T01:00:00.000Z",
          priceUsd: 1.2,
          liquidityUsd: 100000,
        },
      ],
      { horizonHours: 24 },
    );
    expect(shortHorizon.valid).to.equal(false);
    expect(shortHorizon.reason).to.equal("INSUFFICIENT_HORIZON_DATA");
  });
});
