// ===============================================================
//         Evidence Engine for Weaver Intelligence
// ===============================================================
//
// CONFIDENCE POLICY (WEAVER_CONSTITUTION §2.9.1):
//   - A missing or invalid confidence is recorded as `null`,
//     never defaulted to 0.5.
//   - `null` confidence marks the record `incomplete`.
//   - Callers must handle null confidence honestly — either by
//     excluding the record or by surfacing "evidence incomplete".
// ===============================================================

window.W = window.W || {};
W.intelligence = W.intelligence || {};

W.evidence = (() => {
  // Confidence is intentionally NOT a required field. A valid record
  // may legitimately have null confidence — meaning "the fact is
  // established but its numerical certainty is not estimated".
  const REQUIRED_FIELDS = ["claim", "evidence", "source", "timestamp"];

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

    const record = {
      claim: typeof data.claim === "string" ? data.claim.trim() : null,
      evidence: typeof data.evidence === "string" ? data.evidence.trim() : null,
      source: typeof data.source === "string" ? data.source.trim() : null,
      timestamp: data.timestamp
        ? new Date(data.timestamp).toISOString()
        : new Date().toISOString(),
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

  return {
    create,
    validate,
    sortByConfidence,
    filterByConfidence,
  };
})();

console.log("[Evidence Engine] Module loaded.");
