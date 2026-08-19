// ===============================================================
//         Market Regime Detection Engine
// ===============================================================
//
// Purpose: Evidence-based market regime detection (Section 27).
// Outputs: RISK-ON, TRANSITION, RISK-OFF, UNKNOWN.
// Always provides confidence and supporting signals.
//
// ===============================================================

window.W = window.W || {};
W.intelligence = W.intelligence || {};

W.regime = (() => {
  const STATES = {
    RISK_ON: "RISK-ON",
    TRANSITION: "TRANSITION",
    RISK_OFF: "RISK-OFF",
    UNKNOWN: "UNKNOWN",
  };

  /**
   * Detect market regime based on multiple evidence signals.
   * @param {Object} data - { fearGreed, btcDominance, capChange }
   * @returns {Object} - { regime, confidence, signals, timestamp }
   */
  function detect({ fearGreed, btcDominance, capChange }) {
    let score = 0; // Range: -3 to +3
    const signals = [];

    // 1. Sentiment (Fear & Greed Index)
    if (fearGreed !== null && fearGreed !== undefined) {
      if (fearGreed >= 75) {
        score += 2;
        signals.push({
          type: "sentiment",
          value: `Extreme Greed (${fearGreed})`,
          impact: "risk-on",
        });
      } else if (fearGreed >= 60) {
        score += 1;
        signals.push({
          type: "sentiment",
          value: `Greed (${fearGreed})`,
          impact: "risk-on",
        });
      } else if (fearGreed <= 25) {
        score -= 2;
        signals.push({
          type: "sentiment",
          value: `Extreme Fear (${fearGreed})`,
          impact: "risk-off",
        });
      } else if (fearGreed <= 40) {
        score -= 1;
        signals.push({
          type: "sentiment",
          value: `Fear (${fearGreed})`,
          impact: "risk-off",
        });
      } else {
        signals.push({
          type: "sentiment",
          value: `Neutral (${fearGreed})`,
          impact: "neutral",
        });
      }
    }

    // 2. Momentum (24h Market Cap Change)
    if (capChange !== null && capChange !== undefined) {
      if (capChange > 5) {
        score += 1;
        signals.push({
          type: "momentum",
          value: `Strong Up (${capChange.toFixed(2)}%)`,
          impact: "risk-on",
        });
      } else if (capChange > 1) {
        score += 0.5;
        signals.push({
          type: "momentum",
          value: `Moderate Up (${capChange.toFixed(2)}%)`,
          impact: "risk-on",
        });
      } else if (capChange < -5) {
        score -= 1;
        signals.push({
          type: "momentum",
          value: `Strong Down (${capChange.toFixed(2)}%)`,
          impact: "risk-off",
        });
      } else if (capChange < -1) {
        score -= 0.5;
        signals.push({
          type: "momentum",
          value: `Moderate Down (${capChange.toFixed(2)}%)`,
          impact: "risk-off",
        });
      } else {
        signals.push({
          type: "momentum",
          value: `Flat (${capChange.toFixed(2)}%)`,
          impact: "neutral",
        });
      }
    }

    // Determine Regime & Confidence
    let regime = STATES.UNKNOWN;
    let confidence = 0;

    if (score >= 2) {
      regime = STATES.RISK_ON;
      confidence = Math.min(0.95, 0.5 + (score - 2) * 0.15);
    } else if (score <= -2) {
      regime = STATES.RISK_OFF;
      confidence = Math.min(0.95, 0.5 + (Math.abs(score) - 2) * 0.15);
    } else if (score > 0) {
      regime = STATES.TRANSITION;
      confidence = 0.45;
    } else if (score < 0) {
      regime = STATES.TRANSITION;
      confidence = 0.45;
    } else {
      regime = STATES.UNKNOWN;
      confidence = 0.1;
    }

    // Fallback if no data provided
    if (signals.length === 0) {
      regime = STATES.UNKNOWN;
      confidence = 0;
    }

    return {
      regime,
      confidence: parseFloat(confidence.toFixed(2)),
      signals,
      timestamp: new Date().toISOString(),
    };
  }

  return { detect, STATES };
})();

console.log("[Regime] Market regime engine loaded.");
