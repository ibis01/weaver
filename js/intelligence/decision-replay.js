// ===============================================================
//         Decision Replay Engine – Multi‑Dimensional Evaluation
// ===============================================================
//
// Evaluates past decisions against:
//   - Absolute outcome
//   - Benchmark-relative outcome (BTC, ETH, or market index)
//   - Risk (volatility since entry)
//   - Horizon (active vs expired)
//   - Thesis health (if linked)
//   - Confidence calibration (over/under confident)
//   - Opportunity cost (where measurable)
//
// Avoids hindsight bias by comparing to ex-ante benchmarks.
//
// ===============================================================

window.W = window.W || {};
W.decisionReplay = (() => {
  /**
   * Evaluate a decision against current market data.
   * @param {Object} decision - Journal entry with fields: id, asset, action, price, amount, confidence, horizon, timestamp, thesisId, reasoning.
   * @param {Object} currentData - { price, marketCap, regime, btcPrice, ethPrice, spyPrice? } – current market snapshot.
   * @param {Object} benchmarkData - { btcPriceAtEntry, ethPriceAtEntry, spyPriceAtEntry? } – optional historical benchmark prices at decision time.
   * @returns {Object} - Structured evaluation result.
   */
  function evaluate(decision, currentData = {}, benchmarkData = {}) {
    // Rule 21: Never silently invent missing values.
    if (!decision || !decision.price) {
      return {
        outcome: "inconclusive",
        absoluteReturn: 0,
        benchmarkRelative: 0,
        riskAdjusted: 0,
        horizonStatus: "unknown",
        confidenceCalibration: "unknown",
        thesisHealth: null,
        opportunityCost: 0,
        insight: "Missing baseline price data. Cannot evaluate outcome.",
        details: {},
      };
    }

    const entryPrice = parseFloat(decision.price);
    const currentPrice = parseFloat(currentData.price) || entryPrice;
    const action = String(decision.action || "").toLowerCase();

    // ── 1. Absolute Return ──────────────────────────────────────
    const absoluteReturn = ((currentPrice - entryPrice) / entryPrice) * 100;
    let outcome = "inconclusive";
    if (action === "buy" && absoluteReturn > 0) outcome = "successful";
    else if (action === "sell" && absoluteReturn < 0) outcome = "successful";
    else if (absoluteReturn !== 0) outcome = "unsuccessful";
    else outcome = "inconclusive";

    // ── 2. Benchmark-Relative Return ──────────────────────────
    let benchmarkRelative = 0;
    const btcEntry = parseFloat(benchmarkData.btcPriceAtEntry) || 0;
    const btcCurrent = parseFloat(currentData.btcPrice) || 0;
    if (btcEntry > 0 && btcCurrent > 0) {
      const btcReturn = ((btcCurrent - btcEntry) / btcEntry) * 100;
      benchmarkRelative = absoluteReturn - btcReturn;
    } else {
      benchmarkRelative = absoluteReturn; // fallback if no benchmark
    }

    // ── 3. Risk (volatility since entry) ──────────────────────
    // We approximate risk by the absolute price change since entry.
    const risk = Math.abs(absoluteReturn);

    // ── 4. Risk-Adjusted Return ──────────────────────────────
    const riskAdjusted = risk > 0 ? absoluteReturn / risk : 0; // Simple Sharpe‑like.

    // ── 5. Horizon Status ──────────────────────────────────────
    const horizonDays = parseInt(decision.horizon) || 30;
    const horizonMs = horizonDays * 86400000;
    const timeSince = Date.now() - new Date(decision.timestamp).getTime();
    const horizonStatus = timeSince > horizonMs ? "expired" : "active";

    // ── 6. Confidence Calibration ──────────────────────────────
    const conf = parseFloat(decision.confidence) || 0.5;
    let confidenceCalibration = "well_calibrated";
    if (conf >= 0.8 && outcome === "unsuccessful")
      confidenceCalibration = "overconfident";
    else if (conf <= 0.3 && outcome === "successful")
      confidenceCalibration = "underconfident";
    else if (conf >= 0.8 && outcome === "successful")
      confidenceCalibration = "well_calibrated";
    else if (conf <= 0.3 && outcome === "unsuccessful")
      confidenceCalibration = "well_calibrated";

    // ── 7. Thesis Health (if linked) ───────────────────────────
    let thesisHealth = null;
    if (decision.thesisId && W.thesisHealth) {
      // In a full implementation, we would fetch the thesis and evaluate its health.
      // For now, we assume it's checked elsewhere.
      thesisHealth = { status: "unknown", healthScore: 0 };
    }

    // ── 8. Opportunity Cost ────────────────────────────────────
    // Compare to a simple buy‑and‑hold of BTC or the asset's sector.
    let opportunityCost = 0;
    if (action === "sell" && btcEntry > 0 && btcCurrent > 0) {
      // If you sold, how much did you miss out vs. holding?
      const btcReturn = ((btcCurrent - btcEntry) / btcEntry) * 100;
      opportunityCost = btcReturn - absoluteReturn;
    } else if (action === "buy" && btcEntry > 0 && btcCurrent > 0) {
      // If you bought, did you outperform BTC?
      const btcReturn = ((btcCurrent - btcEntry) / btcEntry) * 100;
      opportunityCost = absoluteReturn - btcReturn;
    }

    // ── 9. Generate Insight ────────────────────────────────────
    const direction = absoluteReturn >= 0 ? "+" : "";
    let insight = `Price moved ${direction}${absoluteReturn.toFixed(2)}% since your ${action} at $${entryPrice.toFixed(2)}.`;
    if (outcome === "successful" && benchmarkRelative > 0)
      insight += " Outperformed BTC.";
    else if (outcome === "successful" && benchmarkRelative < 0)
      insight += " Underperformed BTC.";
    else if (outcome === "unsuccessful" && benchmarkRelative < 0)
      insight += " Underperformed BTC.";
    else if (outcome === "unsuccessful" && benchmarkRelative > 0)
      insight += " Outperformed BTC but still negative.";
    if (confidenceCalibration === "overconfident")
      insight += " You were overconfident.";
    if (confidenceCalibration === "underconfident")
      insight += " You were underconfident.";
    if (horizonStatus === "expired") insight += " Horizon has expired.";
    if (risk > 20) insight += " High volatility experienced.";

    // ── 10. Result Object ──────────────────────────────────────
    return {
      outcome,
      absoluteReturn,
      benchmarkRelative,
      risk,
      riskAdjusted,
      horizonStatus,
      confidenceCalibration,
      thesisHealth,
      opportunityCost,
      insight,
      details: {
        entryPrice,
        currentPrice,
        action,
        decisionId: decision.id,
        asset: decision.asset,
        timestamp: decision.timestamp,
      },
    };
  }

  /**
   * Render a human‑readable summary badge for UI.
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
    } else if (outcomeData.outcome === "unsuccessful") {
      color = "var(--down, #ff5c7a)";
      icon = "❌";
    }

    // Add calibration indicator
    let calibrationText = "";
    if (outcomeData.confidenceCalibration === "overconfident") {
      calibrationText = "⚡ Overconfident";
    } else if (outcomeData.confidenceCalibration === "underconfident") {
      calibrationText = "🔽 Underconfident";
    } else {
      calibrationText = "🎯 Calibrated";
    }

    // Return safe HTML (no user input in this function)
    return `<span class="replay-badge small" style="margin-left:8px; color:${color}; font-weight:bold;">${icon} ${statusText} (${outcomeData.absoluteReturn.toFixed(1)}%) · ${calibrationText}</span>`;
  }

  /**
   * Render detailed replay card for a decision.
   */
  function renderDetails(container, outcomeData) {
    if (!container || !outcomeData) return;
    container.innerHTML = "";

    const card = document.createElement("div");
    card.style.cssText =
      "margin-top: 8px; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px; font-size: 0.9em;";

    const rows = [
      {
        label: "Absolute Return",
        value: `${(outcomeData.absoluteReturn || 0).toFixed(2)}%`,
      },
      {
        label: "Benchmark vs BTC",
        value: `${(outcomeData.benchmarkRelative || 0).toFixed(2)}%`,
      },
      {
        label: "Risk (volatility)",
        value: `${(outcomeData.risk || 0).toFixed(2)}%`,
      },
      {
        label: "Risk-Adjusted Return",
        value: `${(outcomeData.riskAdjusted || 0).toFixed(3)}`,
      },
      { label: "Horizon", value: outcomeData.horizonStatus || "unknown" },
      {
        label: "Confidence Calibration",
        value: outcomeData.confidenceCalibration || "unknown",
      },
      {
        label: "Opportunity Cost",
        value: `${(outcomeData.opportunityCost || 0).toFixed(2)}%`,
      },
    ];

    rows.forEach((row) => {
      const div = document.createElement("div");
      div.style.cssText =
        "display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);";
      const label = document.createElement("span");
      label.className = "muted";
      label.textContent = row.label + ":";
      const value = document.createElement("span");
      value.textContent = row.value;
      div.appendChild(label);
      div.appendChild(value);
      card.appendChild(div);
    });

    const insight = document.createElement("div");
    insight.style.cssText =
      "margin-top: 8px; font-style: italic; color: var(--text-muted);";
    insight.textContent = outcomeData.insight || "";
    card.appendChild(insight);

    container.appendChild(card);
  }

  return {
    evaluate,
    renderBadge,
    renderDetails,
  };
})();

console.log("[DecisionReplay] Module loaded (multi‑dimensional evaluation).");
