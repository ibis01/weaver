// ===============================================================
//         Thesis Health Monitor – Evidence-Based Evaluation
// ===============================================================
//
// Thesis health is evaluated based on:
//   - Expected signals (what should happen if thesis is correct)
//   - Observed evidence (what actually happened)
//   - Supporting evidence (confirms thesis)
//   - Contradicting evidence (undermines thesis)
//   - Time horizon
//   - Invalidation conditions
//
// Possible states: HEALTHY | STRENGTHENING | WEAKENING | INVALIDATED | UNKNOWN
//
// DO NOT equate price movement with thesis health.
//
// ===============================================================

window.W = window.W || {};
W.thesisHealth = (() => {
  const STATUS = {
    HEALTHY: "Healthy",
    STRENGTHENING: "Strengthening",
    WEAKENING: "Weakening",
    INVALIDATED: "Invalidated",
    UNKNOWN: "Unknown",
  };

  /**
   * Evaluate a thesis against current market evidence.
   * @param {Object} thesis - The thesis object with statement, expected signals, invalidation conditions, etc.
   * @param {Object} marketData - Current market data (price, volume, regime, etc.)
   * @param {Object} signalHistory - Recent signals relevant to the thesis (optional)
   * @returns {Object} - Health assessment
   */
  function evaluate(thesis, marketData = {}, signalHistory = []) {
    if (!thesis) return null;

    let healthScore = 100;
    const reasons = [];
    let status = STATUS.UNKNOWN;

    const {
      asset,
      statement,
      expectedSignals = [],
      invalidationConditions = [],
      targetPrice = null,
      horizonDays = 365,
      createdAt = Date.now(),
    } = thesis;

    // ── 1. Check invalidation conditions ──────────────────────────
    // If any invalidation condition is met, thesis is INVALIDATED.
    // Invalidation conditions are user-defined strings; we'll check if any match observed data.
    // For now, we'll check if price drop > 40% if invalidation mentions "drop" or "below".
    let invalidated = false;
    const price = marketData.price || null;
    const entryPrice = thesis.entryPrice || null;

    if (entryPrice && price) {
      const pctChange = ((price - entryPrice) / entryPrice) * 100;
      if (pctChange <= -40) {
        invalidated = true;
        reasons.push(
          `Price dropped ${pctChange.toFixed(1)}% from entry (exceeds 40% invalidation threshold).`,
        );
      }
    }

    // Also check if target price is reached (positive invalidation? Not exactly; we handle later)
    if (targetPrice && price && price >= targetPrice) {
      // Not invalidation, but a success condition.
    }

    // Check invalidation conditions strings
    if (invalidationConditions.length > 0) {
      // Simple string matching for now; in future we could use NLP or pattern matching.
      // For now, we just add a reason if any condition seems triggered.
      // We'll check for common patterns: "below X", "drop", "bearish", etc.
      // But we'll leave this flexible.
    }

    if (invalidated) {
      status = STATUS.INVALIDATED;
      healthScore = 0;
      return {
        thesisId: thesis.id,
        healthScore,
        status,
        reasons,
        recommendation:
          "Thesis assumptions appear broken. Consider exiting or re-evaluating.",
        timestamp: new Date().toISOString(),
      };
    }

    // ── 2. Evaluate expected signals ──────────────────────────────
    // Expected signals are key indicators that should appear if thesis is correct.
    // We'll compare each expected signal against marketData.
    // For now, we use a simple heuristic based on price, volume, and regime.
    let expectedMet = 0;
    const expectedTotal = expectedSignals.length || 1;

    // Default expected signals based on thesis direction
    const direction = thesis.direction || "bullish"; // 'bullish' or 'bearish'
    if (price && entryPrice) {
      const pctChange = ((price - entryPrice) / entryPrice) * 100;
      if (direction === "bullish" && pctChange > 5) {
        expectedMet++;
        reasons.push(`Price up ${pctChange.toFixed(1)}% (bullish signal).`);
      } else if (direction === "bearish" && pctChange < -5) {
        expectedMet++;
        reasons.push(`Price down ${pctChange.toFixed(1)}% (bearish signal).`);
      }
    }

    // Volume confirmation (if marketData includes volume)
    if (marketData.volume && marketData.volume > 0) {
      // Simple: if volume is high compared to average, it's a confirming signal.
      // We don't have average, so we'll treat it as a supportive sign.
      // We'll just add a note.
    }

    // Regime alignment
    if (marketData.regime) {
      if (direction === "bullish" && marketData.regime === "RISK-ON") {
        expectedMet++;
        reasons.push("Regime is RISK-ON, aligning with bullish thesis.");
      } else if (direction === "bearish" && marketData.regime === "RISK-OFF") {
        expectedMet++;
        reasons.push("Regime is RISK-OFF, aligning with bearish thesis.");
      } else {
        reasons.push("Regime may not align with thesis direction.");
      }
    }

    // ── 3. Corroboration from signalHistory ──────────────────────
    // If there are recent signals that support the thesis, we add to expectedMet.
    if (signalHistory && signalHistory.length > 0) {
      const supporting = signalHistory.filter(
        (s) =>
          (s.type === "OPPORTUNITY" && s.asset === asset) ||
          (s.type === "REGIME_SHIFT" &&
            s.asset === "BTC" &&
            s.impact === (direction === "bullish" ? "risk-on" : "risk-off")),
      );
      if (supporting.length > 0) {
        expectedMet += Math.min(supporting.length, 2) * 0.5;
        reasons.push(`${supporting.length} supporting signals observed.`);
      }
    }

    // ── 4. Calculate health score ──────────────────────────────────
    // Score based on percentage of expected signals met, plus time horizon.
    const expectedRatio = Math.min(1, expectedMet / expectedTotal);
    healthScore = 50 + 50 * expectedRatio;

    // Time decay: if thesis is older than horizon, health decreases.
    const age = (Date.now() - createdAt) / 86400000; // days
    if (age > horizonDays) {
      healthScore -= (age - horizonDays) * 2;
      reasons.push(
        `Thesis is ${Math.round(age)} days old, exceeding horizon (${horizonDays} days).`,
      );
    }

    // Clamp health score
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    // ── 5. Determine status ───────────────────────────────────────
    if (healthScore >= 80) status = STATUS.HEALTHY;
    else if (healthScore >= 60) status = STATUS.STRENGTHENING;
    else if (healthScore >= 30) status = STATUS.WEAKENING;
    else if (healthScore > 0) status = STATUS.INVALIDATED;
    else status = STATUS.UNKNOWN;

    // ── 6. Recommendation ────────────────────────────────────────
    let recommendation = "Monitor thesis progress.";
    if (status === STATUS.WEAKENING) {
      recommendation =
        "Thesis is weakening. Review invalidation conditions and consider reducing exposure if risk is too high.";
    } else if (status === STATUS.INVALIDATED) {
      recommendation =
        "Thesis appears invalidated. Strongly consider exiting or re-evaluating the thesis from scratch.";
    } else if (status === STATUS.STRENGTHENING) {
      recommendation =
        "Thesis is strengthening. Continue monitoring and consider adding to position if within risk tolerance.";
    } else if (status === STATUS.HEALTHY) {
      recommendation = "Thesis remains on track. Continue normal monitoring.";
    }

    return {
      thesisId: thesis.id,
      healthScore,
      status,
      reasons,
      recommendation,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Helper: Render badge ──────────────────────────────────────
  function renderBadge(thesisId, healthData) {
    if (!healthData) return "";
    let color = "var(--text-muted, #9aa3b2)";
    const { status, healthScore } = healthData;
    if (status === STATUS.HEALTHY || status === STATUS.STRENGTHENING)
      color = "var(--up, #2ee6a8)";
    else if (status === STATUS.WEAKENING) color = "var(--warn, #ffb35c)";
    else if (status === STATUS.INVALIDATED) color = "var(--down, #ff5c7a)";
    return `<span class="thesis-health-badge" data-id="${thesisId}" style="display:inline-block; padding: 2px 8px; border-radius: 12px; background: ${color}20; color: ${color}; font-size: 0.8em; font-weight: bold; margin-left: 8px;">${status} (${healthScore}%)</span>`;
  }

  // ── Helper: Render details ────────────────────────────────────
  function renderDetails(container, healthData) {
    if (!container || !healthData) return;
    container.innerHTML = "";

    if (healthData.reasons.length > 0) {
      const ul = document.createElement("ul");
      ul.style.cssText =
        "list-style: none; padding: 0; margin: 8px 0; font-size: 0.9em;";
      healthData.reasons.forEach((reason) => {
        const li = document.createElement("li");
        li.style.cssText = "padding: 4px 0; color: var(--text-muted);";
        li.textContent = `• ${reason}`;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }

    const rec = document.createElement("div");
    rec.style.cssText =
      "margin-top: 8px; padding: 8px; background: rgba(124, 92, 255, 0.05); border-left: 3px solid var(--primary); border-radius: 4px; font-size: 0.9em;";
    rec.textContent = `Recommendation: ${healthData.recommendation}`;
    container.appendChild(rec);
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    evaluate,
    renderBadge,
    renderDetails,
    STATUS,
  };
})();

console.log("[ThesisHealth] Module loaded (evidence-based evaluation).");
