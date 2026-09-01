// ===============================================================
//         Unified Decision Engine – Canonical Orchestrator
// ===============================================================
//
// This is the sole intelligence orchestration layer.
// It performs: SIGNAL → EVIDENCE → PERSONAL CONTEXT → ASSESSMENT → DECISION PRIORITY
//
// It does NOT bypass the pipeline.
// It does NOT execute trades.
//
// ===============================================================


window.W = window.W || {};
W.decisionEngine = (() => {

  // ── Helper: Compute Personal Context ──────────────────────
  function computePersonalContext(assetId, portfolio, watchlist, theses, journal, behavior) {
    const symbol = assetId.symbol.toUpperCase();
    let portfolioWeight = 0;
    let watchlistStatus = 'NOT_WATCHING';
    let thesisStatus = 'NONE';
    let recentDecisions = 0;
    let behavioralRisk = 'NONE';

    const holdings = portfolio.filter(h => (h.symbol || '').toUpperCase() === symbol);
    const totalValue = portfolio.reduce((sum, h) => sum + (h.value || 0), 0);
    if (totalValue > 0) {
      portfolioWeight = holdings.reduce((sum, h) => sum + (h.value || 0), 0) / totalValue;
    }

    if (watchlist.some(w => (w || '').toUpperCase() === symbol)) {
      watchlistStatus = 'WATCHING';
    }

    const thesis = theses.find(t => (t.assetId?.symbol || t.symbol || '').toUpperCase() === symbol);
    if (thesis) {
      thesisStatus = thesis.status === 'active' ? 'ACTIVE' : 'INVALIDATED';
    }

    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    recentDecisions = journal.filter(d => {
      const dSymbol = d.assetId?.symbol || d.asset || '';
      return dSymbol.toUpperCase() === symbol && d.timestamp > weekAgo;
    }).length;

    if (behavior && behavior.pattern !== 'none') {
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

  // ── Helper: Compute Assessment ────────────────────────────
  function computeAssessment(signal, personalContext, evidence) {
    let relevance = 0;
    if (personalContext.portfolioWeight > 0) relevance += personalContext.portfolioWeight * 0.4;
    if (personalContext.watchlistStatus === 'WATCHING') relevance += 0.2;
    if (personalContext.thesisStatus === 'ACTIVE') relevance += 0.2;
    relevance += Math.min(1, personalContext.recentDecisions / 5) * 0.1;
    if (personalContext.behavioralRisk === 'PANIC' || personalContext.behavioralRisk === 'FOMO') {
      relevance += 0.1;
    }
    relevance = Math.min(1, relevance);

    let impact = evidence.confidence * 0.7 + 0.3;
    const raw = signal.rawData || {};
    const marketCap = raw.market_cap || raw.mcap || 0;
    const capFactor = marketCap > 1e9 ? 1.0 : marketCap > 1e8 ? 0.8 : 0.5;
    impact = impact * capFactor;
    impact = Math.min(1, impact);

    let urgency = 0.5;
    if (signal.type === 'UNLOCK') {
      const now = Date.now();
      const eventTime = signal.rawData?.date || now + 7 * 86400000;
      const daysLeft = (eventTime - now) / 86400000;
      urgency = Math.max(0, Math.min(1, 1 - daysLeft / 14));
    } else if (signal.type === 'PRICE_MOVE') {
      const change = Math.abs(signal.rawData?.price_change_percentage_24h || 0);
      urgency = Math.min(1, change / 10);
    } else {
      urgency = 0.5;
    }

    const confidence = evidence.confidence || 0.5;

    const reasoning = [
      `Relevance: ${(relevance * 100).toFixed(0)}%`,
      `Impact: ${(impact * 100).toFixed(0)}%`,
      `Urgency: ${(urgency * 100).toFixed(0)}%`,
      `Confidence: ${(confidence * 100).toFixed(0)}%`,
    ];

    return { relevance, impact, urgency, confidence, reasoning };
  }

  // ── Helper: Compute Decision Priority ──────────────────────
  function computeDecisionPriority(signal, assessment) {
    const score = assessment.relevance * assessment.impact * assessment.urgency * assessment.confidence;
    let recommendedAction = 'MONITOR';
    if (assessment.relevance > 0.7 && assessment.impact > 0.6 && assessment.urgency > 0.5) {
      recommendedAction = 'REBALANCE';
    } else if (assessment.relevance > 0.5 && assessment.impact > 0.4) {
      recommendedAction = 'REVIEW_THESIS';
    } else if (assessment.confidence > 0.8 && assessment.relevance > 0.3) {
      recommendedAction = 'LOG_DECISION';
    }

    const explanation = `Signal: ${signal.type} for ${signal.assetId.symbol}. Score: ${(score * 100).toFixed(0)}%. ${assessment.reasoning.join('. ')}`;

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
    const signals = await W.events.collectEvents();
    if (!signals || !signals.length) return [];

    const portfolio = W.portfolio?.all() || [];
    const watchlist = W.watchlist?.list ? W.watchlist.list() : [];
    const theses = W.theses?.all ? W.theses.all() : [];
    const journal = W.journal?.all ? W.journal.all() : [];
    const behavior = W.behavior?.analyze ? W.behavior.analyze() : { pattern: 'none' };

    const decisions = [];

    for (const signal of signals) {
      // Build evidence from signal metadata
      const sourceReliability = signal._evidence?.sourceReliability || 0.5;
      const dataFreshness = signal._evidence?.dataFreshness || 0.8;
      const corroborationCount = signal._evidence?.corroborationCount || 1;
      const dataCompleteness = signal._evidence?.dataCompleteness || 0.8;
      const interpretationConfidence = signal._evidence?.interpretationConfidence || 0.7;

      const evidence = {
        signalId: signal.id,
        sourceReliability,
        dataFreshness,
        corroborationCount,
        dataCompleteness,
        interpretationConfidence,
        reasoning: [`Source: ${signal.source}`],
      };

      if (W.intelligence && typeof W.intelligence.computeConfidence === 'function') {
        evidence.confidence = W.intelligence.computeConfidence(evidence);
      } else {
        evidence.confidence = sourceReliability * dataFreshness * 0.8 * dataCompleteness * interpretationConfidence;
        evidence.confidence = Math.min(1, Math.max(0, evidence.confidence));
      }

      const context = computePersonalContext(signal.assetId, portfolio, watchlist, theses, journal, behavior);
      const assessment = computeAssessment(signal, context, evidence);
      const priority = computeDecisionPriority(signal, assessment);
      // Attach asset symbol and signal type for presentation
      priority._assetSymbol = signal.assetId.symbol;
      priority._signalType = signal.type;
      priority._signalTitle = signal.rawData?.title || signal.type;
      decisions.push(priority);
    }

    decisions.sort((a, b) => b.score - a.score);
    return decisions;
  }

  // ── Presentation: "What Matters Now?" ──────────────────────
  function render(container, decisions, limit = 5) {
    if (!container) return;
    const top = decisions.slice(0, limit);
    container.innerHTML = '';

    if (!top.length) {
      container.innerHTML = '<div class="card"><p class="muted small">No actionable insights at this time.</p></div>';
      return;
    }

    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('h3');
    title.textContent = '⚡ What Matters Now';
    card.appendChild(title);

    const list = document.createElement('ul');
    list.style.cssText = 'list-style:none; padding:0; margin:0;';

    top.forEach((item) => {
      const li = document.createElement('li');
      li.style.cssText = 'padding: 12px 0; border-bottom: 1px solid var(--border, #30363d);';

      // ── Header: Asset and Score ──────────────────────────────
      const header = document.createElement('div');
      header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;';

      const assetName = document.createElement('b');
      assetName.textContent = item._assetSymbol || 'Asset';
      assetName.style.fontSize = '1.1em';

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'muted small';
      const scorePct = (item.score * 100).toFixed(0);
      scoreSpan.textContent = `Score: ${scorePct}%`;

      header.appendChild(assetName);
      header.appendChild(scoreSpan);
      li.appendChild(header);

      // ── What Happened ──────────────────────────────────────────
      const what = document.createElement('p');
      what.className = 'small';
      what.style.margin = '4px 0 0 0';
      what.textContent = item._signalTitle || `${item._signalType} detected`;
      li.appendChild(what);

      // ── Why It Matters (Personalized Context) ─────────────────
      // Use W.context to generate rich context
      if (W.context) {
        // Build a simplified event object for context generator
        const eventObj = {
          symbol: item._assetSymbol,
          type: item._signalType,
          title: item._signalTitle,
          impactValue: item.assessment?.impact || 0.5,
        };
        // Get user context
        const userContext = {
          portfolio: W.portfolio?.all() || [],
          watchlist: (W.watchlist?.list ? W.watchlist.list() : []).map(w => w.symbol || w),
          theses: W.theses?.all ? W.theses.all() : [],
          journal: W.journal?.all ? W.journal.all() : [],
          behavior: W.behavior?.analyze ? W.behavior.analyze() : { pattern: 'none' },
        };
        const contextData = W.context.generateContext(eventObj, userContext);
        if (contextData && contextData.whyItMatters) {
          const contextEl = document.createElement('div');
          contextEl.className = 'small muted';
          contextEl.style.marginTop = '4px';
          contextEl.textContent = contextData.whyItMatters;
          li.appendChild(contextEl);

          // Show recommended action if any
          if (contextData.recommendedAction && contextData.personalRelevance !== 'low') {
            const actionEl = document.createElement('div');
            actionEl.className = 'small';
            actionEl.style.marginTop = '4px';
            actionEl.style.color = 'var(--up, #2ee6a8)';
            actionEl.textContent = `→ ${contextData.recommendedAction}`;
            li.appendChild(actionEl);
          }
        }
      } else {
        // Fallback if context module is not available
        const fallback = document.createElement('div');
        fallback.className = 'small muted';
        fallback.style.marginTop = '4px';
        fallback.textContent = item.explanation || 'Review this signal.';
        li.appendChild(fallback);
      }

      // ── Confidence Bar ────────────────────────────────────────
      const confidence = item.assessment?.confidence || 0.5;
      const confBar = document.createElement('div');
      confBar.style.cssText = 'margin-top: 8px; display: flex; align-items: center; gap: 8px;';
      const confLabel = document.createElement('span');
      confLabel.className = 'muted small';
      confLabel.textContent = 'Confidence:';
      const bar = document.createElement('div');
      bar.style.cssText = 'flex: 1; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;';
      const fill = document.createElement('div');
      const confidencePct = (confidence * 100).toFixed(0);
      fill.style.cssText = `width: ${confidencePct}%; height: 100%; background: ${confidence > 0.7 ? 'var(--up, #2ee6a8)' : confidence > 0.4 ? 'var(--warn, #ffb35c)' : 'var(--down, #ff5c7a)'}; border-radius: 2px;`;
      bar.appendChild(fill);
      const pctSpan = document.createElement('span');
      pctSpan.className = 'muted small';
      pctSpan.textContent = `${confidencePct}%`;
      confBar.appendChild(confLabel);
      confBar.appendChild(bar);
      confBar.appendChild(pctSpan);
      li.appendChild(confBar);

      // ── Uncertainty / Limitations ────────────────────────────
      if (confidence < 0.6) {
        const uncertainty = document.createElement('div');
        uncertainty.className = 'small muted';
        uncertainty.style.marginTop = '4px';
        uncertainty.style.fontStyle = 'italic';
        uncertainty.textContent = '⚠️ This signal has significant uncertainty. Consider additional verification.';
        li.appendChild(uncertainty);
      }

      // ── Suggested Review ──────────────────────────────────────
      const action = document.createElement('div');
      action.className = 'small';
      action.style.marginTop = '6px';
      action.style.padding = '4px 8px';
      action.style.background = 'rgba(124, 92, 255, 0.1)';
      action.style.borderRadius = '4px';
      const actionText = item.recommendedAction || 'MONITOR';
      const actionMap = {
        'MONITOR': '👀 Monitor',
        'REVIEW_THESIS': '📝 Review Thesis',
        'REBALANCE': '⚖️ Consider Rebalancing',
        'LOG_DECISION': '📓 Log Decision',
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

console.log('[DecisionEngine] Module loaded (enhanced presentation).');