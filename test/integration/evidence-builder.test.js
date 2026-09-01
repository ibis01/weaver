const { expect } = require("chai");

describe("Evidence Builder", () => {
  it("should build evidence from a signal with metadata", () => {
    const signal = {
      id: "test-id",
      source: "coingecko",
      type: "PRICE_MOVE",
      timestamp: Date.now(),
    };
    const metadata = {
      corroborationCount: 2,
      dataCompleteness: 0.9,
      interpretationConfidence: 0.8,
    };
    const evidence = W.evidence.build(signal, metadata);
    expect(evidence.signalId).to.equal("test-id");
    expect(evidence.sourceReliability).to.equal(0.95);
    expect(evidence.confidence).to.be.within(0, 1);
    expect(evidence.reasoning).to.be.an("array").that.is.not.empty;
  });
});
