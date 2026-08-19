// ===============================================================
//         "What Matters Now" Ranker Engine
// ===============================================================
//
// Purpose: Rank events by importance to the user.
// Formula: Score = Impact × Relevance × Confidence × Urgency
// (Section 28)
//
// ===============================================================

window.W = window.W || {};
W.ranker = (() => {
  // ── Safe Number Utility (Section 21: Data Correctness) ──
  function safeNum(val, fallback = 0.5) {
    const n = parseFloat(val);
    if (isNaN(n)) return fallback;
    return Math.max(0, Math.min(1, n)); // Clamp between 0.0 and 1.0
  }

  // ── Scoring Components ──────────────────────────────────

  function calculateImpact(event) {
    if (
      event.type === "price_change" &&
      typeof event.impactValue === "number"
    ) {
      // A 10% move is considered maximum impact (1.0)
      return Math.min(1, Math.abs(event.impactValue) / 10);
    }
    // For news, unlocks, etc., use provided impactValue or default
    return typeof event.impactValue === "number"
      ? Math.min(1, Math.max(0, event.impactValue))
      : 0.5;
  }

  function calculateRelevance(symbol, context) {
    if (!symbol) return 0.1;
    const sym = String(symbol).toUpperCase();
    const portfolio = (context.portfolio || []).map((s) =>
      String(s).toUpperCase(),
    );
    const watchlist = (context.watchlist || []).map((s) =>
      String(s).toUpperCase(),
    );

    if (portfolio.includes(sym)) return 1.0;
    if (watchlist.includes(sym)) return 0.6;
    return 0.2; // Low relevance for unrelated assets
  }

  // ── Core Ranking Logic ──────────────────────────────────

  /**
   * Score and sort an array of events.
   * @param {Array} events - Array of event objects.
   * @param {Object} context - { portfolio: ['BTC'], watchlist: ['ETH'] }
   * @returns {Array} - Sorted events with score breakdown.
   */
  function scoreEvents(events, context = {}) {
    if (!Array.isArray(events)) return [];

    return events
      .map((event) => {
        const impact = calculateImpact(event);
        const relevance = calculateRelevance(event.symbol, context);
        const confidence = safeNum(event.confidence, 0.5);
        const urgency = safeNum(event.urgency, 0.5);

        // Deterministic final score (Section 22)
        const finalScore = impact * relevance * confidence * urgency;

        return {
          ...event,
          scores: { impact, relevance, confidence, urgency },
          finalScore,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Get the top N most important events.
   */
  function getTopEvents(events, context, limit = 3) {
    return scoreEvents(events, context).slice(0, limit);
  }

  // ── Safe UI Renderer (Section 15: Frontend Security) ──

  /**
   * Render the "What Matters Now" card into a container.
   * Now integrates W.context to explain why each event matters.
   */
  function renderCard(container, events, context) {
    if (!container) return;

    const top = getTopEvents(events, context, 3);
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = "⚡ What Matters Now";
    card.appendChild(title);

    if (top.length === 0) {
      const p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "No significant events detected right now.";
      card.appendChild(p);
    } else {
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
        sym.textContent = item.symbol || "MARKET";

        const score = document.createElement("span");
        score.className = "muted small";
        score.textContent = `Score: ${(item.finalScore * 100).toFixed(0)}%`;

        header.appendChild(sym);
        header.appendChild(score);
        li.appendChild(header);

        const desc = document.createElement("p");
        desc.className = "small muted";
        desc.style.margin = "4px 0 0 0";
        desc.textContent = item.title || item.description || "Event detected.";
        li.appendChild(desc);

        // ─ NEW: Render Context (Task 18) ────────────────
        if (W.context) {
          const contextData = W.context.generateContext(item, context);
          if (contextData) {
            const contextContainer = document.createElement("div");
            li.appendChild(contextContainer);
            W.context.renderContext(contextContainer, contextData);
          }
        }
        // ──────────────────────────────────────────────────

        list.appendChild(li);
      });
      card.appendChild(list);
    }
    container.appendChild(card);
  }

  return { scoreEvents, getTopEvents, renderCard };
})();

console.log("[Ranker] What Matters Now engine loaded.");
