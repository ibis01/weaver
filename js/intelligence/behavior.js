// ===============================================================
//         Behavioral Pattern Detection Engine
// ===============================================================
//
// Purpose: Analyze decision journal to surface cognitive biases.
// Privacy: 100% local processing. Never sends data externally (Rule 14).
// Security: Uses textContent/escapeHTML for safe rendering (Rule 15).
//
// ===============================================================

window.W = window.W || {};
W.behavior = (() => {
  const HOUR = 3600000;
  const DAY = 86400000;

  // ── Core Analysis Logic ─────────────────────────────────
  function analyze() {
    const decisions = W.journal?.all() || [];

    // Rule 21: Handle insufficient data gracefully
    if (decisions.length < 3) {
      return {
        pattern: "none",
        severity: "low",
        evidence: "Insufficient decision history to detect patterns.",
        recommendation:
          "Log more decisions in the Journal to unlock behavioral insights.",
      };
    }

    // Sort chronologically (oldest to newest)
    const sorted = [...decisions].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    );

    // 1. Panic Selling Detection
    // Heuristic: 3+ sells within 7 days, OR sells with very low confidence (<0.3)
    const recentSells = sorted.filter(
      (d) =>
        d.action === "Sell" && Date.now() - new Date(d.timestamp) < 7 * DAY,
    );
    const lowConfSells = sorted.filter(
      (d) => d.action === "Sell" && parseFloat(d.confidence) < 0.3,
    );

    if (recentSells.length >= 3 || lowConfSells.length >= 2) {
      return {
        pattern: "panic_selling",
        severity: "high",
        evidence: `Detected ${recentSells.length} recent sell decisions, with ${lowConfSells.length} made under low confidence.`,
        recommendation:
          "Consider setting predefined stop-losses based on your thesis invalidation conditions, rather than making emotional sell decisions during volatility.",
      };
    }

    // 2. FOMO / Revenge Trading Detection
    // Heuristic: Interacting with the same asset within 24 hours
    for (let i = 0; i < sorted.length; i++) {
      const d1 = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const d2 = sorted[j];
        const timeDiff = Math.abs(
          new Date(d2.timestamp) - new Date(d1.timestamp),
        );

        if (timeDiff < 24 * HOUR && d1.asset === d2.asset) {
          // Revenge Trading: Sell then Buy same asset quickly
          if (d1.action === "Sell" && d2.action === "Buy") {
            return {
              pattern: "revenge_trading",
              severity: "high",
              evidence: `Bought ${d1.asset} shortly after selling it (within 24h).`,
              recommendation:
                "Avoid round-tripping trades. Stick to your original thesis. If the thesis was invalidated, do not re-enter immediately out of regret.",
            };
          }
          // FOMO Buying: Multiple buys of same asset quickly
          if (d1.action === "Buy" && d2.action === "Buy") {
            return {
              pattern: "fomo_buying",
              severity: "medium",
              evidence: `Multiple buy decisions for ${d1.asset} within a 24-hour window.`,
              recommendation:
                "Ensure you are dollar-cost averaging according to a predefined plan, rather than chasing short-term price action.",
            };
          }
        }
      }
    }

    return {
      pattern: "none",
      severity: "low",
      evidence: "No significant behavioral biases detected in recent history.",
      recommendation: "Continue logging decisions to maintain self-awareness.",
    };
  }

  // ── Safe UI Renderer (Rule 15) ──────────────────────────
  function renderSummary(container) {
    if (!container) return;
    const result = analyze();
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = "🧠 Behavioral Insights";
    card.appendChild(title);

    const p = document.createElement("p");
    p.className = "small";
    p.textContent = result.evidence; // SAFE: textContent prevents XSS
    card.appendChild(p);

    if (result.pattern !== "none") {
      const rec = document.createElement("div");
      rec.style.cssText =
        "margin-top:10px; padding:10px; background:rgba(255, 92, 122, 0.1); border-radius:6px;";
      // SAFE: escapeHTML used for dynamic text injected via innerHTML
      rec.innerHTML = `<b class="small" style="color:var(--down)">⚠️ Recommendation:</b> <span class="small">${W.fmt.escapeHTML(result.recommendation)}</span>`;
      card.appendChild(rec);
    }

    container.appendChild(card);
  }

  return { analyze, renderSummary };
})();

console.log("[Behavior] Pattern detection engine loaded.");
