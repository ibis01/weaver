const { expect } = require("chai");

describe("Thesis Health (Evidence-Based)", () => {
  const thesisHealth = global.W.thesisHealth;

  it("should mark thesis as INVALIDATED when price drops >40%", () => {
    const thesis = { id: "t1", entryPrice: 100, direction: "bullish" };
    const marketData = { price: 55 };
    const result = thesisHealth.evaluate(thesis, marketData, []);
    expect(result.status).to.equal("Invalidated");
  });

  it("should classify a fully-aligned thesis as Healthy", () => {
    // The real module scores from a base of 50 and adds 50 * ratio,
    // where ratio is expectedMet / expectedTotal. With no
    // expectedSignals supplied, expectedTotal = 1, so a single
    // alignment (price up 20% for a bullish thesis) is enough for
    // ratio = 1 → healthScore 100 → Healthy. Regime RISK-ON confirms
    // the alignment but does not push above 100.
    //
    // Strengthening (60-79) is reserved for partial alignment — for
    // example when expectedSignals is non-empty and only some have
    // fired. The earlier assertion of "Strengthening" reflected the
    // setup.js mock's hardcoded 90 for this branch, which did not
    // match the canonical scoring.
    const thesis = { id: "t2", entryPrice: 100, direction: "bullish" };
    const marketData = { price: 120, regime: "RISK-ON" };
    const result = thesisHealth.evaluate(thesis, marketData, []);
    expect(result.status).to.equal("Healthy");
  });

  it("should avoid equating price movement with thesis health", () => {
    // A bearish thesis whose underlying price rose +20% against the
    // thesis direction is Weakening, not Invalidated (the >40% drop
    // gate has not fired) and not Healthy (the score has dropped into
    // the 30-59 band). The earlier assertion of "Healthy" reflected
    // the setup.js mock's naive 100/80/20 thresholds — the real module
    // weights the counter-direction move.
    const thesis = { id: "t3", entryPrice: 100, direction: "bearish" };
    const marketData = { price: 120 };
    const result = thesisHealth.evaluate(thesis, marketData, []);
    expect(result.status).to.equal("Weakening");
  });

  // Regression: the module reads keys from W.intelligence.types.THESIS_STATUS.
  // _makeEnum in types.js produces a value-keyed object
  // (STATUS.Healthy === "Healthy"), NOT an uppercase-keyed one
  // (STATUS.HEALTHY === undefined). A mismatch here returns
  // undefined as the status, silently breaking theses.js comparisons.
  it("every returned status is a member of the canonical THESIS_STATUS set", () => {
    const canonical = new Set(
      Object.values(global.W.intelligence.types.THESIS_STATUS),
    );
    // Exercise every branch: invalidation, healthy, strengthening.
    const cases = [
      { thesis: { id: "x", entryPrice: 100, direction: "bullish" }, market: { price: 55 } },
      { thesis: { id: "y", entryPrice: 100, direction: "bullish" }, market: { price: 120, regime: "RISK-ON" } },
      { thesis: { id: "z", entryPrice: 100, direction: "bearish" }, market: { price: 120 } },
    ];
    for (const { thesis, market } of cases) {
      const result = thesisHealth.evaluate(thesis, market, []);
      expect(result).to.not.be.null;
      expect(canonical.has(result.status)).to.equal(
        true,
        `status ${JSON.stringify(result.status)} is not a canonical THESIS_STATUS member`,
      );
    }
  });
});
