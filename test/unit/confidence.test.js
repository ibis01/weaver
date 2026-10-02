const { expect } = require("chai");

const { computeConfidence, computeFreshness, getSourceReliability } =
  global.W.intelligence;

describe("Confidence Model", () => {
  it("should compute confidence from evidence components", () => {
    // computeConfidence takes an evidence object, not positional args.
    // All five factors must be finite; any missing factor → null,
    // never a reduced number (see memory-bank/security-audit-2026-10-01.md).
    const confidence = computeConfidence({
      sourceReliability: 0.9,
      dataFreshness: 1.0,
      corroborationCount: 2,
      dataCompleteness: 0.9,
      interpretationConfidence: 0.9,
    });
    expect(confidence).to.be.a("number");
    expect(confidence).to.be.at.most(1);
    expect(confidence).to.be.at.least(0);
  });

  it("should return null when any factor is unknown", () => {
    // Complementary assertion: omitting interpretationConfidence
    // triggers the unknown-factor path. This is the invariant the
    // earlier setup.js mock could not represent (it returned 0.8
    // unconditionally).
    const confidence = computeConfidence({
      sourceReliability: 0.9,
      dataFreshness: 1.0,
      dataCompleteness: 0.9,
      // interpretationConfidence intentionally omitted
    });
    expect(confidence).to.equal(null);
  });

  it("should compute freshness near 1 for a current timestamp", () => {
    // Freshness decays with age. A just-now timestamp is effectively
    // 1.0; use a tolerance because a few ms pass between Date.now()
    // and the freshness calculation. The earlier setup.js mock
    // returned a hardcoded 1.0, so the strict assertion passed then
    // and fails against real behavior.
    const freshness = computeFreshness(Date.now());
    expect(freshness).to.be.closeTo(1, 0.01);
  });

  it("should return default source reliability for unknown source", () => {
    const reliability = getSourceReliability("unknown_source");
    expect(reliability).to.be.a("number");
  });
});
