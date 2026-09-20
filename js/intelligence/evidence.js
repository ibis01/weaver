// ===============================================================
//         Evidence Engine for Weaver Intelligence
// ===============================================================
//
// CONFIDENCE POLICY (WEAVER_CONSTITUTION §2.9):
//   - A missing or invalid confidence is recorded as `null`,
//     never defaulted to 0.5.
//   - `null` confidence marks the record `incomplete`.
//   - Callers must handle null confidence honestly — either by
//     excluding the record or by surfacing "evidence incomplete".
//
// PROVENANCE POLICY (WEAVER_CONSTITUTION §2.7):
//   - Every evidence record carries source, observedAt, freshness,
//     methodologyVersion, relationship, and reliability.
//   - Missing values are `null`, never fabricated.
//   - `relationship` defaults to "unknown" when not supplied by the
//     caller. It is never silently classified as "supporting".
//
// LOAD ORDER:
//   This module MERGES into W.evidence. It does not replace it.
//   evidence-builder.js augments the same namespace; a wholesale
//   replace here would drop functions another module attached first.
//   This matters in the test suite, where evidence-builder.js may
//   run before evidence.js.
// ===============================================================

window.W = window.W || {};
W.intelligence = W.intelligence || {};

W.evidence = W.evidence || {};

(function () {
  // Confidence is intentionally NOT a required field. A valid record
  // may legitimately have null confidence — meaning "the fact is
  // established but its numerical certainty is not estimated".
  const REQUIRED_FIELDS = ["claim", "evidence", "source", "timestamp"];

  // Relationship describes how an evidence item relates to the
  // scenario being evaluated. It is NOT inferred. A missing or
  // invalid value is "unknown" — the drawer must not upgrade it.
  const RELATIONSHIP_VALUES = new Set([
    "supporting",
    "contradicting",
    "neutral",
    "unknown",
  ]);

  function normalizeRelationship(value) {
    if (typeof value !== "string") return "unknown";
    const v = value.trim().toLowerCase();
    return RELATIONSHIP_VALUES.has(v) ? v : "unknown";
  }

  function create(data) {
    if (!data || typeof data !== "object") {
      console.warn("[Evidence] Invalid input: expected object.");
      return null;
    }

    const rawConfidence = parseFloat(data.confidence);
    const hasValidConfidence =
      Number.isFinite(rawConfidence) &&
      rawConfidence >= 0 &&
      rawConfidence <= 1;

    const timestamp = data.timestamp
      ? new Date(data.timestamp).toISOString()
      : new Date().toISOString();

    // observedAt defaults to the record's own timestamp when not
    // supplied. They coincide in most cases; a caller that knows the
    // underlying fact was observed at a different time can override.
    let observedAt = timestamp;
    if (data.observedAt) {
      try {
        const d = new Date(data.observedAt);
        if (Number.isFinite(d.getTime())) observedAt = d.toISOString();
      } catch (_) {
        // Leave as timestamp — invalid input does not throw.
      }
    }

    const record = {
      claim: typeof data.claim === "string" ? data.claim.trim() : null,
      evidence: typeof data.evidence === "string" ? data.evidence.trim() : null,
      source: typeof data.source === "string" ? data.source.trim() : null,
      timestamp,
      // ── Provenance fields (P1) ────────────────────────────────
      observedAt,
      freshness: Number.isFinite(data.freshness) ? data.freshness : null,
      methodologyVersion:
        typeof data.methodologyVersion === "string" &&
        data.methodologyVersion.trim()
          ? data.methodologyVersion.trim()
          : null,
      relationship: normalizeRelationship(data.relationship),
      reliability: Number.isFinite(data.reliability) ? data.reliability : null,
      // ── Confidence ────────────────────────────────────────────
      confidence: hasValidConfidence ? rawConfidence : null,
      incomplete: !hasValidConfidence,
    };

    if (!hasValidConfidence) {
      console.warn(
        "[Evidence] Missing or invalid confidence score. Record marked incomplete.",
      );
    }

    if (!record.claim || !record.evidence || !record.source) {
      console.warn(
        "[Evidence] Missing required fields. Record rejected.",
        data,
      );
      return null;
    }

    return record;
  }

  function validate(record) {
    if (!record || typeof record !== "object") return false;
    return REQUIRED_FIELDS.every(
      (field) => record[field] !== null && record[field] !== undefined,
    );
  }

  // Nulls sort to the bottom. `?? -1` ensures a null record never
  // outranks a record with a real confidence.
  function sortByConfidence(records) {
    if (!Array.isArray(records)) return [];
    return [...records].sort(
      (a, b) => (b.confidence ?? -1) - (a.confidence ?? -1),
    );
  }

  // Records with null confidence are excluded from a minimum-confidence
  // filter — they cannot be claimed to meet a threshold they don't have.
  function filterByConfidence(records, minConfidence = 0.5) {
    if (!Array.isArray(records)) return [];
    return records.filter(
      (r) =>
        r.confidence !== null &&
        r.confidence !== undefined &&
        r.confidence >= minConfidence,
    );
  }

  // ── Merge into the shared namespace ─────────────────────
  // Object.assign preserves any functions attached by other modules
  // (specifically evidence-builder.js's `build`). This mirrors the
  // policy documented in evidence-builder.js.
  Object.assign(W.evidence, {
    create,
    validate,
    sortByConfidence,
    filterByConfidence,
    _internal: {
      ...(W.evidence._internal || {}),
      normalizeRelationship,
      RELATIONSHIP_VALUES,
    },
  });
})();

console.log("[Evidence Engine] Module loaded.");
