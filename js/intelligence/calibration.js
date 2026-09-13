// ===============================================================
//         User Calibration Metric
// ===============================================================
// Measures how well the user's stated confidence on past decisions
// matched outcomes. This is a DISPLAY METRIC, not a multiplier.
// It NEVER modifies evidence.confidence.
//
// Design notes:
//   - Bounded score [0, 1] using a Brier-style symmetric loss.
//   - Minimum 10 evaluated decisions before reporting anything.
//   - Recency-weighted, but each decision's weight is floored so
//     a single old call cannot dominate.
//   - Requires live prices for evaluation. If prices are missing,
//     the metric reports "unavailable" rather than guessing.
//
// Constitution:
//   §2.9  No False Precision — symmetric loss, bounded score.
//   §3.8  Versioned Scoring  — tagged calibration-v1.
//   §4.5  Outcome Learning   — preserves history, no hindsight.
// ===============================================================

window.W = window.W || {};
W.calibration = (() => {
  const VERSION = "calibration-v1";
  const MIN_DECISIONS = 10;

  function evaluateAll(decisions, currentPriceLookup) {
    if (!W.decisionReplay || !W.decisionReplay.evaluate) return [];
    const out = [];
    for (const d of decisions) {
      if (!d.price || !d.confidence) continue;
      const current = currentPriceLookup ? currentPriceLookup(d) : null;
      if (current == null) continue;
      let result;
      try {
        result = W.decisionReplay.evaluate(d, { price: current });
      } catch {
        continue;
      }
      if (!result || result.outcome === "inconclusive") continue;
      out.push({
        stated: parseFloat(d.confidence),
        outcome: result.outcome === "successful" ? 1 : 0,
        timestamp: new Date(d.timestamp).getTime(),
      });
    }
    return out;
  }

  // Brier-style symmetric score:
  //   error = (outcome - stated)^2, in [0, 1]
  //   score = 1 - mean(error)
  // Perfect calibration -> 1. Always-0.9 confidence with 50% wins
  // scores about 0.59. That is the honest read.
  function brierScore(samples) {
    if (!samples.length) return null;
    let weightedError = 0;
    let totalWeight = 0;
    const now = Date.now();
    for (const s of samples) {
      const ageDays = (now - s.timestamp) / 86400000;
      const w = Math.max(0.25, Math.pow(0.5, ageDays / 90));
      weightedError += w * Math.pow(s.outcome - s.stated, 2);
      totalWeight += w;
    }
    if (totalWeight === 0) return null;
    const score = 1 - weightedError / totalWeight;
    return Math.max(0, Math.min(1, score));
  }

  function summarize(samples) {
    let over = 0;
    let under = 0;
    for (const s of samples) {
      const stated = s.stated;
      const hit = s.outcome;
      if (stated >= 0.7 && hit === 0) over++;
      else if (stated <= 0.3 && hit === 1) under++;
    }
    return { overconfident: over, underconfident: under };
  }

  function forAsset(assetId, currentPriceLookup) {
    const symbol = (assetId && assetId.symbol ? assetId.symbol : assetId || "").toUpperCase();
    if (!symbol) return { score: null, reason: "no_asset", version: VERSION };
    if (!W.journal || !W.journal.all)
      return { score: null, reason: "no_journal", version: VERSION };

    const matching = W.journal
      .all()
      .filter(
        (d) =>
          (d.assetId && d.assetId.symbol ? d.assetId.symbol : d.asset || "").toUpperCase() === symbol,
      );
    if (matching.length < MIN_DECISIONS) {
      return {
        score: null,
        reason: "insufficient_data",
        sampleSize: matching.length,
        minimumRequired: MIN_DECISIONS,
        version: VERSION,
      };
    }

    const samples = evaluateAll(matching, currentPriceLookup);
    if (samples.length < MIN_DECISIONS) {
      return {
        score: null,
        reason: "insufficient_evaluated_data",
        evaluated: samples.length,
        minimumRequired: MIN_DECISIONS,
        version: VERSION,
      };
    }

    const score = brierScore(samples);
    const counts = summarize(samples);
    return {
      score,
      sampleSize: samples.length,
      overconfident: counts.overconfident,
      underconfident: counts.underconfident,
      reason: "ok",
      version: VERSION,
    };
  }

  function renderBadge(container, assetId, currentPriceLookup) {
    if (!container) return;
    const r = forAsset(assetId, currentPriceLookup);

    const el = document.createElement("div");
    el.className = "small muted mt-4";
    el.style.fontStyle = "italic";

    if (r.score == null) {
      let reason;
      if (r.reason === "insufficient_data") {
        reason = "Only " + r.sampleSize + "/" + r.minimumRequired + " decisions logged on this asset.";
      } else if (r.reason === "insufficient_evaluated_data") {
        reason = r.evaluated + "/" + r.minimumRequired + " decisions have evaluable outcomes.";
      } else {
        reason = "Not enough data to calibrate.";
      }
      el.textContent = "📊 Your past calls on this asset: " + reason;
    } else {
      const pct = Math.round(r.score * 100);
      const label =
        r.score >= 0.75
          ? "well-calibrated"
          : r.score >= 0.5
            ? "roughly calibrated"
            : "poorly calibrated";
      el.textContent =
        "📊 Your past calls: " +
        pct +
        "% (" +
        label +
        ", " +
        r.sampleSize +
        " decisions, " +
        r.overconfident +
        " over, " +
        r.underconfident +
        " under)";
    }

    container.appendChild(el);
  }

  return { forAsset, renderBadge, VERSION, MIN_DECISIONS };
})();

console.log("[Calibration] User calibration metric loaded (calibration-v1).");
