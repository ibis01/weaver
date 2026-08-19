// ===============================================================
//         Evidence Engine for Weaver Intelligence
// ===============================================================

window.W = window.W || {};
W.intelligence = W.intelligence || {};

W.evidence = (() => {
  const REQUIRED_FIELDS = [
    "claim",
    "evidence",
    "source",
    "timestamp",
    "confidence",
  ];

  function create(data) {
    if (!data || typeof data !== "object") {
      console.warn("[Evidence] Invalid input: expected object.");
      return null;
    }

    const record = {
      claim: typeof data.claim === "string" ? data.claim.trim() : null,
      evidence: typeof data.evidence === "string" ? data.evidence.trim() : null,
      source: typeof data.source === "string" ? data.source.trim() : null,
      timestamp: data.timestamp
        ? new Date(data.timestamp).toISOString()
        : new Date().toISOString(),
      confidence: parseFloat(data.confidence),
    };

    if (
      isNaN(record.confidence) ||
      record.confidence < 0 ||
      record.confidence > 1
    ) {
      console.warn("[Evidence] Invalid confidence score. Defaulting to 0.5.");
      record.confidence = 0.5;
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

  function sortByConfidence(records) {
    if (!Array.isArray(records)) return [];
    return [...records].sort(
      (a, b) => (b.confidence || 0) - (a.confidence || 0),
    );
  }

  function filterByConfidence(records, minConfidence = 0.5) {
    if (!Array.isArray(records)) return [];
    return records.filter((r) => (r.confidence || 0) >= minConfidence);
  }

  return {
    create,
    validate,
    sortByConfidence,
    filterByConfidence,
  };
})();

console.log("[Evidence Engine] Module loaded.");
