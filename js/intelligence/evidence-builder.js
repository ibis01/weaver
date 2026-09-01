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

    // 4. Data completeness – how complete the data is (0–1)
    let dataCompleteness = options.dataCompleteness;
    if (dataCompleteness === undefined || dataCompleteness === null) {
      // If we have full price history, 0.9; if only a snapshot, 0.5.
      // For now, we'll use a default of 0.8 if not provided.
      dataCompleteness = 0.8;
    }
    dataCompleteness = Math.max(0, Math.min(1, dataCompleteness));

    // 5. Interpretation confidence – model‑specific confidence
    let interpretationConfidence = options.interpretationConfidence;
    if (
      interpretationConfidence === undefined ||
      interpretationConfidence === null
    ) {
      // Default is 0.7, but we can derive from signal type:
      if (signal.type === "PRICE_MOVE") {
        // For price moves, use the consistency of the move with technicals
        interpretationConfidence = 0.8;
      } else if (signal.type === "REGIME_SHIFT") {
        // Regime detection uses agreement ratio
        interpretationConfidence = 0.75;
      } else if (signal.type === "UNLOCK") {
        // Unlock data is usually reliable if from a verified source
        interpretationConfidence = 0.85;
      } else {
        interpretationConfidence = 0.7;
      }
    }
    interpretationConfidence = Math.max(
      0,
      Math.min(1, interpretationConfidence),
    );

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
      : sourceReliability *
        dataFreshness *
        (1 + (corroborationCount - 1) * 0.1) *
        dataCompleteness *
        interpretationConfidence;

    // Clamp confidence
    evidence.confidence = Math.max(0, Math.min(1, evidence.confidence));

    // Add reasoning
    evidence.reasoning.push(
      `Source: ${signal.source} (reliability ${(sourceReliability * 100).toFixed(0)}%)`,
    );
    evidence.reasoning.push(`Freshness: ${(dataFreshness * 100).toFixed(0)}%`);
    evidence.reasoning.push(`Corroboration: ${corroborationCount} source(s)`);
    evidence.reasoning.push(
      `Completeness: ${(dataCompleteness * 100).toFixed(0)}%`,
    );
    evidence.reasoning.push(
      `Interpretation: ${(interpretationConfidence * 100).toFixed(0)}%`,
    );
    evidence.reasoning.push(
      `Overall confidence: ${(evidence.confidence * 100).toFixed(0)}%`,
    );

    // Store the raw signal id for reference
    evidence.signalId = signal.id;

    return evidence;
  }

  // ── Public API ────────────────────────────────────────────────────
  W.evidence = {
    build,
  };

  console.log("[EvidenceBuilder] Module loaded.");
})();
