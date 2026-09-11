// ===============================================================
//         Decision Replay Engine – Multi‑Dimensional Evaluation
// ===============================================================
// CSP Compliant: Zero inline styles used.
//
// CONFIDENCE POLICY (WEAVER_CONSTITUTION §2.9.1):
//   - Calibration is only computed when the user actually stated a
//     confidence for the decision. If none was stated, calibration
//     is reported as "unknown" rather than fabricated.
// ===============================================================

window.W = window.W || {};
W.decisionReplay = (() => {
  function evaluate(decision, currentData = {}, benchmarkData = {}) {
    if (!decision || !decision.price) {
      return {
        outcome: "inconclusive",
        absoluteReturn: 0,
        benchmarkRelative: 0,
        risk: 0,
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

    const absoluteReturn = ((currentPrice - entryPrice) / entryPrice) * 100;
    let outcome = "inconclusive";
    if (action === "buy" && absoluteReturn > 0) outcome = "successful";
    else if (action === "sell" && absoluteReturn < 0) outcome = "successful";
    else if (absoluteReturn !== 0) outcome = "unsuccessful";

    let benchmarkRelative = 0;
    const btcEntry = parseFloat(benchmarkData.btcPriceAtEntry) || 0;
    const btcCurrent = parseFloat(currentData.btcPrice) || 0;
    if (btcEntry > 0 && btcCurrent > 0) {
      const btcReturn = ((btcCurrent - btcEntry) / btcEntry) * 100;
      benchmarkRelative = absoluteReturn - btcReturn;
    } else {
      benchmarkRelative = absoluteReturn;
    }

    const risk = Math.abs(absoluteReturn);
    const riskAdjusted = risk > 0 ? absoluteReturn / risk : 0;

    const horizonDays = parseInt(decision.horizon) || 30;
    const horizonMs = horizonDays * 86400000;
    const timeSince = Date.now() - new Date(decision.timestamp).getTime();
    const horizonStatus = timeSince > horizonMs ? "expired" : "active";

    // Calibration only makes sense when a confidence was actually stated.
    // Missing confidence → "unknown". Never fabricate 0.5.
    const parsedConf = parseFloat(decision.confidence);
    const conf = Number.isFinite(parsedConf) ? parsedConf : null;

    let confidenceCalibration = "unknown";
    if (conf !== null) {
      if (conf >= 0.8 && outcome === "unsuccessful") {
        confidenceCalibration = "overconfident";
      } else if (conf <= 0.3 && outcome === "successful") {
        confidenceCalibration = "underconfident";
      } else {
        confidenceCalibration = "well_calibrated";
      }
    }

    let thesisHealth = null;
    if (decision.thesisId && W.thesisHealth) {
      thesisHealth = { status: "unknown", healthScore: 0 };
    }

    let opportunityCost = 0;
    if (action === "sell" && btcEntry > 0 && btcCurrent > 0) {
      const btcReturn = ((btcCurrent - btcEntry) / btcEntry) * 100;
      opportunityCost = btcReturn - absoluteReturn;
    } else if (action === "buy" && btcEntry > 0 && btcCurrent > 0) {
      const btcReturn = ((btcCurrent - btcEntry) / btcEntry) * 100;
      opportunityCost = absoluteReturn - btcReturn;
    }

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

  function renderBadge(outcomeData) {
    if (!outcomeData || outcomeData.outcome === "inconclusive") {
      return `<span class="replay-badge text-muted small-text ml-8 opacity-70">⏳ Inconclusive</span>`;
    }

    let colorClass = "text-muted";
    let icon = "️";
    let statusText = outcomeData.outcome.toUpperCase();

    if (outcomeData.outcome === "successful") {
      colorClass = "text-up";
      icon = "✅";
    } else if (outcomeData.outcome === "unsuccessful") {
      colorClass = "text-down";
      icon = "❌";
    }

    // Calibration segment only appears when calibration is known.
    let calibrationText = "";
    if (outcomeData.confidenceCalibration === "well_calibrated")
      calibrationText = " · 🎯 Calibrated";
    else if (outcomeData.confidenceCalibration === "overconfident")
      calibrationText = " · ⚡ Overconfident";
    else if (outcomeData.confidenceCalibration === "underconfident")
      calibrationText = " · 🔽 Underconfident";
    // "unknown" → no segment appended

    return `<span class="replay-badge small-text font-bold ${colorClass} ml-8">${icon} ${statusText} (${outcomeData.absoluteReturn.toFixed(1)}%)${calibrationText}</span>`;
  }

  function renderDetails(container, outcomeData) {
    if (!container || !outcomeData) return;
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "mt-8 p-16 bg-surface rounded";

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

    rows.forEach((row, index) => {
      const div = document.createElement("div");
      div.className = `flex-between py-4 ${index < rows.length - 1 ? "border-b" : ""}`;

      const label = document.createElement("span");
      label.className = "text-muted";
      label.textContent = row.label + ":";

      const value = document.createElement("span");
      value.textContent = row.value;

      div.appendChild(label);
      div.appendChild(value);
      card.appendChild(div);
    });

    const insight = document.createElement("div");
    insight.className = "mt-8 italic text-muted";
    insight.textContent = outcomeData.insight || "";
    card.appendChild(insight);

    container.appendChild(card);
  }

  return { evaluate, renderBadge, renderDetails };
})();

console.log(
  "[DecisionReplay] Module loaded (multi‑dimensional evaluation, CSP compliant).",
);
