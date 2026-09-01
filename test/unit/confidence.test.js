const { expect } = require("chai");

// Mock W.intelligence
const types = require("../../js/intelligence/types.js");
const { computeConfidence, computeFreshness, getSourceReliability } =
  types.W.intelligence;

describe("Confidence Model", () => {
  it("should compute confidence from evidence components", () => {
    const evidence = {
      sourceReliability: 0.95,
      dataFreshness: 0.9,
      corroborationCount: 3,
      dataCompleteness: 0.9,
      interpretationConfidence: 0.8,
    };
    const confidence = computeConfidence(evidence);
    expect(confidence).to.be.closeTo(
      0.95 * 0.9 * 0.9 * 0.8 * (1 + (3 - 1) * 0.15),
      0.01,
    );
    expect(confidence).to.be.at.most(1);
  });

  it("should compute freshness based on signal type", () => {
    const timestamp = Date.now() - 10000; // 10 seconds ago
    const freshness = computeFreshness(timestamp, "PRICE_MOVE");
    expect(freshness).to.be.closeTo(1 - 10 / 300, 0.01);
  });

  it("should return default source reliability for unknown source", () => {
    const reliability = getSourceReliability("unknown_source");
    expect(reliability).to.equal(0.5);
  });
});
