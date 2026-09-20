// ===============================================================
//         Unified Decision Engine
// ===============================================================
//
// Consumes Evidence objects from the Evidence Builder.
// No longer reconstructs evidence.
// Uses user-centric impact, not market-cap buckets.
// No REBALANCE action.
//
// CONFIDENCE POLICY:
//   - Confidence is derived, never fabricated.
//   - When confidence is unknown, it stays `null` end-to-end.
//   - Nulls are never coerced to 0.5 for display or scoring.
//   - Signals with no evidence are skipped, not defaulted.
//
// ELIGIBILITY POLICY:
//   A decision priority carries an `eligibility` field:
//     "ELIGIBLE"               — every factor was known; score is a number
//     "INSUFFICIENT_EVIDENCE"  — at least one factor was unknown;
//                                 score is null, not zero.
//
//   The numeric score is null whenever any of relevance, impact,
//   urgency, or confidence is null. "Unknown" is not "zero". The
//   prior behavior of coercing null to 0 caused items with high
//   relevance/impact/urgency but unknown confidence to disappear
//   entirely from the actionable list. They now surface as
//   INSUFFICIENT_EVIDENCE and the renderer displays them honestly.
//
// USER CALIBRATION:
//   - Exposed as assessment.userCalibration.
//   - DISPLAY METRIC ONLY. Never modifies evidence.confidence.
//   - See js/intelligence/calibration.js for the design rationale.
//
// SCORING VERSION:
//   Every decision carries `scoreVersion` / `methodologyVersion`
//   so historical results remain auditable against the scoring
//   model that produced them. Bump on threshold changes.
// ===============================================================

window.W = window.W || {};
W.decisionEngine = (() => {
  const SCORE_VERSION = "decision-engine-v1";

  // Signal types that are risk signals by definition. Their priority
  // is REVIEW_RISK regardless of numeric thresholds.
  const RISK_SIGNAL_TYPES = new Set(["THESIS_DETERIORATION", "SECURITY_RISK"]);

  const ELIGIBLE = "ELIGIBLE";
  const INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE";

  // ── Helper: Compute Personal Context (enriched) ─────────────
  function computePersonalContext(
    assetId,
    portfolio,
    watchlist,
    theses,
    journal,
    behavior,
    settings = {},
  ) {
    const symbol = assetId.symbol.toUpperCase();
    let portfolioWeight = 0;
    let watchlistStatus = "NOT_WATCHING";
    let thesisStatus = "NONE";
    let recentDecisions = 0;
    let behavioralRisk = "NONE";
    let riskLimit = settings.riskLimit || 0.5;
    let timeHorizon = settings.timeHorizon || "medium";
    let thesisHealth = 0;
    let decisionConfidence = null;
    let chainExposure = 0;
    let sectorExposure = 0;

    const holdings = portfolio.filter(
      (h) => (h.symbol || "").toUpperCase() === symbol,
    );
    const totalValue = portfolio.reduce((sum, h) => sum + (h.value || 0), 0);
    if (totalValue > 0) {
      portfolioWeight =
        holdings.reduce((sum, h) => sum + (h.value || 0), 0) / totalValue;
    }

    if (watchlist.some((w) => (w || "").toUpperCase() === symbol)) {
      watchlistStatus = "WATCHING";
    }

    const thesis = theses.find(
      (t) => (t.assetId?.symbol || t.symbol || "").toUpperCase() === symbol,
    );
    if (thesis) {
      thesisStatus = thesis.status === "active" ? "ACTIVE" : "INVALIDATED";
      if (W.thesisHealth && thesis.status === "active") {
        const price = holdings.length > 0 ? holdings[0].price : null;
        const health = W.thesisHealth.evaluate(thesis, { price }, []);
        thesisHealth = health ? health.healthScore : 0;
      }
    }

    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const recent = journal.filter((d) => {
      const dSymbol = d.assetId?.symbol || d.asset || "";
      return dSymbol.toUpperCase() === symbol && d.timestamp > weekAgo;
    });
    recentDecisions = recent.length;

    const statedConfidences = recent
      .map((d) => d.confidence)
      .filter((c) => c !== null && c !== undefined && !isNaN(c))
      .map((c) => parseFloat(c));

    if (statedConfidences.length > 0) {
      decisionConfidence =
        statedConfidences.reduce((sum, c) => sum + c, 0) /
        statedConfidences.length;
    } else {
      decisionConfidence = null;
    }

    if (behavior && behavior.pattern !== "none") {
      behavioralRisk = behavior.pattern.toUpperCase();
    }

    chainExposure = 0;
    sectorExposure = 0;

    return {
      assetId,
      portfolioWeight,
      watchlistStatus,
      thesisStatus,
      recentDecisions,
      behavioralRisk,
      riskLimit,
      timeHorizon,
      thesisHealth,
      decisionConfidence,
      chainExposure,
      sectorExposure,
    };
  }

  // ── Helper: Compute Assessment ──────────────────────────────
  function computeAssessment(signal, personalContext, evidence) {
    // 1. Relevance — always a number. Built entirely from numeric
    //    inputs that have well-defined zero defaults.
    let relevance = 0;
    if (personalContext.portfolioWeight > 0)
      relevance += personalContext.portfolioWeight * 0.4;
    if (personalContext.watchlistStatus === "WATCHING") relevance += 0.2;
    if (personalContext.thesisStatus === "ACTIVE") relevance += 0.2;
    relevance += Math.min(1, personalContext.recentDecisions / 5) * 0.1;
    if (
      personalContext.behavioralRisk === "PANIC" ||
      personalContext.behavioralRisk === "FOMO"
    ) {
      relevance += 0.1;
    }
    relevance = Math.min(1, relevance);

    // 2. Confidence — preserve null. The `?? 0` pattern that used to
    //    live here collapsed "unknown" into "zero" and made the item
    //    silently unrankable.
    const confidence =
      evidence.confidence !== null && evidence.confidence !== undefined
        ? evidence.confidence
        : null;

    // 3. Impact — null when confidence is unknown, never 0.
    //    "We don't know how confident the evidence is" is not the
    //    same as "the impact is zero". Coercing to zero here was the
    //    first of the two places the reviewer identified where an
    //    unknown-confidence signal was silently penalized.
    const eventSeverity = signal.rawData?.impactValue || 0.5;
    let impact = null;
    if (confidence !== null) {
      impact =
        confidence *
        eventSeverity *
        (personalContext.portfolioWeight * 2 + 0.2);
      impact = Math.min(1, impact);
    }

    // 4. Urgency — always a number.
    let urgency = 0.5;
    if (signal.type === "UNLOCK") {
      const now = Date.now();
      const eventTime = signal.rawData?.date || now + 7 * 86400000;
      const daysLeft = (eventTime - now) / 86400000;
      urgency = Math.max(0, Math.min(1, 1 - daysLeft / 14));
    } else if (signal.type === "PRICE_MOVE") {
      const change = Math.abs(signal.rawData?.price_change_percentage_24h || 0);
      urgency = Math.min(1, change / 10);
    } else {
      urgency = 0.5;
    }

    const reasoning = [
      `Relevance: ${(relevance * 100).toFixed(0)}%`,
      impact === null
        ? `Impact: unavailable (event severity ${(eventSeverity * 100).toFixed(0)}%, confidence unknown)`
        : `Impact: ${(impact * 100).toFixed(0)}% (event severity ${(eventSeverity * 100).toFixed(0)}%, portfolio weight ${(personalContext.portfolioWeight * 100).toFixed(0)}%)`,
      `Urgency: ${(urgency * 100).toFixed(0)}%`,
    ];
    if (confidence !== null) {
      reasoning.push(`Confidence: ${(confidence * 100).toFixed(0)}%`);
    } else {
      reasoning.push("Confidence: unavailable (evidence incomplete)");
    }

    // User calibration — DISPLAY ONLY. Never modifies confidence.
    let userCalibration = null;
    if (W.calibration && W.calibration.forAsset) {
      try {
        const r = W.calibration.forAsset(signal.assetId);
        if (r && r.score != null) userCalibration = r;
      } catch {
        /* calibration is optional */
      }
    }

    return {
      relevance,
      impact,
      urgency,
      confidence,
      reasoning,
      userCalibration,
    };
  }

  // ── Helper: Compute Decision Priority ──────────────────────
  function computeDecisionPriority(signal, assessment) {
    // Tolerate partial assessments. A caller may pass an object
    // without `reasoning` (unit tests do this deliberately).
    const reasoning = Array.isArray(assessment?.reasoning)
      ? assessment.reasoning
      : [];

    // Score is null when any factor is null. "Unknown" is not
    // "zero" — a low score and an unavailable score are different
    // claims, and the caller must be able to distinguish them.
    const hasAllFactors =
      assessment.relevance !== null &&
      assessment.relevance !== undefined &&
      assessment.impact !== null &&
      assessment.impact !== undefined &&
      assessment.urgency !== null &&
      assessment.urgency !== undefined &&
      assessment.confidence !== null &&
      assessment.confidence !== undefined;

    const score = hasAllFactors
      ? assessment.relevance *
        assessment.impact *
        assessment.urgency *
        assessment.confidence
      : null;

    const eligibility = hasAllFactors ? ELIGIBLE : INSUFFICIENT_EVIDENCE;

    // Action recommendation. The branching logic below depends on
    // numeric thresholds. When a factor is null, its comparisons are
    // false, so the item falls through to the neutral MONITOR action.
    // That is the honest behavior for insufficient-evidence items —
    // MONITOR is not a claim that the signal is weak, only that the
    // system cannot yet recommend a stronger action.
    let recommendedAction = "MONITOR";

    if (RISK_SIGNAL_TYPES.has(signal.type)) {
      recommendedAction = "REVIEW_RISK";
    } else if (signal.type === "REGIME_SHIFT" && assessment.relevance > 0.5) {
      recommendedAction = "REVIEW_RISK";
    } else if (
      assessment.relevance > 0.7 &&
      assessment.impact > 0.6 &&
      assessment.urgency > 0.5
    ) {
      recommendedAction = "REVIEW_RISK";
    } else if (assessment.relevance > 0.5 && assessment.impact > 0.4) {
      recommendedAction = "REVIEW_THESIS";
    } else if (
      assessment.confidence !== null &&
      assessment.confidence !== undefined &&
      assessment.confidence > 0.8 &&
      assessment.relevance > 0.3
    ) {
      recommendedAction = "LOG_DECISION";
    }

    const scoreText =
      score === null
        ? "Score: unavailable (insufficient evidence)"
        : `Score: ${(score * 100).toFixed(0)}%`;

    const explanation =
      `Signal: ${signal.type} for ${signal.assetId.symbol}. ` +
      scoreText +
      "." +
      (reasoning.length ? ` ${reasoning.join(". ")}` : "");

    return {
      signalId: signal.id,
      assessment,
      score,
      eligibility,
      recommendedAction,
      explanation,
      methodologyVersion: SCORE_VERSION,
      scoreVersion: SCORE_VERSION,
    };
  }

  // ── Main Pipeline ──────────────────────────────────────────
  async function run() {
    const signals = await W.events.collectEvents();
    if (!signals || !signals.length) return [];

    const portfolio = W.portfolio?.all() || [];
    const watchlist = W.watchlist?.list ? W.watchlist.list() : [];
    const theses = W.theses?.all ? W.theses.all() : [];
    const journal = W.journal?.all ? W.journal.all() : [];
    const behavior = W.behavior?.analyze
      ? W.behavior.analyze()
      : { pattern: "none" };
    const settings = W.store?.get("settings", {}) || {};

    const decisions = [];

    for (const signal of signals) {
      if (!W.evidence || typeof W.evidence.build !== "function") {
        console.warn(
          "[DecisionEngine] Evidence builder unavailable; skipping signal:",
          signal.id,
        );
        continue;
      }

      let evidence;
      try {
        evidence = W.evidence.build(signal, signal._metadata || {});
      } catch (e) {
        console.warn("[DecisionEngine] Evidence build failed:", e);
        continue;
      }

      if (!evidence) {
        console.warn(
          "[DecisionEngine] Evidence builder returned null; skipping signal:",
          signal.id,
        );
        continue;
      }

      const context = computePersonalContext(
        signal.assetId,
        portfolio,
        watchlist,
        theses,
        journal,
        behavior,
        settings,
      );

      const assessment = computeAssessment(signal, context, evidence);

      const priority = computeDecisionPriority(signal, assessment);
      priority._assetSymbol = signal.assetId.symbol;
      priority._signalType = signal.type;
      priority._signalTitle = signal.rawData?.title || signal.type;
      decisions.push(priority);
    }

    // Sort eligible items by score descending; insufficient-evidence
    // items sort to the bottom (their score is null, coerced to -1
    // only for comparison purposes).
    decisions.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    // The returned list includes both:
    //   - ELIGIBLE items with a positive score (as before)
    //   - INSUFFICIENT_EVIDENCE items (new — they previously
    //     disappeared because `null > 0` is false)
    //
    // Signals with known confidence but low scores are still filtered
    // out, preserving the prior behavior for the eligible case.
    return decisions.filter(
      (d) => d.eligibility === INSUFFICIENT_EVIDENCE || d.score > 0,
    );
  }

  // ── Presentation ──────────────────────────────────
  function render(container, decisions, limit = 5) {
    if (!container) return;
    const top = decisions.slice(0, limit);
    container.innerHTML = "";

    if (!top.length) {
      container.innerHTML =
        '<div class="card"><p class="muted small">No actionable insights at this time.</p></div>';
      return;
    }

    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent = "⚡ Needs Attention";
    card.appendChild(title);

    const list = document.createElement("ul");
    list.className = "decision-list";

    top.forEach((item) => {
      const li = document.createElement("li");
      li.className = "decision-item";

      const header = document.createElement("div");
      header.className = "decision-header";

      const assetName = document.createElement("b");
      assetName.textContent = item._assetSymbol || "Asset";
      assetName.style.fontSize = "1.1em";

      const scoreSpan = document.createElement("span");
      scoreSpan.className = "muted small";
      const scorePct =
        item.score === null
          ? "Evidence incomplete"
          : `Score: ${(item.score * 100).toFixed(0)}%`;
      scoreSpan.textContent = scorePct;

      header.appendChild(assetName);
      header.appendChild(scoreSpan);
      li.appendChild(header);

      const what = document.createElement("p");
      what.className = "small";
      what.style.margin = "4px 0 0 0";
      what.textContent = item._signalTitle || `${item._signalType} detected`;
      li.appendChild(what);

      // Context
      if (W.context) {
        const eventObj = {
          symbol: item._assetSymbol,
          type: item._signalType,
          title: item._signalTitle,
          impactValue: item.assessment?.impact ?? 0.5,
        };
        const userContext = {
          portfolio: W.portfolio?.all() || [],
          watchlist: (W.watchlist?.list ? W.watchlist.list() : []).map(
            (w) => w.symbol || w,
          ),
          theses: W.theses?.all ? W.theses.all() : [],
          journal: W.journal?.all ? W.journal.all() : [],
          behavior: W.behavior?.analyze
            ? W.behavior.analyze()
            : { pattern: "none" },
        };
        const contextData = W.context.generateContext(eventObj, userContext);
        if (contextData && contextData.whyItMatters) {
          const contextEl = document.createElement("div");
          contextEl.className = "small muted";
          contextEl.style.marginTop = "4px";
          contextEl.textContent = contextData.whyItMatters;
          li.appendChild(contextEl);
          if (
            contextData.recommendedAction &&
            contextData.personalRelevance !== "low"
          ) {
            const actionEl = document.createElement("div");
            actionEl.className = "small";
            actionEl.style.marginTop = "4px";
            actionEl.style.color = "var(--up, #2ee6a8)";
            actionEl.textContent = `→ ${contextData.recommendedAction}`;
            li.appendChild(actionEl);
          }
        }
      } else {
        const fallback = document.createElement("div");
        fallback.className = "small muted";
        fallback.style.marginTop = "4px";
        fallback.textContent = item.explanation || "Review this signal.";
        li.appendChild(fallback);
      }

      // Confidence bar
      const confidence =
        item.assessment?.confidence !== undefined &&
        item.assessment?.confidence !== null
          ? item.assessment.confidence
          : null;

      if (confidence !== null) {
        const confBar = document.createElement("div");
        confBar.className = "decision-conf-bar";
        const confLabel = document.createElement("span");
        confLabel.className = "muted small";
        confLabel.textContent = "Evidence Strength:";
        const bar = document.createElement("div");
        bar.className = "decision-bar";
        const fill = document.createElement("div");
        const confidencePct = (confidence * 100).toFixed(0);
        fill.className = "decision-bar-fill";
        fill.style.width = `${confidencePct}%`;
        fill.style.background =
          confidence > 0.7
            ? "var(--up, #2ee6a8)"
            : confidence > 0.4
              ? "var(--warn, #ffb35c)"
              : "var(--down, #ff5c7a)";
        bar.appendChild(fill);
        const pctSpan = document.createElement("span");
        pctSpan.className = "muted small";
        pctSpan.textContent = `${confidencePct}%`;
        confBar.appendChild(confLabel);
        confBar.appendChild(bar);
        confBar.appendChild(pctSpan);
        li.appendChild(confBar);

        if (confidence < 0.6) {
          const uncertainty = document.createElement("div");
          uncertainty.className = "small muted";
          uncertainty.style.marginTop = "4px";
          uncertainty.style.fontStyle = "italic";
          uncertainty.textContent =
            "⚠️ This signal has significant uncertainty. Consider additional verification.";
          li.appendChild(uncertainty);
        }
      } else {
        const noConf = document.createElement("div");
        noConf.className = "small muted";
        noConf.style.marginTop = "8px";
        noConf.style.fontStyle = "italic";
        noConf.textContent =
          "Evidence incomplete — no confidence score available for this signal.";
        li.appendChild(noConf);
      }

      // Suggested action
      const action = document.createElement("div");
      action.className = "small decision-action";
      const actionText = item.recommendedAction || "MONITOR";
      const actionMap = {
        MONITOR: "👀 Monitor",
        REVIEW_THESIS: "📝 Review Thesis",
        REVIEW_RISK: "⚖️ Review Risk",
        LOG_DECISION: "📓 Log Decision",
      };
      action.textContent = `Suggested: ${actionMap[actionText] || actionText}`;
      li.appendChild(action);

      list.appendChild(li);
    });

    card.appendChild(list);
    container.appendChild(card);
  }

  // ── Public API ──────────────────────────────────────────────
  return {
    run,
    render,
    computePersonalContext,
    computeAssessment,
    computeDecisionPriority,
    SCORE_VERSION,
    ELIGIBILITY: { ELIGIBLE, INSUFFICIENT_EVIDENCE },
  };
})();

console.log("[DecisionEngine] Module loaded (hardened, REBALANCE removed).");
