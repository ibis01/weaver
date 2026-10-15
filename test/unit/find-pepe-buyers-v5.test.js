"use strict";

// §4.1 fail-closed regression tests. The bug this locks down:
// a provider failure in the pre-filter was being classified as
// NOT_BUYER, indistinguishable from a legitimate negative.

const assert = require("node:assert/strict");
const {
  classificationFromPrefilter,
  acceptanceCheck,
} = require("../../scripts/oneoff/find-pepe-buyers-v5.js");

describe("find-pepe-buyers-v5 — §4.1 failure semantics", () => {
  describe("classificationFromPrefilter", () => {
    it("classifies a provider failure as ERROR (not NOT_BUYER)", () => {
      const r = classificationFromPrefilter({
        pass: false,
        error: true,
        reason: "prefilter-fetch-failed",
      });
      assert.deepEqual(r, {
        classification: "ERROR",
        reason_code: "prefilter-fetch-failed",
      });
    });

    it("classifies a net-position rejection as NOT_BUYER", () => {
      const r = classificationFromPrefilter({
        pass: false,
        error: false,
        reason: "prefilter-net-below-1e24",
      });
      assert.deepEqual(r, {
        classification: "NOT_BUYER",
        reason_code: "prefilter-net-below-1e24",
      });
    });

    it("classifies no-window-activity as NOT_BUYER", () => {
      const r = classificationFromPrefilter({
        pass: false,
        error: false,
        reason: "prefilter-no-activity",
      });
      assert.equal(r.classification, "NOT_BUYER");
    });

    it("returns null to continue processing when the prefilter passed", () => {
      assert.equal(classificationFromPrefilter({ pass: true }), null);
    });

    it("returns null defensively when the result is missing", () => {
      assert.equal(classificationFromPrefilter(null), null);
      assert.equal(classificationFromPrefilter(undefined), null);
    });
  });

  describe("acceptanceCheck — completeness", () => {
    it("counts ERROR candidates separately from acquisition classes", () => {
      const results = [
        { classification: "BUYER",
          acquisitions: [{ classification: "DIRECT_ORIGINATOR" }] },
        { classification: "ERROR",
          reason_code: "prefilter-fetch-failed",
          acquisitions: [] },
        { classification: "NOT_BUYER",
          acquisitions: [{ classification: "UNRESOLVED" }] },
      ];
      const a = acceptanceCheck(results, 10);
      assert.equal(a.errorCandidates, 1);
      assert.equal(a.complete, false);
      assert.equal(a.candidatesProcessed, 3);
      assert.equal(a.acquisitionsByClass.DIRECT_ORIGINATOR, 1);
      assert.equal(a.acquisitionsByClass.UNRESOLVED, 1);
    });

    it("marks the run complete when no ERROR rows are present", () => {
      const results = [
        { classification: "BUYER",
          acquisitions: [{ classification: "DIRECT_ORIGINATOR" }] },
        { classification: "NOT_BUYER",
          acquisitions: [{ classification: "INTERMEDIARY" }] },
      ];
      const a = acceptanceCheck(results, 5);
      assert.equal(a.errorCandidates, 0);
      assert.equal(a.complete, true);
    });

    it("keeps the §6.6 ceiling check independent of ERROR count", () => {
      const results = [
        { classification: "NOT_BUYER",
          acquisitions: Array(41).fill({ classification: "UNRESOLVED" }) },
        { classification: "NOT_BUYER",
          acquisitions: Array(59).fill({ classification: "INTERMEDIARY" }) },
      ];
      const a = acceptanceCheck(results, 1);
      assert.ok(a.unresolvedPct > 40, "expected > 40% unresolved");
      assert.equal(a.unresolvedCeilingPass, false);
    });
  });
});
