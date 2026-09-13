const { expect } = require("chai");

const realBuilderPath = require.resolve(
  "../../js/intelligence/evidence-builder.js",
);

describe("Evidence Builder", () => {
  let savedBuild;
  let savedIntelligence;

  before(() => {
    savedBuild = global.W.evidence.build;
    savedIntelligence = global.W.intelligence;
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

  it("returns null confidence when NO factors are known", () => {
    const orig = global.W.intelligence;
    global.W.intelligence = {};
    try {
      const e = global.W.evidence.build(signal(), {});
      expect(e.confidence).to.be.null;
      expect(e.incomplete).to.equal(true);
      expect(e.sourceReliability).to.be.null;
      expect(e.dataFreshness).to.be.null;
      expect(e.dataCompleteness).to.be.null;
      expect(e.interpretationConfidence).to.be.null;
    } finally {
      global.W.intelligence = orig;
    }
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
    expect(e.confidence).to.be.a("number");
    expect(e.confidence).to.be.lessThan(0.95);
  });

  it("reduces confidence more when more factors are unknown", () => {
    const allKnown = global.W.evidence.build(signal(), {
      dataCompleteness: 0.9,
      interpretationConfidence: 0.9,
    });
    const someUnknown = global.W.evidence.build(signal(), {
      dataCompleteness: 0.9,
      interpretationConfidence: null,
    });
    expect(someUnknown.confidence).to.be.lessThan(allKnown.confidence);
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
      expect(text).to.include("no factors known");
    } finally {
      global.W.intelligence = orig;
    }
  });
});
