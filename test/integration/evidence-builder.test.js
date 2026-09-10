const { expect } = require("chai");

describe("Evidence Builder", () => {
  it("should build evidence from a signal with metadata", () => {
    const signal = {
      id: "test-id",
      type: "PRICE_MOVE",
      source: "coingecko",
      assetId: { symbol: "BTC" },
      timestamp: Date.now(),
      rawData: { title: "BTC moved" },
    };

    // Use the global mock we defined in setup.js
    const evidence = global.W.evidence.build(signal, { dataCompleteness: 0.9 });

    expect(evidence).to.have.property("signalId", "test-id");
    expect(evidence.strength).to.be.a("number");
    expect(evidence.supportingFacts).to.be.an("array");
  });
});
