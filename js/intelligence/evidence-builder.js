// ===============================================================
//         Evidence Builder – Canonical Evidence Layer
// ===============================================================
//
// Convert raw signals into fully formed Evidence objects with
// computed source reliability, freshness, completeness, and
// interpretation confidence.
//
// MISSING DATA POLICY:
//   When a factor cannot be legitimately computed, it is `null`.
//   It is never replaced by a plausible-looking default. The overall
//   confidence is a product of KNOWN factors only; each unknown
//   factor reduces confidence rather than being invented.
//
//   If no factor is known, confidence is `null` and the evidence is
//   marked `incomplete: true`.
//
// CORROBORATION:
//   `corroborationCount` defaults to 1 (single source). This is a
//   fact about the signal, not an estimate. A caller that has
//   checked for independent corroboration should pass the count.
//
// LOAD ORDER:
//   This module looks up W.intelligence at CALL time, not at load
//   time. That is required because concat.js loads evidence-builder.js
//   before types.js defines W.intelligence.getSourceReliability and
//   friends. Loading the helpers at top-level would capture undefined.
//
// This module MERGES into W.evidence. It does not replace it.
// evidence.js defines create/validate/sortByConfidence/filterByConfidence.
// ===============================================================

window.W = window.W || {};
W.evidence = W.evidence || {};

(function () {
  // Resolve helpers at call time so load order does not matter.
  function helpers() {
    const intel = W.intelligence || {};
    return {
      getSourceReliability: intel.getSourceReliability,
      computeFreshness: intel.computeFreshness,
    };
  }

  function build(signal, options = {}) {
    if (!signal || !signal.id || !signal.source) {
      throw new Error("Invalid signal: missing id or source");
    }

    const { getSourceReliability, computeFreshness } = helpers();

    // 1. Source reliability — static per source. Null when the
    //    reliability table isn't available. We do not guess 0.5.
    const sourceReliability =
      typeof getSourceReliability === "function"
        ? getSourceReliability(signal.source)
        : null;

    // 2. Data freshness — decays with age. Null when the freshness
    //    model isn't available. We do not guess 0.8.
    const dataFreshness =
      typeof computeFreshness === "function"
        ? computeFreshness(signal.timestamp, signal.type)
        : null;

    // 3. Corroboration — number of independent sources confirming.
    //    Defaults to 1. This is factual: the signal arrived from one
    //    source. It is not a claim about corroboration research.
    let corroborationCount = options.corroborationCount;
    if (typeof corroborationCount !== "number" || corroborationCount < 1) {
      corroborationCount = 1;
    }

    // 4. Data completeness — must be supplied. We have no basis for
    //    inventing a number. Missing → null → evidence incomplete.
    let dataCompleteness = options.dataCompleteness;
    if (dataCompleteness === undefined || dataCompleteness === null) {
      dataCompleteness = null;
    } else {
      dataCompleteness = Math.max(0, Math.min(1, dataCompleteness));
    }

    // 5. Interpretation confidence — same rule. If the caller did not
    //    supply one, we do not fabricate one per signal type.
    let interpretationConfidence = options.interpretationConfidence;
    if (
      interpretationConfidence === undefined ||
      interpretationConfidence === null
    ) {
      interpretationConfidence = null;
    } else {
      interpretationConfidence = Math.max(
        0,
        Math.min(1, interpretationConfidence),
      );
    }

    const evidence = {
      signalId: signal.id,
      sourceReliability,
      dataFreshness,
      corroborationCount,
      dataCompleteness,
      interpretationConfidence,
      reasoning: [],
    };

    // ── Confidence computation ─────────────────────────────────
    // Product of known factors only. Unknown factors are excluded
    // and penalise the result rather than being replaced with
    // invented numbers.
    const knownFactors = [];
    if (sourceReliability !== null) knownFactors.push(sourceReliability);
    if (dataFreshness !== null) knownFactors.push(dataFreshness);
    if (dataCompleteness !== null) knownFactors.push(dataCompleteness);
    if (interpretationConfidence !== null)
      knownFactors.push(interpretationConfidence);

    const unknownCount = [
      sourceReliability,
      dataFreshness,
      dataCompleteness,
      interpretationConfidence,
    ].filter((v) => v === null).length;

    let confidence = null;

    if (knownFactors.length > 0) {
      // Base: product of known factors.
      confidence = knownFactors.reduce((a, b) => a * b, 1);

      // Corroboration boost: only applied when a caller supplied a
      // corroboration count greater than 1.
      if (corroborationCount > 1) {
        confidence *= 1 + (corroborationCount - 1) * 0.1;
      }

      // Unknown-factor penalty: each unknown factor reduces
      // confidence by 30%. "We don't know" lowers certainty —
      // it does not raise it.
      confidence *= Math.pow(0.7, unknownCount);

      confidence = Math.max(0, Math.min(1, confidence));
    }
    // If knownFactors is empty, confidence remains null. We have no
    // basis for a numeric claim.

    evidence.confidence = confidence;
    evidence.incomplete = unknownCount > 0;

    // ── Reasoning ──────────────────────────────────────────────
    evidence.reasoning.push(
      sourceReliability !== null
        ? `Source: ${signal.source} (reliability ${(sourceReliability * 100).toFixed(0)}%)`
        : `Source: ${signal.source} (reliability unknown)`,
    );
    evidence.reasoning.push(
      dataFreshness !== null
        ? `Freshness: ${(dataFreshness * 100).toFixed(0)}%`
        : "Freshness: unknown",
    );
    evidence.reasoning.push(`Corroboration: ${corroborationCount} source(s)`);
    evidence.reasoning.push(
      dataCompleteness !== null
        ? `Completeness: ${(dataCompleteness * 100).toFixed(0)}%`
        : "Completeness: unknown",
    );
    evidence.reasoning.push(
      interpretationConfidence !== null
        ? `Interpretation: ${(interpretationConfidence * 100).toFixed(0)}%`
        : "Interpretation: unknown",
    );
    evidence.reasoning.push(
      confidence !== null
        ? `Overall confidence: ${(confidence * 100).toFixed(0)}%${unknownCount > 0 ? " (reduced — some factors unknown)" : ""}`
        : "Overall confidence: unavailable (no factors known)",
    );

    return evidence;
  }

  // ── Public API ────────────────────────────────────────────────
  W.evidence = W.evidence || {};
  W.evidence.build = build;

  console.log("[EvidenceBuilder] Module loaded.");
})();
