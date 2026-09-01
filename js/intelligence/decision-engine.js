// ===============================================================
//         Unified Decision Engine – Hardened
// ===============================================================
//
// Consumes Evidence objects from the Evidence Builder.
// No longer reconstructs evidence.
// Uses user-centric impact, not market-cap buckets.
// No REBALANCE action.
//
// ===============================================================

window.W = window.W || {};
W.decisionEngine = (() => {
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
    let decisionConfidence = 0;
    let chainExposure = 0;
    let sectorExposure = 0;

    // Portfolio weight
    const holdings = portfolio.filter(
      (h) => (h.symbol || "").toUpperCase() === symbol,
    );
    const totalValue = portfolio.reduce((sum, h) => sum + (h.value || 0), 0);
    if (totalValue > 0) {
      portfolioWeight =
        holdings.reduce((sum, h) => sum + (h.value || 0), 0) / totalValue;
    }

    // Watchlist
    if (watchlist.some((w) => (w || "").toUpperCase() === symbol)) {
      watchlistStatus = "WATCHING";
    }

    // Thesis status and health
    const thesis = theses.find(
      (t) => (t.assetId?.symbol || t.symbol || "").toUpperCase() === symbol,
    );
    if (thesis) {
      thesisStatus = thesis.status === "active" ? "ACTIVE" : "INVALIDATED";
      if (W.thesisHealth && thesis.status === "active") {
        // Get current price to evaluate health
        const price = holdings.length > 0 ? holdings[0].price : null;
        const health = W.thesisHealth.evaluate(thesis, { price }, []);
        thesisHealth = health ? health.healthScore : 0;
      }
    }

    // Recent decisions
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const recent = journal.filter((d) => {
      const dSymbol = d.assetId?.symbol || d.asset || "";
      return dSymbol.toUpperCase() === symbol && d.timestamp > weekAgo;
    });
    recentDecisions = recent.length;

    // Decision confidence (average confidence of recent decisions)
    if (recent.length > 0) {
      decisionConfidence =
        recent.reduce((sum, d) => sum + (d.confidence || 0.5), 0) /
        recent.length;
    } else {
      decisionConfidence = 0.5;
    }

    // Behavioral risk
    if (behavior && behavior.pattern !== "none") {
      behavioralRisk = behavior.pattern.toUpperCase();
    }

    // Chain and sector exposure (simplified)
    // For now, we'll use placeholder values.
    // In a full implementation, we'd resolve chain and sector from assetId.
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
    // 1. Relevance
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

    // 2. Impact – portfolio‑aware, not market‑cap based
    // impact = evidence.confidence * portfolioWeight * eventSeverity
    const eventSeverity = signal.rawData?.impactValue || 0.5; // 0–1
    let impact =
      evidence.confidence *
      eventSeverity *
      (personalContext.portfolioWeight * 2 + 0.2);
    impact = Math.min(1, impact);

    // 3. Urgency
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

    const confidence = evidence.confidence || 0.5;

    const reasoning = [
      `Relevance: ${(relevance * 100).toFixed(0)}%`,
      `Impact: ${(impact * 100).toFixed(0)}% (event severity ${(eventSeverity * 100).toFixed(0)}%, portfolio weight ${(personalContext.portfolioWeight * 100).toFixed(0)}%)`,
      `Urgency: ${(urgency * 100).toFixed(0)}%`,
      `Confidence: ${(confidence * 100).toFixed(0)}%`,
    ];

    return { relevance, impact, urgency, confidence, reasoning };
  }

  // ── Helper: Compute Decision Priority ──────────────────────
  function computeDecisionPriority(signal, assessment) {
    const score =
      assessment.relevance *
      assessment.impact *
      assessment.urgency *
      assessment.confidence;
    let recommendedAction = "MONITOR";
    if (
      assessment.relevance > 0.7 &&
      assessment.impact > 0.6 &&
      assessment.urgency > 0.5
    ) {
      // Previously REBALANCE – now REVIEW_RISK
      recommendedAction = "REVIEW_RISK";
    } else if (assessment.relevance > 0.5 && assessment.impact > 0.4) {
      recommendedAction = "REVIEW_THESIS";
    } else if (assessment.confidence > 0.8 && assessment.relevance > 0.3) {
      recommendedAction = "LOG_DECISION";
    }

    const explanation = `Signal: ${signal.type} for ${signal.assetId.symbol}. Score: ${(score * 100).toFixed(0)}%. ${assessment.reasoning.join(". ")}`;

    return {
      signalId: signal.id,
      assessment,
      score,
      recommendedAction,
      explanation,
    };
  }

  // ── Main Pipeline ──────────────────────────────────────────
  async function run() {
    // 1. Collect raw signals
    const signals = await W.events.collectEvents();
    if (!signals || !signals.length) return [];

    // 2. Gather personal data
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
      // 3. Build evidence using the Evidence Builder
      let evidence;
      try {
        if (W.evidence && typeof W.evidence.build === "function") {
          evidence = W.evidence.build(signal, signal._metadata || {});
        } else {
          // Fallback (should not happen)
          evidence = {
            signalId: signal.id,
            sourceReliability: 0.5,
            dataFreshness: 0.8,
            corroborationCount: 1,
            dataCompleteness: 0.8,
            interpretationConfidence: 0.7,
            confidence: 0.5,
            reasoning: ["Fallback evidence"],
          };
        }
      } catch (e) {
        console.warn("[DecisionEngine] Evidence build failed:", e);
        continue;
      }

      // 4. Compute Personal Context
      const context = computePersonalContext(
        signal.assetId,
        portfolio,
        watchlist,
        theses,
        journal,
        behavior,
        settings,
      );

      // 5. Compute Assessment
      const assessment = computeAssessment(signal, context, evidence);

      // 6. Compute Decision Priority
      const priority = computeDecisionPriority(signal, assessment);
      // Attach asset symbol for UI
      priority._assetSymbol = signal.assetId.symbol;
      priority._signalType = signal.type;
      priority._signalTitle = signal.rawData?.title || signal.type;
      decisions.push(priority);
    }

    decisions.sort((a, b) => b.score - a.score);
    return decisions;
  }

  // ── Presentation (unchanged) ──────────────────────────────────
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
    title.textContent = "⚡ What Matters Now";
    card.appendChild(title);

    const list = document.createElement("ul");
    list.style.cssText = "list-style:none; padding:0; margin:0;";

    top.forEach((item) => {
      const li = document.createElement("li");
      li.style.cssText =
        "padding: 12px 0; border-bottom: 1px solid var(--border, #30363d);";

      const header = document.createElement("div");
      header.style.cssText =
        "display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;";

      const assetName = document.createElement("b");
      assetName.textContent = item._assetSymbol || "Asset";
      assetName.style.fontSize = "1.1em";

      const scoreSpan = document.createElement("span");
      scoreSpan.className = "muted small";
      const scorePct = (item.score * 100).toFixed(0);
      scoreSpan.textContent = `Score: ${scorePct}%`;

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
          impactValue: item.assessment?.impact || 0.5,
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
      const confidence = item.assessment?.confidence || 0.5;
      const confBar = document.createElement("div");
      confBar.style.cssText =
        "margin-top: 8px; display: flex; align-items: center; gap: 8px;";
      const confLabel = document.createElement("span");
      confLabel.className = "muted small";
      confLabel.textContent = "Evidence Strength:";
      const bar = document.createElement("div");
      bar.style.cssText =
        "flex: 1; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;";
      const fill = document.createElement("div");
      const confidencePct = (confidence * 100).toFixed(0);
      fill.style.cssText = `width: ${confidencePct}%; height: 100%; background: ${confidence > 0.7 ? "var(--up, #2ee6a8)" : confidence > 0.4 ? "var(--warn, #ffb35c)" : "var(--down, #ff5c7a)"}; border-radius: 2px;`;
      bar.appendChild(fill);
      const pctSpan = document.createElement("span");
      pctSpan.className = "muted small";
      pctSpan.textContent = `${confidencePct}%`;
      confBar.appendChild(confLabel);
      confBar.appendChild(bar);
      confBar.appendChild(pctSpan);
      li.appendChild(confBar);

      // Uncertainty note
      if (confidence < 0.6) {
        const uncertainty = document.createElement("div");
        uncertainty.className = "small muted";
        uncertainty.style.marginTop = "4px";
        uncertainty.style.fontStyle = "italic";
        uncertainty.textContent =
          "⚠️ This signal has significant uncertainty. Consider additional verification.";
        li.appendChild(uncertainty);
      }

      // Suggested action (now MONITOR, REVIEW_THESIS, REVIEW_RISK, LOG_DECISION)
      const action = document.createElement("div");
      action.className = "small";
      action.style.marginTop = "6px";
      action.style.padding = "4px 8px";
      action.style.background = "rgba(124, 92, 255, 0.1)";
      action.style.borderRadius = "4px";
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
  };
})();

console.log("[DecisionEngine] Module loaded (hardened, REBALANCE removed).");
