// ===============================================================
//         "Why It Matters" Context Generator 
// ===============================================================

window.W = window.W || {};
W.context = (() => {
  function generateContext(event, userContext) {
    const portfolio = userContext?.portfolio || [];
    const theses = userContext?.theses || [];
    const journal = userContext?.journal || [];
    const behavior = userContext?.behavior || { pattern: "none" };

    const symbol = event?.symbol?.toUpperCase();
    if (!symbol) return null;

    const holding = portfolio.find((h) => h?.symbol?.toUpperCase() === symbol);
    const thesis = theses.find((t) => t?.asset?.toUpperCase() === symbol);
    const recentDecisions = journal.filter(
      (d) =>
        d?.asset?.toUpperCase() === symbol &&
        Date.now() - new Date(d.timestamp).getTime() < 7 * 86400000,
    );

    let whyItMatters = "";
    let personalRelevance = "low";
    let thesisImpact = "none";
    let recommendedAction = "Monitor the broader market.";
    const evidence = [];

    if (holding) {
      personalRelevance = "high";
      const qty = parseFloat(holding.qty) || 0;
      whyItMatters += `You hold ${qty} ${symbol}. `;
      evidence.push({
        claim: `User holds ${symbol}`,
        evidence: `${qty} units`,
        source: "portfolio",
        timestamp: new Date().toISOString(),
        confidence: 0.95,
      });
    }

    if (thesis) {
      whyItMatters += `You have an active thesis on ${symbol}. `;
      if (
        (event.type === "price_change" && event.impactValue > 0.6) ||
        event.type === "unlock"
      ) {
        thesisImpact = "weakening";
        recommendedAction = "Review your thesis invalidation conditions.";
      }
      evidence.push({
        claim: `User has thesis on ${symbol}`,
        evidence: thesis.statement || "Thesis exists",
        source: "theses",
        timestamp: new Date().toISOString(),
        confidence: 0.9,
      });
    }

    if (recentDecisions.length > 0) {
      whyItMatters += `You made ${recentDecisions.length} decision(s) regarding ${symbol} in the last 7 days. `;
      evidence.push({
        claim: `Recent decisions on ${symbol}`,
        evidence: `${recentDecisions.length} recent journal entries`,
        source: "journal",
        timestamp: new Date().toISOString(),
        confidence: 0.85,
      });
    }

    if (behavior?.pattern !== "none" && personalRelevance === "high") {
      whyItMatters += `Note: Your recent behavior shows a "${behavior.pattern}" pattern. Proceed with caution. `;
    }

    if (!whyItMatters) {
      whyItMatters = `This event may impact the broader market, but you have no direct exposure to ${symbol}.`;
    }

    let confidence = 0.5;
    if (evidence.length > 0) {
      confidence =
        evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length;
    }

    return {
      event,
      whyItMatters,
      personalRelevance,
      thesisImpact,
      recommendedAction,
      evidence,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  // ── Render Context (kept for compatibility) ──────────────────
  function renderContext(container, contextData) {
    if (!container || !contextData) return;
    const existing = container.querySelector(".context-render");
    if (existing) existing.remove();

    const div = document.createElement("div");
    div.className = "context-render";
    div.style.cssText =
      "margin-top: 8px; padding: 8px 12px; background: rgba(124, 92, 255, 0.05); border-left: 3px solid var(--primary, #7c5cff); border-radius: 4px;";

    const title = document.createElement("div");
    title.className = "small";
    title.style.fontWeight = "bold";
    title.textContent = "Why it matters:";
    div.appendChild(title);

    const text = document.createElement("div");
    text.className = "small muted";
    text.style.marginTop = "4px";
    text.style.lineHeight = "1.4";
    text.textContent = contextData.whyItMatters;
    div.appendChild(text);

    if (
      contextData.recommendedAction &&
      contextData.personalRelevance !== "low"
    ) {
      const action = document.createElement("div");
      action.className = "small";
      action.style.marginTop = "6px";
      action.style.color = "var(--up, #2ee6a8)";
      action.textContent = `→ ${contextData.recommendedAction}`;
      div.appendChild(action);
    }

    if (contextData.confidence !== undefined) {
      const conf = document.createElement("div");
      conf.className = "small muted";
      conf.style.marginTop = "4px";
      const pct = (contextData.confidence * 100).toFixed(0);
      conf.textContent = `Confidence: ${pct}%`;
      div.appendChild(conf);
    }

    container.appendChild(div);
  }

  return { generateContext, renderContext };
})();

console.log("[Context] Why It Matters generator loaded (Phase 6 ready).");
