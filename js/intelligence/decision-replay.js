// ===============================================================
//         Decision Replay Engine
// ===============================================================
//
// Purpose: Evaluate past decisions against current market outcomes
// to measure decision quality and confidence calibration.
// Rules: 21 (Data Correctness), 22 (Deterministic Math), 25 (Journal).
//
// ===============================================================

window.W = window.W || {};
W.decisionReplay = (() => {
  /**
   * Evaluate a single decision against current market data.
   * @param {Object} decision - The journal entry object.
   * @param {number} currentPrice - The current market price of the asset.
   * @returns {Object} - Structured outcome data.
   */
  function evaluate(decision, currentPrice) {
    // Rule 21: Never silently invent missing values.
    if (!decision || !currentPrice || !decision.price) {
      return {
        outcome: "inconclusive",
        priceDeltaPercent: 0,
        horizonStatus: "unknown",
        confidenceCalibration: "unknown",
        insight: "Missing baseline price data. Cannot evaluate outcome.",
      };
    }

    const entryPrice = parseFloat(decision.price);
    if (isNaN(entryPrice) || entryPrice <= 0) {
      return {
        outcome: "inconclusive",
        priceDeltaPercent: 0,
        horizonStatus: "unknown",
        confidenceCalibration: "unknown",
        insight: "Invalid entry price recorded.",
      };
    }

    // Deterministic math (Rule 22)
    const deltaPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    const action = String(decision.action || "").toLowerCase();

    let outcome = "inconclusive";
    if (action === "buy" && deltaPercent > 0) outcome = "successful";
    else if (action === "sell" && deltaPercent < 0) outcome = "successful";
    else if (deltaPercent !== 0) outcome = "unsuccessful";

    // Horizon check
    const horizonDays = parseInt(
      decision.horizonDays || decision.horizon || 30,
      10,
    );
    const horizonMs = horizonDays * 86400000;
    const timeSince = Date.now() - new Date(decision.timestamp).getTime();
    const horizonStatus = timeSince > horizonMs ? "expired" : "active";

    // Confidence Calibration
    const conf = parseFloat(decision.confidence) || 0.5;
    let calibration = "well_calibrated";
    if (conf >= 0.8 && outcome === "unsuccessful")
      calibration = "overconfident";
    else if (conf <= 0.3 && outcome === "successful")
      calibration = "underconfident";

    const direction = deltaPercent >= 0 ? "+" : "";

    return {
      decisionId: decision.id,
      outcome,
      priceDeltaPercent: deltaPercent,
      horizonStatus,
      confidenceCalibration: calibration,
      insight: `Price moved ${direction}${deltaPercent.toFixed(2)}% since your ${action} at $${entryPrice.toFixed(2)}.`,
    };
  }

  /**
   * Safe UI Renderer for outcome badges (Rule 15)
   */
  function renderBadge(outcomeData) {
    if (!outcomeData || outcomeData.outcome === "inconclusive") {
      return `<span class="replay-badge muted small" style="margin-left:8px; opacity:0.7;">⏳ Inconclusive</span>`;
    }

    let color = "var(--text-muted, #9aa3b2)";
    let icon = "️";
    let statusText = outcomeData.outcome.toUpperCase();

    if (outcomeData.outcome === "successful") {
      color = "var(--up, #2ee6a8)";
      icon = "✅";
    }
    if (outcomeData.outcome === "unsuccessful") {
      color = "var(--down, #ff5c7a)";
      icon = "❌";
    }

    // Using inline styles for simplicity, but text is static/safe to prevent XSS.
    return `<span class="replay-badge small" style="margin-left:8px; color:${color}; font-weight:bold;">${icon} ${statusText} (${outcomeData.priceDeltaPercent.toFixed(1)}%)</span>`;
  }

  return { evaluate, renderBadge };
})();

console.log("[DecisionReplay] Engine loaded.");
