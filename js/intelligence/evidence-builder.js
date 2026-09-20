// ===============================================================
//         Evidence Builder – Canonical Evidence Layer
// ===============================================================
//
// Convert raw signals into fully formed Evidence objects with
// computed source reliability, freshness, completeness, and
// interpretation confidence.
//
// CONFIDENCE AUTHORITY:
//   The builder no longer computes confidence itself. It constructs
//   the evidence object, gathers the four factors, and delegates
//   the numeric confidence claim to
//   W.intelligence.computeConfidence() — the single authoritative
//   function. If that function returns null, confidence is null.
//
// MISSING DATA POLICY:
//   When a factor cannot be legitimately computed, it is `null`.
//   It is never replaced by a plausible-looking default. When any
//   factor is null, the canonical confidence function returns null
//   and the evidence is marked `incomplete: true`.
//
// CORROBORATION:
//   `corroborationCount` defaults to 1 (single source). This is a
//   fact about the signal, not an estimate. A caller that has
//   checked for independent corroboration should pass the count.
//
// PROVENANCE:
//   Every built record carries source, observedAt, freshness,
//   methodologyVersion, relationship, and reliability so downstream
//   consumers (drawer, track record) can display them without
//   needing to know which layer produced the evidence.
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

  // Resolve helpers at call time so load order does not matter.
  function helpers() {
    const intel = W.intelligence || {};
    return {
      getSourceReliability: intel.getSourceReliability,
      computeFreshness: intel.computeFreshness,
      computeConfidence: intel.computeConfidence,
    };
  }

  function safeIso(value) {
    if (!value) return null;
    try {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    } catch (_) {
      return null;
    }
  }

  function build(signal, options = {}) {
    if (!signal || !signal.id || !signal.source) {
      throw new Error("Invalid signal: missing id or source");
    }

    const { getSourceReliability, computeFreshness, computeConfidence } =
      helpers();

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
    //    inventing a number. Missing → null → canonical returns null.
    let dataCompleteness = options.dataCompleteness;
    if (dataCompleteness === undefined || dataCompleteness === null) {
      dataCompleteness = null;
    } else {
      dataCompleteness = Math.max(0, Math.min(1, dataCompleteness));
    }

    // 5. Interpretation confidence — same rule.
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

    // ── Provenance fields ─────────────────────────────────────
    const methodologyVersion =
      typeof options.methodologyVersion === "string" &&
      options.methodologyVersion.trim()
        ? options.methodologyVersion.trim()
        : typeof signal.methodologyVersion === "string" &&
            signal.methodologyVersion.trim()
          ? signal.methodologyVersion.trim()
          : null;

    const relationship = normalizeRelationship(options.relationship);

    const observedAt = safeIso(signal.timestamp);

    // ── Confidence — delegate to the canonical function ──────
    // The builder does not compute a numeric confidence itself.
    // If W.intelligence.computeConfidence is unavailable, or if any
    // of the four factors is null, the result is null.
    let confidence = null;
    const canonicalAvailable = typeof computeConfidence === "function";
    if (canonicalAvailable) {
      confidence = computeConfidence({
        sourceReliability,
        dataFreshness,
        corroborationCount,
        dataCompleteness,
        interpretationConfidence,
      });
    }

    const unknownCount = [
      sourceReliability,
      dataFreshness,
      dataCompleteness,
      interpretationConfidence,
    ].filter((v) => v === null).length;

    const evidence = {
      signalId: signal.id,
      source: signal.source,
      observedAt,
      freshness: dataFreshness,
      methodologyVersion,
      relationship,
      reliability: sourceReliability,
      // ── Existing factor fields (kept for compatibility) ────
      sourceReliability,
      dataFreshness,
      corroborationCount,
      dataCompleteness,
      interpretationConfidence,
      confidence,
      incomplete: unknownCount > 0,
      reasoning: [],
    };

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

    // The reasoning message distinguishes three null cases so a
    // reader can tell "we have no factors at all" from "the model
    // itself is missing" from "some factors are missing". The most
    // specific explanation wins.
    let confidenceMessage;
    if (confidence !== null) {
      confidenceMessage = `Overall confidence: ${(confidence * 100).toFixed(0)}%`;
    } else if (unknownCount === 4) {
      confidenceMessage = "Overall confidence: unavailable (no factors known)";
    } else if (!canonicalAvailable) {
      confidenceMessage =
        "Overall confidence: unavailable (confidence model not loaded)";
    } else {
      confidenceMessage =
        "Overall confidence: unavailable (one or more factors unknown)";
    }
    evidence.reasoning.push(confidenceMessage);

    return evidence;
  }

  // ── Public API ────────────────────────────────────────────────
  W.evidence = W.evidence || {};
  W.evidence.build = build;

  console.log("[EvidenceBuilder] Module loaded.");
})();
