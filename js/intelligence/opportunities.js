// ===============================================================
//         Opportunity Scanner Engine
// ===============================================================
//
// Purpose: Proactively synthesize portfolio, thesis, and market
// data to surface personalized, actionable observations.
// Rules: 22 (Deterministic), 24 (Intelligence), 28 (Ranking).
//
// ===============================================================

window.W = window.W || {};
W.opportunities = (() => {
  const DISCLAIMER =
    "Observation based on your tracked data. Not financial advice.";

  /**
   * Scan user data for potential opportunities or risks.
   * @param {Array} portfolio - Array of holding objects.
   * @param {Array} theses - Array of thesis objects.
   * @param {Array} markets - Array of market data objects (from W.api.top).
   * @param {Object} regimeData - Output from W.regime.detect().
   * @returns {Array} - Array of opportunity event objects.
   */
  function scan(portfolio, theses, markets, regimeData) {
    const opportunities = [];
    if (!portfolio || !theses) return opportunities;

    // Create a quick lookup map for current prices
    const priceMap = {};
    if (Array.isArray(markets)) {
      markets.forEach((m) => {
        if (m && m.symbol) priceMap[m.symbol.toLowerCase()] = m.current_price;
      });
    }

    // ── Scanner 1: Thesis Alignment (DCA Signal) ────────────
    theses
      .filter((t) => t.status === "active" && t.target)
      .forEach((t) => {
        const currentPrice = priceMap[t.asset?.toLowerCase()];
        if (currentPrice && currentPrice < t.target * 0.85) {
          const pctBelow = (
            ((currentPrice - t.target) / t.target) *
            100
          ).toFixed(1);
          opportunities.push({
            type: "opportunity",
            symbol: t.asset,
            title: `Potential DCA Zone: ${t.asset}`,
            description: `${t.asset} is currently ${pctBelow}% below your thesis target of $${t.target}. ${DISCLAIMER}`,
            impactValue: 0.7,
            confidence: 0.8,
            urgency: 0.6,
            source: "opportunity_scanner",
          });
        }
      });

    // ── Scanner 2: Diversification Gap ──────────────────────
    if (portfolio.length > 1) {
      let totalValue = 0;
      const assetValues = portfolio.map((p) => {
        const price = priceMap[p.symbol?.toLowerCase()] || 0;
        const val = (parseFloat(p.qty) || 0) * price;
        totalValue += val;
        return { symbol: p.symbol, val };
      });

      if (totalValue > 0) {
        assetValues.forEach((v) => {
          const pct = (v.val / totalValue) * 100;
          if (pct > 50) {
            opportunities.push({
              type: "opportunity",
              symbol: v.symbol,
              title: `Concentration Risk: ${v.symbol}`,
              description: `${v.symbol} makes up ${pct.toFixed(1)}% of your portfolio value. Consider rebalancing. ${DISCLAIMER}`,
              impactValue: 0.8,
              confidence: 0.95,
              urgency: 0.7,
              source: "opportunity_scanner",
            });
          }
        });
      }
    }

    // ── Scanner 3: Regime Mismatch ──────────────────────────
    if (
      regimeData &&
      regimeData.regime === "RISK-OFF" &&
      portfolio.length > 0
    ) {
      opportunities.push({
        type: "opportunity",
        symbol: "PORTFOLIO",
        title: "Regime Mismatch: Risk-Off Environment",
        description: `Market regime is RISK-OFF (${(regimeData.confidence * 100).toFixed(0)}% confidence). Review exposure to speculative assets. ${DISCLAIMER}`,
        impactValue: 0.9,
        confidence: regimeData.confidence,
        urgency: 0.8,
        source: "opportunity_scanner",
      });
    }

    return opportunities;
  }

  return { scan };
})();

console.log("[Opportunities] Scanner engine loaded.");
