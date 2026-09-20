// test/unit/numeric-edge-cases.test.js
//
// Two numeric edge cases identified in the post-P1 audit:
//
//   1. corroborationCount = NaN / Infinity must not produce
//      confidence = NaN. The canonical function rejects non-finite
//      metadata; the builder sanitizes it before the canonical call.
//
//   2. impactValue = 0 must be preserved as zero severity, not
//      silently inflated to the 0.5 default via `||`.
//
// Both are instances of the same class of bug the broader hardening
// pass has been about: "unknown" and "zero" are distinct claims and
// must never be collapsed into one another.

const { expect } = require("chai");

const typesPath = require.resolve("../../js/intelligence/types.js");
const builderPath =
  require.resolve("../../js/intelligence/evidence-builder.js");
const enginePath = require.resolve("../../js/intelligence/decision-engine.js");

describe("Numeric edge cases (post-P1 audit)", () => {
  before(() => {
    // Force-fresh loads. types.js must load first so the canonical
    // function and its data maps are available to the builder.
    [typesPath, builderPath, enginePath].forEach((p) => {
      delete require.cache[p];
      require(p);
    });
  });

  // ── corroborationCount NaN / Infinity ───────────────────────

  describe("computeConfidence rejects non-finite corroborationCount", () => {
    const validFactors = () => ({
      sourceReliability: 0.9,
      dataFreshness: 0.9,
      dataCompleteness: 0.9,
      interpretationConfidence: 0.9,
    });

    it("returns null when corroborationCount is NaN", () => {
      const c = W.intelligence.computeConfidence({
        ...validFactors(),
        corroborationCount: NaN,
      });
      expect(c).to.equal(null);
    });

    it("returns null when corroborationCount is +Infinity", () => {
      const c = W.intelligence.computeConfidence({
        ...validFactors(),
        corroborationCount: Infinity,
      });
      expect(c).to.equal(null);
    });

    it("returns null when corroborationCount is -Infinity", () => {
      const c = W.intelligence.computeConfidence({
        ...validFactors(),
        corroborationCount: -Infinity,
      });
      expect(c).to.equal(null);
    });

    it("never returns NaN — the invariant this fix protects", () => {
      const c = W.intelligence.computeConfidence({
        ...validFactors(),
        corroborationCount: NaN,
      });
      expect(Number.isNaN(c)).to.equal(false);
      expect(c).to.equal(null);
    });

    it("still computes a valid confidence when corroborationCount is finite", () => {
      const c = W.intelligence.computeConfidence({
        ...validFactors(),
        corroborationCount: 3,
      });
      expect(c).to.be.a("number");
      expect(c).to.be.within(0, 1);
    });

    it("accepts the default (corroborationCount omitted)", () => {
      const c = W.intelligence.computeConfidence(validFactors());
      expect(c).to.be.a("number");
      expect(c).to.be.within(0, 1);
    });
  });

  describe("evidence-builder sanitizes non-finite corroborationCount", () => {
    const signal = () => ({
      id: "sig-edge-1",
      source: "coingecko",
      timestamp: Date.now(),
      type: "PRICE_MOVE",
    });

    it("NaN sanitizes to 1 — the factual default", () => {
      const e = W.evidence.build(signal(), {
        dataCompleteness: 0.9,
        interpretationConfidence: 0.8,
        corroborationCount: NaN,
      });
      expect(e.corroborationCount).to.equal(1);
      expect(e.confidence).to.be.a("number");
      expect(Number.isNaN(e.confidence)).to.equal(false);
    });

    it("Infinity sanitizes to 1", () => {
      const e = W.evidence.build(signal(), {
        dataCompleteness: 0.9,
        interpretationConfidence: 0.8,
        corroborationCount: Infinity,
      });
      expect(e.corroborationCount).to.equal(1);
    });

    it("-Infinity sanitizes to 1", () => {
      const e = W.evidence.build(signal(), {
        dataCompleteness: 0.9,
        interpretationConfidence: 0.8,
        corroborationCount: -Infinity,
      });
      expect(e.corroborationCount).to.equal(1);
    });

    it("a valid corroborationCount is preserved", () => {
      const e = W.evidence.build(signal(), {
        dataCompleteness: 0.9,
        interpretationConfidence: 0.8,
        corroborationCount: 5,
      });
      expect(e.corroborationCount).to.equal(5);
    });
  });

  // ── impactValue === 0 ────────────────────────────────────────

  describe("decision-engine preserves impactValue = 0", () => {
    const context = () => ({
      portfolioWeight: 0.5,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 0,
      behavioralRisk: "NONE",
    });

    const signal = (rawData) => ({
      id: "sig-impact",
      type: "PRICE_MOVE",
      assetId: { symbol: "BTC" },
      rawData,
    });

    it("explicit impactValue: 0 yields impact: 0, not the 0.5 default", () => {
      const a = W.decisionEngine.computeAssessment(
        signal({ impactValue: 0 }),
        context(),
        { confidence: 0.9 },
      );
      // impact = confidence × severity × (weight × 2 + 0.2)
      //        = 0.9 × 0 × (1.2)
      //        = 0
      expect(a.impact).to.equal(0);
    });

    it("absent impactValue falls back to 0.5", () => {
      const a = W.decisionEngine.computeAssessment(signal({}), context(), {
        confidence: 0.9,
      });
      // impact = 0.9 × 0.5 × 1.2 = 0.54
      expect(a.impact).to.be.closeTo(0.54, 0.001);
    });

    it("non-numeric impactValue falls back to 0.5", () => {
      const a = W.decisionEngine.computeAssessment(
        signal({ impactValue: "not a number" }),
        context(),
        { confidence: 0.9 },
      );
      expect(a.impact).to.be.closeTo(0.54, 0.001);
    });

    it("NaN impactValue falls back to 0.5", () => {
      const a = W.decisionEngine.computeAssessment(
        signal({ impactValue: NaN }),
        context(),
        { confidence: 0.9 },
      );
      expect(a.impact).to.be.closeTo(0.54, 0.001);
    });

    it("a valid impactValue is preserved", () => {
      const a = W.decisionEngine.computeAssessment(
        signal({ impactValue: 0.8 }),
        context(),
        { confidence: 0.9 },
      );
      // impact = 0.9 × 0.8 × 1.2 = 0.864
      expect(a.impact).to.be.closeTo(0.864, 0.001);
    });

    it("zero severity does not silently become the 0.5 default", () => {
      const a = W.decisionEngine.computeAssessment(
        signal({ impactValue: 0 }),
        context(),
        { confidence: 0.9 },
      );
      // If the fix regresses, this fails: 0 || 0.5 → 0.5, impact = 0.54.
      expect(a.impact).to.not.be.closeTo(0.54, 0.001);
    });
  });
});
