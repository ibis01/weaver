// test/unit/evidence-provenance.test.js
//
// P1 — Evidence provenance.
//
// Every evidence item carries six provenance fields:
//   source, observedAt, freshness, methodologyVersion,
//   relationship, reliability.
//
// Missing values are null at the source and "unknown" at render.
// The relationship field is never silently defaulted to
// "supporting" when the caller did not supply one.

const { expect } = require("chai");

describe("Evidence provenance (P1)", () => {
  before(() => {
    // Force-fresh loads. test/setup.js installs a mock on W.evidence,
    // and evidence-builder.test.js may restore it in an after() hook.
    // A plain require() would hit the CommonJS cache and never re-run
    // the module body, leaving the mock in place. Deleting the cache
    // entry guarantees the real implementations attach to W.evidence
    // for this suite.
    const paths = [
      "../../js/intelligence/evidence.js",
      "../../js/intelligence/evidence-builder.js",
      "../../js/ui/evidence-drawer.js",
    ];
    paths.forEach((p) => {
      const abs = require.resolve(p);
      delete require.cache[abs];
      require(abs);
    });
  });

  // ── evidence.create() ─────────────────────────────────────────

  describe("evidence.create() records provenance fields", () => {
    const baseInput = () => ({
      claim: "RSI oversold on 4h",
      evidence: "RSI(14) = 27.3",
      source: "technicalAnalysis",
      timestamp: "2026-09-20T10:00:00.000Z",
    });

    it("defaults relationship to 'unknown' when not supplied", () => {
      const rec = W.evidence.create(baseInput());
      expect(rec).to.be.an("object");
      expect(rec.relationship).to.equal("unknown");
    });

    it("does NOT default relationship to 'supporting'", () => {
      const rec = W.evidence.create(baseInput());
      expect(rec.relationship).to.not.equal("supporting");
    });

    it("preserves an explicitly supplied relationship", () => {
      const rec = W.evidence.create({
        ...baseInput(),
        relationship: "contradicting",
      });
      expect(rec.relationship).to.equal("contradicting");
    });

    it("normalizes an invalid relationship to 'unknown'", () => {
      const rec = W.evidence.create({
        ...baseInput(),
        relationship: "bullish",
      });
      expect(rec.relationship).to.equal("unknown");
    });

    it("observedAt defaults to the record's timestamp", () => {
      const rec = W.evidence.create(baseInput());
      expect(rec.observedAt).to.equal("2026-09-20T10:00:00.000Z");
    });

    it("observedAt preserves an explicit override", () => {
      const rec = W.evidence.create({
        ...baseInput(),
        observedAt: "2026-09-19T22:00:00.000Z",
      });
      expect(rec.observedAt).to.equal("2026-09-19T22:00:00.000Z");
    });

    it("freshness is null when not supplied — never fabricated", () => {
      const rec = W.evidence.create(baseInput());
      expect(rec.freshness).to.equal(null);
    });

    it("preserves a supplied freshness", () => {
      const rec = W.evidence.create({ ...baseInput(), freshness: 0.85 });
      expect(rec.freshness).to.equal(0.85);
    });

    it("methodologyVersion is null when not supplied", () => {
      const rec = W.evidence.create(baseInput());
      expect(rec.methodologyVersion).to.equal(null);
    });

    it("preserves a supplied methodologyVersion", () => {
      const rec = W.evidence.create({
        ...baseInput(),
        methodologyVersion: "shield-evm-v1",
      });
      expect(rec.methodologyVersion).to.equal("shield-evm-v1");
    });

    it("reliability is null when not supplied", () => {
      const rec = W.evidence.create(baseInput());
      expect(rec.reliability).to.equal(null);
    });
  });

  // ── evidence-builder.build() ──────────────────────────────────

  describe("evidence-builder.build() carries provenance", () => {
    const signal = () => ({
      id: "sig-1",
      source: "dexscreener",
      timestamp: "2026-09-20T10:00:00.000Z",
      type: "PRICE_MOVE",
    });

    it("populates source from the signal", () => {
      const e = W.evidence.build(signal());
      expect(e.source).to.equal("dexscreener");
    });

    it("populates observedAt from the signal timestamp", () => {
      const e = W.evidence.build(signal());
      expect(e.observedAt).to.equal("2026-09-20T10:00:00.000Z");
    });

    it("defaults relationship to 'unknown'", () => {
      const e = W.evidence.build(signal());
      expect(e.relationship).to.equal("unknown");
    });

    it("accepts relationship from options", () => {
      const e = W.evidence.build(signal(), { relationship: "supporting" });
      expect(e.relationship).to.equal("supporting");
    });

    it("normalizes an invalid relationship to 'unknown'", () => {
      const e = W.evidence.build(signal(), { relationship: "moon" });
      expect(e.relationship).to.equal("unknown");
    });

    it("accepts methodologyVersion from options", () => {
      const e = W.evidence.build(signal(), {
        methodologyVersion: "gem-v1",
      });
      expect(e.methodologyVersion).to.equal("gem-v1");
    });

    it("accepts methodologyVersion from the signal itself", () => {
      const s = signal();
      s.methodologyVersion = "gem-v1";
      const e = W.evidence.build(s);
      expect(e.methodologyVersion).to.equal("gem-v1");
    });

    it("methodologyVersion is null when neither source nor options supply it", () => {
      const e = W.evidence.build(signal());
      expect(e.methodologyVersion).to.equal(null);
    });

    it("aliases freshness to the computed dataFreshness", () => {
      const e = W.evidence.build(signal());
      expect(e).to.have.property("freshness");
      expect(e).to.have.property("dataFreshness");
      expect(e.freshness).to.equal(e.dataFreshness);
    });

    it("aliases reliability to the computed sourceReliability", () => {
      const e = W.evidence.build(signal());
      expect(e).to.have.property("reliability");
      expect(e).to.have.property("sourceReliability");
      expect(e.reliability).to.equal(e.sourceReliability);
    });
  });

  // ── Drawer rendering ──────────────────────────────────────────

  describe("evidence-drawer renderItems() shows every provenance field", () => {
    const renderItems = (items) =>
      W.ui.evidenceDrawer._internal.renderItems(items, "empty");

    it("renders 'unknown' for every missing field, not an omitted line", () => {
      const html = renderItems([{ title: "Item" }]);
      expect(html).to.include("Source: unknown");
      expect(html).to.include("Observed: unknown");
      expect(html).to.include("Freshness: unknown");
      expect(html).to.include("Methodology: unknown");
      expect(html).to.include("Relationship: unknown");
      expect(html).to.include("Reliability: unknown");
    });

    it("renders all six fields when all are present", () => {
      const html = renderItems([
        {
          title: "Item",
          source: "goplus",
          observedAt: "2026-09-20T10:00:00.000Z",
          freshness: 0.9,
          methodologyVersion: "shield-evm-v1",
          relationship: "supporting",
          reliability: 0.8,
        },
      ]);
      expect(html).to.include("Source: goplus");
      expect(html).to.include("Methodology: shield-evm-v1");
      expect(html).to.include("Relationship: supporting");
      expect(html).to.include("Freshness: 90%");
      expect(html).to.include("Reliability: 80%");
    });

    it("escapes user-supplied provenance strings", () => {
      const html = renderItems([
        { title: "<script>", source: "<img onerror=x>" },
      ]);
      expect(html).to.not.include("<script>");
      expect(html).to.not.include("<img onerror");
    });
  });

  // ── Drawer bucketing ──────────────────────────────────────────

  describe("evidence-drawer bucket() classifies domains by status", () => {
    it("marks 'verified' domains as supporting", () => {
      const b = W.ui.evidenceDrawer._internal.bucket({
        security: { status: "verified", source: "goplus" },
      });
      expect(b.supporting).to.have.length(1);
      expect(b.contradicting).to.have.length(0);
      expect(b.unknowns).to.have.length(0);
    });

    it("marks 'failed' domains as contradicting", () => {
      const b = W.ui.evidenceDrawer._internal.bucket({
        security: { status: "failed", source: "goplus" },
      });
      expect(b.contradicting).to.have.length(1);
    });

    it("marks unknown-status domains as unknowns", () => {
      const b = W.ui.evidenceDrawer._internal.bucket({
        security: { status: "unknown" },
      });
      expect(b.unknowns).to.have.length(1);
    });

    it("a domain with no relationship gets 'unknown', not 'supporting'", () => {
      const b = W.ui.evidenceDrawer._internal.bucket({
        something: { status: "partial" },
      });
      expect(b.supporting).to.have.length(0);
      expect(b.unknowns).to.have.length(1);
      expect(b.unknowns[0].relationship).to.equal("unknown");
    });
  });

  // ── Backwards-compat ──────────────────────────────────────────

  describe("existing behaviour is preserved", () => {
    it("evidence-builder still produces a bounded confidence", () => {
      const e = W.evidence.build(
        {
          id: "s",
          source: "dexscreener",
          timestamp: "2026-09-20T10:00:00Z",
        },
        {
          dataCompleteness: 1,
          interpretationConfidence: 0.9,
        },
      );
      expect(e.confidence).to.be.within(0, 1);
    });

    it("evidence-builder still rejects invalid signals", () => {
      expect(() => W.evidence.build({})).to.throw();
    });
  });
});
