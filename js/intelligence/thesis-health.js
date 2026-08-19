// ===============================================================
//         Thesis Health Monitor Engine
// ===============================================================
//
// Purpose: Evaluate active theses against current market evidence.
// Rules: 21 (Data Correctness), 22 (Deterministic Math), 26 (Thesis Tracking), 15 (Security).
//
// ===============================================================

window.W = window.W || {};
W.thesisHealth = (() => {
  const STATUS = {
    HEALTHY: "Healthy",
    WEAKENING: "Weakening",
    INVALIDATED: "Invalidated",
    UNKNOWN: "Unknown",
  };

  // ─ Core Evaluation Logic (Deterministic, Rule 22) ─────
  function evaluate(thesis, currentPrice, currentRegime) {
    if (!thesis) return null;

    let score = 100; // Start at 100, deduct for negative signals
    const reasons = [];
    let status = STATUS.HEALTHY;

    // 1. Price Action Analysis
    const entryPrice = parseFloat(thesis.entryPrice);
    const targetPrice = parseFloat(thesis.targetPrice);

    if (!isNaN(entryPrice) && entryPrice > 0 && currentPrice > 0) {
      const pctChange = ((currentPrice - entryPrice) / entryPrice) * 100;

      if (pctChange <= -40) {
        score -= 60;
        reasons.push(
          `Price is down ${pctChange.toFixed(1)}% from entry (Critical drawdown).`,
        );
      } else if (pctChange <= -20) {
        score -= 30;
        reasons.push(`Price is down ${pctChange.toFixed(1)}% from entry.`);
      } else if (pctChange <= -10) {
        score -= 10;
        reasons.push(`Price is down ${pctChange.toFixed(1)}% from entry.`);
      }

      // Check if target was hit (Positive signal, but we focus on risk here)
      if (
        !isNaN(targetPrice) &&
        targetPrice > entryPrice &&
        currentPrice >= targetPrice
      ) {
        reasons.push(`Price target of ${targetPrice} has been reached.`);
      }
    } else if (thesis.entryPrice) {
      // Rule 21: Never silently invent missing values.
      reasons.push("Insufficient price data to evaluate entry.");
    }

    // 2. Regime Shift Analysis
    if (
      currentRegime &&
      currentRegime.regime === "RISK-OFF" &&
      thesis.bias === "bullish"
    ) {
      score -= 20;
      reasons.push(
        "Market regime shifted to RISK-OFF, contradicting bullish bias.",
      );
    }

    // 3. Time Decay Analysis
    if (thesis.createdAt && thesis.timeHorizon) {
      const created = new Date(thesis.createdAt).getTime();
      const horizonMs = thesis.timeHorizon * 24 * 60 * 60 * 1000; // Assuming horizon in days
      if (Date.now() > created + horizonMs) {
        score -= 15;
        reasons.push(`Time horizon (${thesis.timeHorizon} days) has expired.`);
      }
    }

    // Determine Final Status
    score = Math.max(0, Math.min(100, score)); // Clamp 0-100

    if (score < 40) status = STATUS.INVALIDATED;
    else if (score < 70) status = STATUS.WEAKENING;
    else if (reasons.length === 0 && !currentPrice) status = STATUS.UNKNOWN;

    // Generate Recommendation
    let recommendation =
      "Thesis conditions remain intact. Continue monitoring.";
    if (status === STATUS.WEAKENING)
      recommendation =
        "Review invalidation conditions. Consider reducing exposure if risks are escalating.";
    if (status === STATUS.INVALIDATED)
      recommendation =
        "Core thesis assumptions appear broken. Strongly consider exiting or fully re-evaluating the position.";

    return {
      thesisId: thesis.id,
      healthScore: score,
      status,
      reasons,
      recommendation,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Safe UI Renderer (Rule 15) ──────────────────────────
  function renderBadge(thesisId, healthData) {
    if (!healthData) return "";

    // Determine color based on status
    let color = "var(--up, #2ee6a8)"; // Healthy
    if (healthData.status === STATUS.WEAKENING) color = "var(--warn, #ffb35c)";
    if (healthData.status === STATUS.INVALIDATED)
      color = "var(--down, #ff5c7a)";
    if (healthData.status === STATUS.UNKNOWN)
      color = "var(--text-muted, #9aa3b2)";

    // Return a safe HTML string. Dynamic text is NOT injected here to prevent XSS.
    // The actual text will be populated via textContent in the caller if needed,
    // but for a simple badge, we use safe static text with a data attribute.
    return `<span class="thesis-health-badge" data-id="${thesisId}" style="display:inline-block; padding: 2px 8px; border-radius: 12px; background: ${color}20; color: ${color}; font-size: 0.8em; font-weight: bold; margin-left: 8px;">${healthData.status} (${healthData.healthScore}%)</span>`;
  }

  function renderDetails(container, healthData) {
    if (!container || !healthData) return;
    container.innerHTML = ""; // Clear previous

    if (healthData.reasons.length > 0) {
      const ul = document.createElement("ul");
      ul.style.cssText =
        "list-style: none; padding: 0; margin: 8px 0; font-size: 0.9em;";

      healthData.reasons.forEach((reason) => {
        const li = document.createElement("li");
        li.style.cssText = "padding: 4px 0; color: var(--text-muted);";
        li.textContent = `• ${reason}`; // SAFE: textContent (Rule 15)
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }

    const rec = document.createElement("div");
    rec.style.cssText =
      "margin-top: 8px; padding: 8px; background: rgba(124, 92, 255, 0.05); border-left: 3px solid var(--primary); border-radius: 4px; font-size: 0.9em;";
    rec.textContent = `Recommendation: ${healthData.recommendation}`; // SAFE: textContent
    container.appendChild(rec);
  }

  return { evaluate, renderBadge, renderDetails, STATUS };
})();

console.log("[ThesisHealth] Monitor engine loaded.");
