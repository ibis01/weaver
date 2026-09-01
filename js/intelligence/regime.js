// ===============================================================
//         Market Regime Detection Engine – Confidence Model
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

  function detect({ fearGreed, btcDominance, capChange }) {
    let score = 0;
    const signals = [];
    let signalCount = 0;

    // 1. Sentiment (Fear & Greed Index)
    if (fearGreed !== null && fearGreed !== undefined) {
      signalCount++;
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
      signalCount++;
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

    // Confidence is based on the number of confirming signals and their strength
    // This is a heuristic but defensible: more signals agreeing = higher confidence
    const totalSignals = signalCount || 1;
    const maxScore = 3; // maximum possible absolute score
    const normalizedScore = Math.abs(score) / maxScore;

    // Confidence is the product of:
    // - signal agreement (how many signals agree on direction)
    // - signal strength (how strong the signal is)
    const agreementRatio =
      totalSignals > 0
        ? signals.filter((s) => {
            if (score > 0) return s.impact === "risk-on";
            if (score < 0) return s.impact === "risk-off";
            return s.impact === "neutral";
          }).length / totalSignals
        : 0;

    // Base confidence: 0.5 + 0.4 * normalizedScore * agreementRatio
    confidence = 0.5 + 0.4 * normalizedScore * agreementRatio;
    // Clamp and ensure reasonable range
    confidence = Math.max(0.1, Math.min(0.95, confidence));

    // Final regime decision
    if (score >= 2) {
      regime = STATES.RISK_ON;
    } else if (score <= -2) {
      regime = STATES.RISK_OFF;
    } else if (score > 0 || score < 0) {
      regime = STATES.TRANSITION;
    } else {
      regime = STATES.UNKNOWN;
      confidence = 0.1;
    }

    // If no data provided, fallback
    if (signalCount === 0) {
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

console.log("[Regime] Market regime engine loaded (confidence model).");
