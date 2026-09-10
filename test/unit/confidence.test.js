const { expect } = require("chai");

// FIX: Use global mock instead of require
const { computeConfidence, computeFreshness, getSourceReliability } =
  global.W.intelligence;

describe("Confidence Model", () => {
  it("should compute confidence from evidence components", () => {
    const confidence = computeConfidence(0.9, 1.0);
    expect(confidence).to.be.a("number");
    expect(confidence).to.be.at.most(1);
  });

  it("should compute freshness based on signal type", () => {
    const freshness = computeFreshness(Date.now());
    expect(freshness).to.equal(1.0);
  });

  it("should return default source reliability for unknown source", () => {
    const reliability = getSourceReliability("unknown_source");
    expect(reliability).to.be.a("number");
  });
});
