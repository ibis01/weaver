const { expect } = require("chai");

describe("User Calibration Metric", () => {
  beforeEach(() => {
    global.W.store.clearAll();
    global.W.journal = { all: () => global.W.store.get("test_journal", []) };
    global.W.decisionReplay = {
      evaluate: (d) => ({
        outcome:
          d._outcome === 1
            ? "successful"
            : d._outcome === 0
              ? "unsuccessful"
              : "inconclusive",
      }),
    };
  });

  function mk(stated, outcome, offsetDays) {
    return {
      asset: "BTC",
      confidence: stated,
      price: 50000,
      timestamp: Date.now() - (offsetDays || 0) * 86400000,
      _outcome: outcome,
    };
  }

  // Provide a lookup so the calibration module can evaluate outcomes.
  // Without it, evaluateAll skips every decision (correct behavior —
  // you cannot judge an outcome without a current price).
  const lookup = () => 55000;

  it("returns null score below the minimum sample size", () => {
    global.W.store.set("test_journal", [mk(0.9, 1), mk(0.8, 0)]);
    const r = global.W.calibration.forAsset({ symbol: "BTC" }, lookup);
    expect(r.score).to.be.null;
    expect(r.reason).to.equal("insufficient_data");
    expect(r.sampleSize).to.equal(2);
  });

  it("returns a bounded score in [0, 1] once enough data exists", () => {
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push(mk(0.9, 1, i));
    global.W.store.set("test_journal", rows);
    const r = global.W.calibration.forAsset({ symbol: "BTC" }, lookup);
    expect(r.score).to.be.at.least(0);
    expect(r.score).to.be.at.most(1);
    expect(r.sampleSize).to.equal(12);
  });

  it("scores overconfidence lower than well-calibrated decisions", () => {
    const good = [];
    for (let i = 0; i < 12; i++) good.push(mk(0.9, 1, i));
    global.W.store.set("test_journal", good);
    const goodScore = global.W.calibration.forAsset({ symbol: "BTC" }, lookup).score;

    const bad = [];
    for (let i = 0; i < 12; i++) bad.push(mk(0.9, i % 2, i));
    global.W.store.set("test_journal", bad);
    const badScore = global.W.calibration.forAsset({ symbol: "BTC" }, lookup).score;

    expect(badScore).to.be.lessThan(goodScore);
  });

  it("counts overconfident and underconfident decisions", () => {
    const rows = [];
    for (let i = 0; i < 8; i++) rows.push(mk(0.9, 0, i));
    for (let i = 0; i < 4; i++) rows.push(mk(0.1, 1, i));
    global.W.store.set("test_journal", rows);
    const r = global.W.calibration.forAsset({ symbol: "BTC" }, lookup);
    expect(r.overconfident).to.equal(8);
    expect(r.underconfident).to.equal(4);
  });

  it("returns insufficient_evaluated_data when prices are unavailable", () => {
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push(mk(0.9, 1, i));
    global.W.store.set("test_journal", rows);
    // No lookup — module must report "we cannot evaluate" honestly,
    // not fabricate a score.
    const r = global.W.calibration.forAsset({ symbol: "BTC" });
    expect(r.score).to.be.null;
    expect(r.reason).to.equal("insufficient_evaluated_data");
    expect(r.evaluated).to.equal(0);
  });

  it("does not expose a confidence-multiplying API", () => {
    expect(global.W.calibration.applyToConfidence).to.be.undefined;
    expect(global.W.calibration.factorFor).to.be.undefined;
  });
});
