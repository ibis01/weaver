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

    // The real evidence-builder.js requires all five confidence
    // factors to be finite to emit a numeric confidence. Any missing
    // factor yields confidence = null (see the canonical contract in
    // memory-bank/security-audit-2026-10-01.md). The previous test
    // asserted against the setup.js mock, which returned fixed
    // values (strength: 0.8, supportingFacts: [...]) with no
    // counterpart in the real record shape.
    const evidence = global.W.evidence.build(signal, {
      dataCompleteness: 0.9,
      interpretationConfidence: 0.8,
    });

    expect(evidence).to.have.property("signalId", "test-id");
    expect(evidence).to.have.property("source", "coingecko");
    expect(evidence).to.have.property("observedAt").that.is.a("string");
    expect(evidence).to.have.property("relationship").that.is.a("string");
    expect(evidence).to.have.property("reliability").that.is.a("number");
    expect(evidence).to.have.property("freshness").that.is.a("number");
    expect(evidence).to.have.property("confidence").that.is.a("number");
    expect(evidence).to.have.property("incomplete", false);
    expect(evidence).to.have.property("reasoning").that.is.an("array");
  });

  it("returns null confidence when interpretationConfidence is missing", () => {
    // Complementary invariant: the builder must not fabricate a
    // numeric confidence when a factor is unknown.
    const signal = {
      id: "test-id-2",
      type: "PRICE_MOVE",
      source: "coingecko",
      assetId: { symbol: "BTC" },
      timestamp: Date.now(),
      rawData: {},
    };
    const evidence = global.W.evidence.build(signal, {
      dataCompleteness: 0.9,
      // interpretationConfidence intentionally omitted
    });
    expect(evidence.confidence).to.equal(null);
    expect(evidence.incomplete).to.equal(true);
  });
});
