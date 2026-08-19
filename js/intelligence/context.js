// ===============================================================
//         "Why It Matters" Context Generator
// ===============================================================
//
// Purpose: Synthesize portfolio, thesis, and behavioral data
// to explain why a ranked event matters to the specific user.
// Privacy: 100% local processing (Rule 14).
// Security: Uses textContent for safe rendering (Rule 15).
// Correctness: Handles missing data gracefully (Rule 21).
//
// ===============================================================

window.W = window.W || {};
W.context = (() => {
  // ── Core Context Generation ─────────────────────────────
  function generateContext(event, userContext) {
    const portfolio = userContext?.portfolio || [];
    const theses = userContext?.theses || [];
    const journal = userContext?.journal || [];
    const behavior = userContext?.behavior || { pattern: "none" };

    const symbol = event?.symbol?.toUpperCase();
    if (!symbol) return null; // Rule 21: Reject invalid events

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

    // 1. Portfolio Impact
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

    // 2. Thesis Impact
    if (thesis) {
      whyItMatters += `You have an active thesis on ${symbol}. `;
      // Basic heuristic: high impact negative events or unlocks weaken thesis
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

    // 3. Decision History
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

    // 4. Behavioral Warning
    if (behavior?.pattern !== "none" && personalRelevance === "high") {
      whyItMatters += `Note: Your recent behavior shows a "${behavior.pattern}" pattern. Proceed with caution. `;
    }

    // Fallback for low relevance
    if (!whyItMatters) {
      whyItMatters = `This event may impact the broader market, but you have no direct exposure to ${symbol}.`;
    }

    return {
      event,
      whyItMatters,
      personalRelevance,
      thesisImpact,
      recommendedAction,
      evidence,
      confidence: 0.8,
    };
  }

  // ── Safe UI Renderer (Rule 15) ──────────────────────────
  function renderContext(container, contextData) {
    if (!container || !contextData) return;

    // Clear previous context if re-rendering
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
    text.textContent = contextData.whyItMatters; // SAFE: textContent prevents XSS
    div.appendChild(text);

    if (
      contextData.recommendedAction &&
      contextData.personalRelevance !== "low"
    ) {
      const action = document.createElement("div");
      action.className = "small";
      action.style.marginTop = "6px";
      action.style.color = "var(--up, #2ee6a8)";
      action.textContent = `→ ${contextData.recommendedAction}`; // SAFE
      div.appendChild(action);
    }

    container.appendChild(div);
  }

  return { generateContext, renderContext };
})();

console.log("[Context] Why It Matters generator loaded.");
