// ===============================================================
//         "Why It Matters" Context Generator
// ===============================================================
// CSP Compliant: no style="" attributes. Dynamic styles via CSSOM.
// ===============================================================
//
// EVIDENCE_CONFIDENCE_NOTE: every evidence item generated here comes
// from a direct, local, synchronous read of the user's own data
// (portfolio holdings, theses, journal) — never a network call. There
// is no meaningful estimation uncertainty in "does this holding exist
// in the user's portfolio" the way there is for, say, a market-data
// API response. Confidence is therefore fixed at 1.0 for all evidence
// here rather than an arbitrary descending sequence (0.95/0.9/0.85)
// that previously implied a precision this data never had. If a
// genuinely probabilistic local source is added later (e.g. a
// behavioral-pattern inference), it should carry its own honestly
// computed confidence — not reuse this constant.
//
// NO-EVIDENCE NOTE: when there is no evidence at all, confidence
// must be `null`, never `0.5`. A fabricated "middle" value implies
// certainty that does not exist. See WEAVER_CONSTITUTION §2.9.
//
// v2 changelog (canonical-contract enforcement):
//   - Confidence aggregation delegated to
//     W.intelligence.computeAggregateConfidence(). This module no
//     longer performs any arithmetic on confidence values directly.
//     The contract in types.js is the sole owner of every confidence
//     computation — see the "one confidence function" rule in
//     intelligence-contracts-v1.
//   - The prior
//         evidence.reduce((sum, e) => sum + e.confidence, 0)
//     silently treated a null confidence as zero, because
//     `0 + null === 0`. A null means "could not be measured" — it
//     must not drag the aggregate toward zero. The canonical
//     function excludes null items from the average and reports
//     `coverage` (measured / total) instead.
//   - The returned object now carries `confidenceCoverage` so the
//     renderer can distinguish "0.7 from 3 of 3 items" from
//     "0.7 from 3 of 5 items". Coverage is honest metadata, not a
//     confidence number.
//   - renderContext() displays coverage when it is less than 1.
//   - event.type comparisons now use the canonical SIGNAL_TYPE
//     enum rather than the legacy lowercase strings.
// ===============================================================

window.W = window.W || {};
W.context = (() => {
  // Canonical signal types. Falls back to literals if types.js has
  // not loaded yet, which cannot happen in practice given concat.js
  // ordering, but costs nothing to defend against.
  const SIGNAL_TYPE = W.intelligence?.types?.SIGNAL_TYPE || {
    PRICE_MOVE: "PRICE_MOVE",
    REGIME_SHIFT: "REGIME_SHIFT",
    UNLOCK: "UNLOCK",
    OPPORTUNITY: "OPPORTUNITY",
    THESIS_DETERIORATION: "THESIS_DETERIORATION",
    BEHAVIORAL_PATTERN: "BEHAVIORAL_PATTERN",
  };

  function generateContext(event, userContext) {
    const portfolio = userContext?.portfolio || [];
    const theses = userContext?.theses || [];
    const journal = userContext?.journal || [];
    const behavior = userContext?.behavior || { pattern: "none" };

    const symbol = event?.symbol?.toUpperCase();
    if (!symbol) return null;

    const holding = portfolio.find((h) => h?.symbol?.toUpperCase() === symbol);
    const thesis = theses.find((t) => t?.asset?.toUpperCase() === symbol);
    const recentDecisions = journal.filter(
      (d) =>
        d?.asset?.toUpperCase() === symbol &&
        Date.now() - new Date(d.timestamp).getTime() < 7 * 86400000,
    );

    let whyItMatters = "";
    let personalRelevance = "low";
    let thesisImpact = "none";
    let recommendedAction = "Monitor the broader market.";
    const evidence = [];

    if (holding) {
      personalRelevance = "high";
      const qty = parseFloat(holding.qty) || 0;
      whyItMatters += `You hold ${qty} ${symbol}. `;
      evidence.push({
        claim: `User holds ${symbol}`,
        evidence: `${qty} units`,
        source: "portfolio",
        timestamp: holding.updatedAt || new Date().toISOString(),
        // Direct local data read — a verified fact, not an estimate.
        // See EVIDENCE_CONFIDENCE_NOTE above.
        confidence: 1.0,
      });
    }

    if (thesis) {
      whyItMatters += `You have an active thesis on ${symbol}. `;
      // Compare against the canonical signal-type enum rather than
      // legacy lowercase strings. The previous `=== "price_change"`
      // and `=== "unlock"` never matched a canonical signal, so the
      // thesis-impact branch was dead code.
      const type = event?.type;
      if (
        (type === SIGNAL_TYPE.PRICE_MOVE && event.impactValue > 0.6) ||
        type === SIGNAL_TYPE.UNLOCK
      ) {
        thesisImpact = "weakening";
        recommendedAction = "Review your thesis invalidation conditions.";
      }
      evidence.push({
        claim: `User has thesis on ${symbol}`,
        evidence: thesis.statement || "Thesis exists",
        source: "theses",
        timestamp: thesis.createdAt || new Date().toISOString(),
        confidence: 1.0,
      });
    }

    if (recentDecisions.length > 0) {
      whyItMatters += `You made ${recentDecisions.length} decision(s) regarding ${symbol} in the last 7 days. `;
      evidence.push({
        claim: `Recent decisions on ${symbol}`,
        evidence: `${recentDecisions.length} recent journal entries`,
        source: "journal",
        timestamp:
          recentDecisions
            .map((d) => d.timestamp)
            .sort()
            .reverse()[0] || new Date().toISOString(),
        confidence: 1.0,
      });
    }

    if (behavior?.pattern !== "none" && personalRelevance === "high") {
      whyItMatters += `Note: Your recent behavior shows a "${behavior.pattern}" pattern. Proceed with caution. `;
    }

    if (!whyItMatters) {
      whyItMatters = `This event may impact the broader market, but you have no direct exposure to ${symbol}.`;
    }

    // ── Confidence aggregation — DELEGATED ────────────────────
    //
    // This module does not compute a confidence number. The canonical
    // aggregator in types.js owns the arithmetic, including the
    // null-exclusion policy: evidence items with a null confidence
    // are excluded from the average, not treated as zero. If every
    // item is null, the aggregate is null — never a fabricated
    // midpoint.
    let confidence = null;
    let confidenceCoverage = 0;
    let confidenceMeasured = 0;
    let confidenceTotal = 0;

    if (Array.isArray(evidence) && evidence.length > 0) {
      const agg = W.intelligence?.computeAggregateConfidence?.(evidence);
      if (agg) {
        confidence = agg.confidence;
        confidenceCoverage = agg.coverage;
        confidenceMeasured = agg.measuredCount;
        confidenceTotal = agg.totalCount;
      }
    }

    return {
      event,
      whyItMatters,
      personalRelevance,
      thesisImpact,
      recommendedAction,
      evidence,
      confidence,
      confidenceCoverage,
      confidenceMeasured,
      confidenceTotal,
    };
  }

  function renderContext(container, contextData) {
    if (!container || !contextData) return;
    const existing = container.querySelector(".context-render");
    if (existing) existing.remove();

    const div = document.createElement("div");
    div.className =
      "context-render mt-8 p-16 bg-surface border-l-brand rounded";

    const title = document.createElement("div");
    title.className = "small-text font-bold";
    title.textContent = "Why it matters:";
    div.appendChild(title);

    const text = document.createElement("div");
    text.className = "small-text text-muted mt-4 leading-relaxed";
    text.textContent = contextData.whyItMatters;
    div.appendChild(text);

    if (
      contextData.recommendedAction &&
      contextData.personalRelevance !== "low"
    ) {
      const action = document.createElement("div");
      action.className = "small-text text-up mt-6";
      action.textContent = `→ ${contextData.recommendedAction}`;
      div.appendChild(action);
    }

    // Only display a confidence percentage when one is genuinely
    // known. A null confidence renders an honest "unavailable"
    // message rather than a fabricated 0% or 50%.
    if (
      contextData.confidence !== undefined &&
      contextData.confidence !== null
    ) {
      const conf = document.createElement("div");
      conf.className = "small-text text-muted mt-4";
      const pct = (contextData.confidence * 100).toFixed(0);
      // Coverage note when some evidence could not be measured.
      // "3 of 5 measured" is materially different from "5 of 5
      // measured" even when the numeric confidence is identical.
      const cov = contextData.confidenceCoverage;
      const measured = contextData.confidenceMeasured;
      const total = contextData.confidenceTotal;
      const covText =
        typeof cov === "number" &&
        cov < 1 &&
        Number.isFinite(measured) &&
        Number.isFinite(total) &&
        total > 0
          ? ` (based on ${measured} of ${total} evidence items)`
          : "";
      conf.textContent = `Confidence: ${pct}%${covText}`;
      div.appendChild(conf);
    } else {
      const noConf = document.createElement("div");
      noConf.className = "small-text text-muted mt-4 italic";
      noConf.textContent =
        "Confidence: unavailable (no evidence for this asset).";
      div.appendChild(noConf);
    }

    container.appendChild(div);
  }

  return { generateContext, renderContext };
})();

console.log(
  "[Context] Why It Matters generator loaded (Phase 6 ready, CSP compliant, canonical confidence).",
);
