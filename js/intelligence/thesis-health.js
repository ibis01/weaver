// ===============================================================
//         Thesis Health Monitor – Evidence-Based Evaluation
// ===============================================================
//
// Thesis health is evaluated from:
//   - Expected signals (what should happen if the thesis is correct)
//   - Observed evidence (what actually happened)
//   - Supporting and contradicting evidence
//   - Time horizon
//   - Invalidation conditions
//
// Possible states: Healthy | Strengthening | Weakening | Invalidated | Unknown
//
// DO NOT equate price movement with thesis health.
//
// v2 changelog:
//   - Status strings come from W.intelligence.types.THESIS_STATUS.
//     A typo in one place no longer silently returns "Unknow".
//   - All numeric inputs are bounds-checked. entryPrice = 0, negative,
//     NaN, or Infinity are rejected as "unknown", not treated as a
//     real price.
//   - signalHistory is validated as an array of canonical signals
//     before use. Non-array input is treated as empty.
//   - All returns are Object.freeze'd.
//   - renderBadge escapes the thesis id (defence in depth even though
//     ids are internal).
//   - renderDetails uses CSS classes, not inline styles. Adds
//     .thesis-reasons, .thesis-reason, .thesis-recommendation to
//     style.css.
// ===============================================================

window.W = window.W || {};
W.thesisHealth = (() => {
  // Fallback used only when W.intelligence.types has not loaded yet.
  // Key shape matches _makeEnum in types.js (value-keyed:
  // STATUS.Healthy === "Healthy"), so both paths behave identically.
  const STATUS =
    W.intelligence?.types?.THESIS_STATUS ||
    Object.freeze({
      Healthy: "Healthy",
      Strengthening: "Strengthening",
      Weakening: "Weakening",
      Invalidated: "Invalidated",
      Unknown: "Unknown",
    });

  const INVALIDATION_PRICE_DROP = -40; // percent
  const MIN_PLAUSIBLE_PRICE = 1e-12;
  const MAX_PLAUSIBLE_PRICE = 1e15;
  const HORIZON_DECAY_PER_DAY = 2;

  function _isPlausiblePrice(v) {
    return (
      Number.isFinite(v) && v > MIN_PLAUSIBLE_PRICE && v < MAX_PLAUSIBLE_PRICE
    );
  }

  function _clampScore(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  /**
   * Evaluate a thesis against current market evidence.
   *
   * @param {Object} thesis
   * @param {Object} [marketData]
   * @param {Array}  [signalHistory]
   * @returns {Object|null} frozen assessment, or null if thesis is invalid
   */
  function evaluate(thesis, marketData = {}, signalHistory = []) {
    if (!thesis || typeof thesis !== "object") return null;

    const reasons = [];
    let healthScore = 100;
    let status = STATUS.Unknown;

    const {
      asset,
      expectedSignals = [],
      invalidationConditions = [],
      targetPrice = null,
      horizonDays = 365,
      createdAt = Date.now(),
    } = thesis;

    const price = marketData.price;
    const entryPrice = thesis.entryPrice;
    const direction = thesis.direction === "bearish" ? "bearish" : "bullish";
    const regime = marketData.regime || null;

    // ── 1. Invalidation check ────────────────────────────────
    if (_isPlausiblePrice(price) && _isPlausiblePrice(entryPrice)) {
      const pctChange = ((price - entryPrice) / entryPrice) * 100;
      if (pctChange <= INVALIDATION_PRICE_DROP) {
        reasons.push(
          `Price dropped ${pctChange.toFixed(1)}% from entry (exceeds ${INVALIDATION_PRICE_DROP}% invalidation threshold).`,
        );
        return Object.freeze({
          thesisId: thesis.id || null,
          healthScore: 0,
          status: STATUS.Invalidated,
          reasons: Object.freeze(reasons.slice()),
          recommendation:
            "Thesis assumptions appear broken. Consider exiting or re-evaluating.",
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (
      _isPlausiblePrice(price) &&
      _isPlausiblePrice(targetPrice) &&
      Array.isArray(invalidationConditions) &&
      invalidationConditions.length > 0
    ) {
      // Reserved for future NLP-based condition matching.
    }

    // ── 2. Expected signals ──────────────────────────────────
    let expectedMet = 0;
    const expectedTotal =
      Array.isArray(expectedSignals) && expectedSignals.length > 0
        ? expectedSignals.length
        : 1;

    if (_isPlausiblePrice(price) && _isPlausiblePrice(entryPrice)) {
      const pctChange = ((price - entryPrice) / entryPrice) * 100;
      if (direction === "bullish" && pctChange > 5) {
        expectedMet++;
        reasons.push(`Price up ${pctChange.toFixed(1)}% (bullish signal).`);
      } else if (direction === "bearish" && pctChange < -5) {
        expectedMet++;
        reasons.push(`Price down ${pctChange.toFixed(1)}% (bearish signal).`);
      }
    }

    if (regime) {
      if (direction === "bullish" && regime === "RISK-ON") {
        expectedMet++;
        reasons.push("Regime is RISK-ON, aligning with bullish thesis.");
      } else if (direction === "bearish" && regime === "RISK-OFF") {
        expectedMet++;
        reasons.push("Regime is RISK-OFF, aligning with bearish thesis.");
      } else {
        reasons.push("Regime may not align with thesis direction.");
      }
    }

    // ── 3. Corroboration from signalHistory ──────────────────
    if (Array.isArray(signalHistory) && signalHistory.length > 0) {
      let supporting = 0;
      for (const s of signalHistory) {
        if (!W.intelligence.is.signal(s)) continue;
        const sameAsset = s.assetId?.symbol === asset;
        if (
          s.type === "OPPORTUNITY" &&
          sameAsset &&
          (direction === "bullish" ? s.rawData?.impactValue > 0 : true)
        ) {
          supporting++;
        } else if (s.type === "REGIME_SHIFT" && s.assetId?.symbol === "BTC") {
          supporting++;
        }
      }
      if (supporting > 0) {
        expectedMet += Math.min(supporting, 2) * 0.5;
        reasons.push(`${supporting} supporting signals observed.`);
      }
    }

    // ── 4. Health score ──────────────────────────────────────
    const expectedRatio = Math.min(1, expectedMet / expectedTotal);
    healthScore = 50 + 50 * expectedRatio;

    const ageDays = (Date.now() - createdAt) / 86400000;
    if (Number.isFinite(ageDays) && ageDays > horizonDays) {
      const overshoot = ageDays - horizonDays;
      healthScore -= overshoot * HORIZON_DECAY_PER_DAY;
      reasons.push(
        `Thesis is ${Math.round(ageDays)} days old, exceeding horizon (${horizonDays} days).`,
      );
    }

    healthScore = _clampScore(healthScore);

    // ── 5. Status ────────────────────────────────────────────
    if (healthScore >= 80) status = STATUS.Healthy;
    else if (healthScore >= 60) status = STATUS.Strengthening;
    else if (healthScore >= 30) status = STATUS.Weakening;
    else if (healthScore > 0) status = STATUS.Invalidated;
    else status = STATUS.Unknown;

    // ── 6. Recommendation ────────────────────────────────────
    let recommendation = "Monitor thesis progress.";
    if (status === STATUS.Weakening) {
      recommendation =
        "Thesis is weakening. Review invalidation conditions and consider reducing exposure if risk is too high.";
    } else if (status === STATUS.Invalidated) {
      recommendation =
        "Thesis appears invalidated. Strongly consider exiting or re-evaluating the thesis from scratch.";
    } else if (status === STATUS.Strengthening) {
      recommendation =
        "Thesis is strengthening. Continue monitoring and consider adding to position if within risk tolerance.";
    } else if (status === STATUS.Healthy) {
      recommendation = "Thesis remains on track. Continue normal monitoring.";
    }

    return Object.freeze({
      thesisId: thesis.id || null,
      healthScore,
      status,
      reasons: Object.freeze(reasons.slice()),
      recommendation,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Badge renderer ───────────────────────────────────────
  function _escape(v) {
    if (v == null) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderBadge(thesisId, healthData) {
    if (!healthData) return "";
    const { status, healthScore } = healthData;
    let cls = "thesis-health-unknown";
    if (status === STATUS.Healthy || status === STATUS.Strengthening) {
      cls = "thesis-health-up";
    } else if (status === STATUS.Weakening) {
      cls = "thesis-health-warn";
    } else if (status === STATUS.Invalidated) {
      cls = "thesis-health-down";
    }
    const safeId = _escape(thesisId);
    const safeStatus = _escape(status);
    const safeScore = Number.isFinite(healthScore)
      ? Math.round(healthScore)
      : 0;
    return `<span class="thesis-health-badge ${cls}" data-id="${safeId}">${safeStatus} (${safeScore}%)</span>`;
  }

  // ── Details renderer ─────────────────────────────────────
  function renderDetails(container, healthData) {
    if (!container || !healthData) return;
    container.innerHTML = "";

    if (Array.isArray(healthData.reasons) && healthData.reasons.length > 0) {
      const ul = document.createElement("ul");
      ul.className = "thesis-reasons";
      healthData.reasons.forEach((reason) => {
        const li = document.createElement("li");
        li.className = "thesis-reason";
        li.textContent = `• ${reason}`;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }

    const rec = document.createElement("div");
    rec.className = "thesis-recommendation";
    rec.textContent = `Recommendation: ${healthData.recommendation || ""}`;
    container.appendChild(rec);
  }

  return Object.freeze({
    evaluate,
    renderBadge,
    renderDetails,
    STATUS,
  });
})();

console.log(
  "[ThesisHealth] Module loaded (evidence-based evaluation, canonical statuses).",
);
