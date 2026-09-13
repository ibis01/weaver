// ===============================================================
//         Evidence Builder – Canonical Evidence Layer
// ===============================================================
//
// Purpose: Convert raw signals into fully formed Evidence objects
// with computed source reliability, freshness, completeness,
// interpretation confidence, and overall evidence strength.
//
// The Decision Engine consumes Evidence, never reconstructs it.
//
// IMPORTANT: This module MERGES into W.evidence. It does not replace
// it. evidence.js defines the create/validate/sortByConfidence/
// filterByConfidence API; this file adds `build`. Together they form
// the full evidence API consumed by the decision engine.
// ===============================================================

window.W = window.W || {};
W.evidence = W.evidence || {};

(function () {
  // ── Import helpers from types ──────────────────────────────────
  const { getSourceReliability, computeFreshness, computeConfidence } =
    W.intelligence || {};

  /**
   * Build an Evidence object from a raw signal.
   * @param {Object} signal - The raw signal from the event collector.
   * @param {Object} options - Additional metadata (e.g., corroboration count, completeness).
   * @returns {Object} - A fully populated Evidence object.
   */
  function build(signal, options = {}) {
    if (!signal || !signal.id || !signal.source) {
      throw new Error("Invalid signal: missing id or source");
    }

    // 1. Source reliability – static per source
    const sourceReliability = getSourceReliability
      ? getSourceReliability(signal.source)
      : 0.5;

    // 2. Data freshness – decays with age
    const dataFreshness = computeFreshness
      ? computeFreshness(signal.timestamp, signal.type)
      : 0.8;

    // 3. Corroboration – number of independent sources confirming
    //    (if not provided, assume 1)
    let corroborationCount = options.corroborationCount || 1;
    if (typeof corroborationCount !== "number" || corroborationCount < 1) {
      corroborationCount = 1;
    }

    // 4. Data completeness – how complete the data is (0–1).
    // No default here: if the caller didn't supply it, we genuinely
    // don't know how complete the underlying data is. Passing that
    // through as null (rather than guessing 0.8) is what lets
    // computeConfidence() honestly report "confidence unavailable"
    // instead of a fabricated number. WEAVER_CONSTITUTION §2.7/§2.9.
    let dataCompleteness = options.dataCompleteness;
    if (dataCompleteness !== undefined && dataCompleteness !== null) {
      dataCompleteness = Math.max(0, Math.min(1, dataCompleteness));
    } else {
      dataCompleteness = null;
    }

    // 5. Interpretation confidence – model‑specific confidence.
    // Same principle: no invented per-signal-type defaults. A caller
    // that has a genuine, derived interpretation confidence should
    // supply it; otherwise this stays null.
    let interpretationConfidence = options.interpretationConfidence;
    if (
      interpretationConfidence !== undefined &&
      interpretationConfidence !== null
    ) {
      interpretationConfidence = Math.max(
        0,
        Math.min(1, interpretationConfidence),
      );
    } else {
      interpretationConfidence = null;
    }

    // 6. Compute overall confidence using the canonical model
    const evidence = {
      signalId: signal.id,
      sourceReliability,
      dataFreshness,
      corroborationCount,
      dataCompleteness,
      interpretationConfidence,
      reasoning: [],
    };

    evidence.confidence = computeConfidence
      ? computeConfidence(evidence)
      : dataCompleteness === null || interpretationConfidence === null
        ? null
        : sourceReliability *
          dataFreshness *
          (1 + (corroborationCount - 1) * 0.1) *
          dataCompleteness *
          interpretationConfidence;

    // Clamp confidence (only if it was actually computed)
    if (evidence.confidence !== null) {
      evidence.confidence = Math.max(0, Math.min(1, evidence.confidence));
    }

    // Add reasoning
    evidence.reasoning.push(
      `Source: ${signal.source} (reliability ${(sourceReliability * 100).toFixed(0)}%)`,
    );
    evidence.reasoning.push(`Freshness: ${(dataFreshness * 100).toFixed(0)}%`);
    evidence.reasoning.push(`Corroboration: ${corroborationCount} source(s)`);
    evidence.reasoning.push(
      dataCompleteness === null
        ? "Completeness: not available"
        : `Completeness: ${(dataCompleteness * 100).toFixed(0)}%`,
    );
    evidence.reasoning.push(
      interpretationConfidence === null
        ? "Interpretation: not available"
        : `Interpretation: ${(interpretationConfidence * 100).toFixed(0)}%`,
    );
    evidence.reasoning.push(
      evidence.confidence === null
        ? "Overall confidence: unavailable (evidence incomplete)"
        : `Overall confidence: ${(evidence.confidence * 100).toFixed(0)}%`,
    );

    // Store the raw signal id for reference
    evidence.signalId = signal.id;

    return evidence;
  }

  // ── Public API ────────────────────────────────────────────────────
  // MERGE into the existing W.evidence object. Do not replace it.
  // evidence.js defines create/validate/sortByConfidence/filterByConfidence.
  // This file adds build. Both are needed by the decision engine.
  W.evidence = W.evidence || {};
  W.evidence.build = build;

  console.log("[EvidenceBuilder] Module loaded.");
})();
