const { expect } = require("chai");

const realBuilderPath =
  require.resolve("../../js/intelligence/evidence-builder.js");
const realTypesPath = require.resolve("../../js/intelligence/types.js");

describe("Evidence Builder", () => {
  let savedBuild;
  let savedIntelligence;

  before(() => {
    savedBuild = global.W.evidence.build;
    savedIntelligence = global.W.intelligence;
    // Load the real canonical confidence model. The builder delegates
    // to W.intelligence.computeConfidence(), so the test must exercise
    // the real function rather than the setup.js mock (which returns a
    // fixed 0.8 regardless of input and cannot represent the
    // "unknown ⇒ null" contract).
    delete require.cache[realTypesPath];
    require(realTypesPath);
    delete require.cache[realBuilderPath];
    require(realBuilderPath);
  });

  after(() => {
    global.W.evidence.build = savedBuild;
    global.W.intelligence = savedIntelligence;
  });

  function signal(overrides = {}) {
    return {
      id: "sig-1",
      source: "coingecko",
      timestamp: Date.now(),
      type: "PRICE_MOVE",
      assetId: { symbol: "BTC" },
      rawData: {},
      ...overrides,
    };
  }

  it("returns a bounded confidence when all factors are known", () => {
    const e = global.W.evidence.build(signal(), {
      dataCompleteness: 0.9,
      interpretationConfidence: 0.8,
    });
    expect(e.confidence).to.be.at.least(0);
    expect(e.confidence).to.be.at.most(1);
    expect(e.incomplete).to.equal(false);
  });

  it("returns null confidence when dataCompleteness is missing", () => {
    const e = global.W.evidence.build(signal(), {
      interpretationConfidence: 0.8,
    });
    expect(e.confidence).to.be.null;
    expect(e.incomplete).to.equal(true);
  });

  it("returns null confidence when interpretationConfidence is missing", () => {
    const e = global.W.evidence.build(signal(), {
      dataCompleteness: 0.9,
    });
    expect(e.confidence).to.be.null;
    expect(e.incomplete).to.equal(true);
  });

  it("does not fabricate sourceReliability when the helper is missing", () => {
    const orig = global.W.intelligence;
    global.W.intelligence = {};
    try {
      const e = global.W.evidence.build(signal(), { dataCompleteness: 0.9 });
      expect(e.sourceReliability).to.be.null;
    } finally {
      global.W.intelligence = orig;
    }
  });

  it("does not fabricate dataFreshness when the helper is missing", () => {
    const orig = global.W.intelligence;
    global.W.intelligence = {};
    try {
      const e = global.W.evidence.build(signal(), { dataCompleteness: 0.9 });
      expect(e.dataFreshness).to.be.null;
    } finally {
      global.W.intelligence = orig;
    }
  });

  it("marks evidence incomplete when any factor is unknown", () => {
    const e = global.W.evidence.build(signal(), {
      dataCompleteness: null,
      interpretationConfidence: 0.8,
    });
    expect(e.incomplete).to.equal(true);
    // Under the canonical contract, one missing factor means we
    // refuse to make a numeric claim. "Unknown" is null, not a
    // reduced number.
    expect(e.confidence).to.equal(null);
  });

  it("returns null when any factor is unknown — never a reduced number", () => {
    const allKnown = global.W.evidence.build(signal(), {
      dataCompleteness: 0.9,
      interpretationConfidence: 0.9,
    });
    expect(allKnown.confidence).to.be.a("number");

    const someUnknown = global.W.evidence.build(signal(), {
      dataCompleteness: 0.9,
      interpretationConfidence: null,
    });
    expect(someUnknown.confidence).to.equal(null);
    expect(someUnknown.incomplete).to.equal(true);
  });

  it("defaults corroborationCount to 1 when not supplied", () => {
    const e = global.W.evidence.build(signal(), { dataCompleteness: 0.9 });
    expect(e.corroborationCount).to.equal(1);
  });

  it("preserves an explicitly supplied corroborationCount", () => {
    const e = global.W.evidence.build(signal(), {
      dataCompleteness: 0.9,
      corroborationCount: 3,
    });
    expect(e.corroborationCount).to.equal(3);
  });

  it("rejects an invalid corroborationCount below 1", () => {
    const e = global.W.evidence.build(signal(), {
      dataCompleteness: 0.9,
      corroborationCount: 0,
    });
    expect(e.corroborationCount).to.equal(1);
  });

  it("clamps dataCompleteness to [0, 1]", () => {
    const high = global.W.evidence.build(signal(), { dataCompleteness: 5 });
    expect(high.dataCompleteness).to.equal(1);
    const low = global.W.evidence.build(signal(), { dataCompleteness: -2 });
    expect(low.dataCompleteness).to.equal(0);
  });

  it("includes an 'unknown' note in reasoning for missing factors", () => {
    const orig = global.W.intelligence;
    global.W.intelligence = {};
    try {
      const e = global.W.evidence.build(signal(), {});
      const text = e.reasoning.join(" | ");
      expect(text).to.include("reliability unknown");
      expect(text).to.include("Freshness: unknown");
      expect(text).to.include("Completeness: unknown");
      expect(text).to.include("Interpretation: unknown");
      // All four factors are unknown, so the reasoning reports the
      // most specific state rather than the model-missing state.
      expect(text).to.include("no factors known");
    } finally {
      global.W.intelligence = orig;
    }
  });

  it("reports 'model not loaded' when only the canonical function is missing", () => {
    // Partial intelligence model: getSourceReliability and
    // computeFreshness are present, computeConfidence is not. This is
    // the edge case where factors are known but the model cannot
    // combine them.
    //
    // The real getSourceReliability and computeFreshness read their
    // underlying data maps from W.intelligence at call time (that is
    // how they survive load order). So the partial mock must carry
    // those maps too, not just the functions, or the functions will
    // dereference undefined.
    const orig = global.W.intelligence;
    const {
      getSourceReliability,
      computeFreshness,
      sourceReliability,
      freshnessWindows,
    } = orig;
    global.W.intelligence = {
      getSourceReliability,
      computeFreshness,
      sourceReliability,
      freshnessWindows,
      // computeConfidence intentionally omitted.
    };
    try {
      const e = global.W.evidence.build(signal(), {
        dataCompleteness: 0.9,
        interpretationConfidence: 0.8,
      });
      expect(e.confidence).to.equal(null);
      const text = e.reasoning.join(" | ");
      expect(text).to.include("confidence model not loaded");
    } finally {
      global.W.intelligence = orig;
    }
  });
});
