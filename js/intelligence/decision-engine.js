// ===============================================================
//         Unified Decision Engine
// ===============================================================
//
// Orchestrates: Signals → Evidence → PersonalContext → Assessment → DecisionPriority → Presentation
// This replaces the monolithic ranker and provides a clean pipeline.
//
// ===============================================================

window.W = window.W || {};
W.decisionEngine = (() => {
  // ── Compute Personal Context for an asset ──────────────────
  function computePersonalContext(
    assetId,
    portfolio,
    watchlist,
    theses,
    journal,
    behavior,
  ) {
    const symbol = assetId.symbol.toUpperCase();
    let portfolioWeight = 0;
    let watchlistStatus = "NOT_WATCHING";
    let thesisStatus = "NONE";
    let recentDecisions = 0;
    let behavioralRisk = "NONE";

    // Portfolio
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

    // Thesis
    const thesis = theses.find(
      (t) => (t.assetId?.symbol || t.symbol || "").toUpperCase() === symbol,
    );
    if (thesis) {
      thesisStatus = thesis.status === "active" ? "ACTIVE" : "INVALIDATED";
    }

    // Recent decisions
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    recentDecisions = journal.filter((d) => {
      const dSymbol = d.assetId?.symbol || d.asset || "";
      return dSymbol.toUpperCase() === symbol && d.timestamp > weekAgo;
    }).length;

    // Behavioral risk (if behavior module provides per-asset risk)
    if (behavior && behavior.pattern !== "none") {
      behavioralRisk = behavior.pattern.toUpperCase();
    }

    return {
      assetId,
      portfolioWeight,
      watchlistStatus,
      thesisStatus,
      recentDecisions,
      behavioralRisk,
    };
  }

  // ── Compute Assessment from Signal and Context ────────────
  function computeAssessment(signal, personalContext, evidence) {
    // Relevance: portfolioWeight*0.4 + watchlist*0.2 + thesis*0.2 + recentDecisions*0.1 + behavioralRisk*0.1
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

    // Impact: based on evidence strength and market cap factor (rough)
    let impact = evidence.confidence * 0.7 + 0.3; // baseline 0.3
    // Market cap factor: if asset is in top 100, increase impact
    // For now, we'll just use a placeholder based on rawData
    const raw = signal.rawData || {};
    const marketCap = raw.market_cap || raw.mcap || 0;
    const capFactor = marketCap > 1e9 ? 1.0 : marketCap > 1e8 ? 0.8 : 0.5;
    impact = impact * capFactor;
    impact = Math.min(1, impact);

    // Urgency: time decay to event or volatility
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

    // Confidence: use evidence.confidence
    const confidence = evidence.confidence || 0.5;

    // Reasoning
    const reasoning = [
      `Relevance: ${(relevance * 100).toFixed(0)}%`,
      `Impact: ${(impact * 100).toFixed(0)}%`,
      `Urgency: ${(urgency * 100).toFixed(0)}%`,
      `Confidence: ${(confidence * 100).toFixed(0)}%`,
    ];

    return { relevance, impact, urgency, confidence, reasoning };
  }

  // ── Compute DecisionPriority from Assessment ──────────────
  function computeDecisionPriority(signal, assessment) {
    const score =
      assessment.relevance *
      assessment.impact *
      assessment.urgency *
      assessment.confidence;
    // Determine action
    let recommendedAction = "MONITOR";
    if (
      assessment.relevance > 0.7 &&
      assessment.impact > 0.6 &&
      assessment.urgency > 0.5
    ) {
      recommendedAction = "REBALANCE";
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

  // ── Main pipeline ──────────────────────────────────────────
  async function run() {
    // 1. Collect signals
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

    // 3. For each signal, compute evidence, context, assessment, priority
    const decisions = [];

    for (const signal of signals) {
      // Evidence: use signal's _confidence and other attributes
      const evidence = {
        signalId: signal.id,
        sourceReliability:
          W.intelligence?.sourceReliability?.[signal.source] || 0.5,
        dataFreshness: 0.8, // placeholder
        corroborationCount: 1,
        dataCompleteness: 0.8,
        interpretationConfidence: 0.7,
        confidence: signal._confidence || 0.5,
        reasoning: ["Based on source reliability and freshness"],
      };

      // Personal context
      const context = computePersonalContext(
        signal.assetId,
        portfolio,
        watchlist,
        theses,
        journal,
        behavior,
      );

      // Assessment
      const assessment = computeAssessment(signal, context, evidence);

      // Decision priority
      const priority = computeDecisionPriority(signal, assessment);

      decisions.push(priority);
    }

    // Sort by score descending
    decisions.sort((a, b) => b.score - a.score);

    return decisions;
  }

  // ── Render top decisions ───────────────────────────────────
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
        "display:flex; justify-content:space-between; align-items:center;";

      const sym = document.createElement("b");
      sym.textContent = item.assessment.signalId; // we'll improve
      // Better: get asset symbol from signal
      const signal = W.events._signals?.find((s) => s.id === item.signalId);
      const symbol = signal ? signal.assetId.symbol : "Unknown";
      sym.textContent = symbol;

      const score = document.createElement("span");
      score.className = "muted small";
      score.textContent = `Score: ${(item.score * 100).toFixed(0)}%`;

      header.appendChild(sym);
      header.appendChild(score);
      li.appendChild(header);

      const desc = document.createElement("p");
      desc.className = "small muted";
      desc.style.margin = "4px 0 0 0";
      desc.textContent =
        item.explanation || `Recommended action: ${item.recommendedAction}`;
      li.appendChild(desc);

      // Add context from W.context if available
      if (W.context) {
        const contextContainer = document.createElement("div");
        li.appendChild(contextContainer);
        // We need to generate context; pass the signal and user data
        // For simplicity, we skip detailed context here.
      }

      list.appendChild(li);
    });

    card.appendChild(list);
    container.appendChild(card);
  }

  // ── Public API ────────────────────────────────────────────
  return {
    run,
    render,
    computePersonalContext,
    computeAssessment,
    computeDecisionPriority,
  };
})();

console.log("[DecisionEngine] Module loaded.");
