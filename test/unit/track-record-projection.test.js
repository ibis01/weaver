// test/unit/track-record-projection.test.js
//
// Item 5 — normalized content projection for migration conflict
// detection.
//
// The narrow snapshotSignature() correctly identifies when two
// records share score, confidence, scoringVersion, and
// analysisTimestamp — but those four fields alone cannot
// distinguish two different analyses that happen to coincide on
// all of them.
//
// The projection maps both canonical and legacy-v0 snapshots onto
// a common semantic shape so "same analysis" can be compared as a
// value. Two records are deduplicated only when BOTH the narrow
// signature AND the projected content hash match.

const { expect } = require("chai");

require("../../js/features/track-record.js");

describe("Track Record migration — normalized content projection", () => {
  const LEGACY_KEY = "track_record_v0";

  function reset() {
    W.store.set("track_record", []);
    W.store.set(LEGACY_KEY, []);
    W.store.set("track_records", []);
    W.store.set("track_record_v1", []);
  }

  // ── analysisProjection() itself ─────────────────────────────

  describe("analysisProjection", () => {
    const { analysisProjection } = W.trackRecord._internal;

    it("normalizes analysisTimestamp 0, null, undefined to null", () => {
      expect(
        analysisProjection({ analysisTimestamp: 0 }).analysisTimestamp,
      ).to.equal(null);
      expect(
        analysisProjection({ analysisTimestamp: null }).analysisTimestamp,
      ).to.equal(null);
      expect(analysisProjection({}).analysisTimestamp).to.equal(null);
    });

    it("preserves a real analysisTimestamp", () => {
      expect(
        analysisProjection({ analysisTimestamp: 1700000000000 })
          .analysisTimestamp,
      ).to.equal(1700000000000);
    });

    it("normalizes 'UNKNOWN' scenario classification to null", () => {
      expect(
        analysisProjection({ scenario: { classification: "UNKNOWN" } })
          .scenarioClassification,
      ).to.equal(null);
    });

    it("preserves a real scenario classification", () => {
      expect(
        analysisProjection({ scenario: { classification: "BULLISH" } })
          .scenarioClassification,
      ).to.equal("BULLISH");
    });

    it("reads scenario from a top-level string", () => {
      expect(
        analysisProjection({ scenario: "BULLISH" }).scenarioClassification,
      ).to.equal("BULLISH");
    });

    it("reads scenario from unifiedVerdict.scenario", () => {
      expect(
        analysisProjection({
          unifiedVerdict: { scenario: "BEARISH" },
        }).scenarioClassification,
      ).to.equal("BEARISH");
    });

    it("counts supporting and contradicting evidence items", () => {
      const p = analysisProjection({
        evidence: {
          supporting: [{ title: "A" }, { title: "B" }],
          contradicting: [{ title: "C" }],
          missing: ["should not be counted", "nor this"],
        },
      });
      expect(p.supportingEvidenceCount).to.equal(2);
      expect(p.contradictingEvidenceCount).to.equal(1);
    });

    it("does NOT count missing evidence items", () => {
      // The `missing` array is a list of gaps, not evidence. Legacy
      // records populate it with a migration placeholder that would
      // otherwise cause false conflicts on every legitimate dedupe.
      const p = analysisProjection({
        evidence: {
          supporting: [],
          contradicting: [],
          missing: ["Legacy record did not include structured evidence"],
        },
      });
      expect(p.supportingEvidenceCount).to.equal(0);
      expect(p.contradictingEvidenceCount).to.equal(0);
    });

    it("treats null evidence the same as empty evidence", () => {
      const nullEvidence = analysisProjection({ evidence: null });
      const emptyEvidence = analysisProjection({
        evidence: { supporting: [], contradicting: [] },
      });
      expect(nullEvidence.supportingEvidenceCount).to.equal(0);
      expect(nullEvidence.contradictingEvidenceCount).to.equal(0);
      expect(emptyEvidence.supportingEvidenceCount).to.equal(0);
      expect(emptyEvidence.contradictingEvidenceCount).to.equal(0);
    });

    it("produces the same projection for canonical and legacy shapes of the same analysis", () => {
      const { analysisProjection: ap } = W.trackRecord._internal;

      const canonical = {
        asset: "BTC",
        scoringVersion: "vs-1",
        analysisTimestamp: null,
        unifiedVerdict: {
          score: 50,
          confidence: 0.5,
          scenario: null,
          evidenceVersion: "vs-1",
        },
        evidence: null,
      };

      const legacy = {
        asset: "BTC",
        scoringVersion: "vs-1",
        analysisTimestamp: 0,
        unifiedVerdict: { score: 50, confidence: 0.5 },
        scenario: { classification: "UNKNOWN" },
        evidence: {
          supporting: [],
          contradicting: [],
          missing: ["placeholder"],
        },
      };

      expect(ap(canonical)).to.deep.equal(ap(legacy));
    });
  });

  // ── immutableContentHash() distinguishes real differences ───

  describe("immutableContentHash", () => {
    const { immutableContentHash: h } = W.trackRecord._internal;

    const base = () => ({
      asset: "BTC",
      scoringVersion: "vs-1",
      analysisTimestamp: 1700000000000,
      unifiedVerdict: { score: 50, confidence: 0.5 },
    });

    it("is stable across key insertion order", () => {
      const a = {
        asset: "BTC",
        unifiedVerdict: { score: 50, confidence: 0.5 },
      };
      const b = {
        unifiedVerdict: { confidence: 0.5, score: 50 },
        asset: "BTC",
      };
      expect(h(a)).to.equal(h(b));
    });

    it("differs when asset differs", () => {
      expect(h({ ...base(), asset: "BTC" })).to.not.equal(
        h({ ...base(), asset: "ETH" }),
      );
    });

    it("differs when scenario classification differs", () => {
      expect(
        h({ ...base(), scenario: { classification: "BULLISH" } }),
      ).to.not.equal(h({ ...base(), scenario: { classification: "BEARISH" } }));
    });

    it("differs when evidence counts differ", () => {
      expect(
        h({
          ...base(),
          evidence: { supporting: [{ title: "A" }], contradicting: [] },
        }),
      ).to.not.equal(
        h({
          ...base(),
          evidence: { supporting: [], contradicting: [] },
        }),
      );
    });

    it("matches for the same content in different shapes", () => {
      const canonical = {
        asset: "BTC",
        scoringVersion: "vs-1",
        analysisTimestamp: null,
        unifiedVerdict: { score: 50, confidence: 0.5, evidenceVersion: "vs-1" },
        evidence: null,
      };
      const legacy = {
        asset: "BTC",
        scoringVersion: "vs-1",
        analysisTimestamp: 0,
        unifiedVerdict: { score: 50, confidence: 0.5 },
        scenario: { classification: "UNKNOWN" },
        evidence: {
          supporting: [],
          contradicting: [],
          missing: ["placeholder"],
        },
      };
      expect(h(canonical)).to.equal(h(legacy));
    });
  });

  // ── Migration behavior with the new gate ────────────────────

  describe("migration dedupe gate", () => {
    it("dedupes canonical/legacy records with matching signature AND content", () => {
      reset();
      const record = W.trackRecord.createFromAnalysis(
        { opportunityScore: 50, confidence: 0.5, scoringVersion: "vs-1" },
        { symbol: "BTC" },
      );
      W.store.set(LEGACY_KEY, [
        {
          recordId: record.recordId,
          symbol: "BTC",
          opportunityScore: 50,
          confidence: 0.5,
          scoringVersion: "vs-1",
          analysisTimestamp: record.weaverSnapshot.analysisTimestamp,
        },
      ]);
      const summary = W.trackRecord.migrate();
      expect(summary.deduped).to.be.greaterThan(0);
      expect(summary.conflicts).to.equal(0);
      expect(W.trackRecord.getAll()).to.have.length(1);
    });

    it("conflicts when signature matches but asset differs", () => {
      reset();
      const record = W.trackRecord.createFromAnalysis(
        { opportunityScore: 50, confidence: 0.5, scoringVersion: "vs-1" },
        { symbol: "BTC" },
      );
      W.store.set(LEGACY_KEY, [
        {
          recordId: record.recordId,
          symbol: "ETH",
          opportunityScore: 50,
          confidence: 0.5,
          scoringVersion: "vs-1",
          analysisTimestamp: record.weaverSnapshot.analysisTimestamp,
        },
      ]);
      const summary = W.trackRecord.migrate();
      expect(summary.conflicts).to.equal(1);
      expect(summary.deduped).to.equal(0);
    });

    it("conflicts when signature matches but scenario classification differs", () => {
      reset();
      const record = W.trackRecord.createFromAnalysis(
        {
          opportunityScore: 50,
          confidence: 0.5,
          scoringVersion: "vs-1",
          scenario: { classification: "BULLISH" },
        },
        { symbol: "BTC" },
      );
      W.store.set(LEGACY_KEY, [
        {
          recordId: record.recordId,
          symbol: "BTC",
          opportunityScore: 50,
          confidence: 0.5,
          scoringVersion: "vs-1",
          analysisTimestamp: record.weaverSnapshot.analysisTimestamp,
        },
      ]);
      const summary = W.trackRecord.migrate();
      expect(summary.conflicts).to.equal(1);
    });

    it("conflicts when signature matches but evidence counts differ", () => {
      reset();
      const record = W.trackRecord.createFromAnalysis(
        {
          opportunityScore: 50,
          confidence: 0.5,
          scoringVersion: "vs-1",
          evidence: {
            supporting: [{ title: "A" }, { title: "B" }],
            contradicting: [],
          },
        },
        { symbol: "BTC" },
      );
      W.store.set(LEGACY_KEY, [
        {
          recordId: record.recordId,
          symbol: "BTC",
          opportunityScore: 50,
          confidence: 0.5,
          scoringVersion: "vs-1",
          analysisTimestamp: record.weaverSnapshot.analysisTimestamp,
        },
      ]);
      const summary = W.trackRecord.migrate();
      expect(summary.conflicts).to.equal(1);
    });

    it("conflict IDs are deterministic across re-runs", () => {
      reset();
      const record = W.trackRecord.createFromAnalysis(
        {
          opportunityScore: 50,
          confidence: 0.5,
          scoringVersion: "vs-1",
          scenario: { classification: "BULLISH" },
        },
        { symbol: "BTC" },
      );
      W.store.set(LEGACY_KEY, [
        {
          recordId: record.recordId,
          symbol: "BTC",
          opportunityScore: 50,
          confidence: 0.5,
          scoringVersion: "vs-1",
          analysisTimestamp: record.weaverSnapshot.analysisTimestamp,
        },
      ]);
      W.trackRecord.migrate();
      const ids1 = W.trackRecord
        .getAll()
        .map((r) => r.id)
        .sort();

      W.trackRecord.migrate();
      const ids2 = W.trackRecord
        .getAll()
        .map((r) => r.id)
        .sort();

      expect(ids2).to.deep.equal(ids1);
    });
  });
});
