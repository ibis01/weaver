// ===============================================================
//         Deterministic Financial Math Engine for Weaver
// ===============================================================
//
// Purpose: Provide 100% deterministic, edge-case-safe financial
//          calculations. Never use LLMs for these operations.
//
// Rules:
//   - Never return NaN or Infinity.
//   - Handle missing/null/zero values gracefully.
//   - All arithmetic is strictly deterministic.
//
// ===============================================================

window.W = window.W || {};

W.finance = (() => {
  /**
   * Safely parse a number. Returns 0 if NaN/null/undefined.
   */
  function safeNumber(val) {
    if (val === null || val === undefined || val === "") return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Calculate total value (Amount * Price).
   */
  function calculateValue(amount, price) {
    return safeNumber(amount) * safeNumber(price);
  }

  /**
   * Calculate Profit/Loss (Value - Cost).
   */
  function calculatePL(value, cost) {
    return safeNumber(value) - safeNumber(cost);
  }

  /**
   * Calculate Profit/Loss Percentage.
   * Safely handles division by zero (returns 0 instead of Infinity/NaN).
   */
  function calculatePLPercent(pl, cost) {
    const safeCost = safeNumber(cost);
    if (safeCost === 0) return 0;
    return (safeNumber(pl) / safeCost) * 100;
  }

  /**
   * Calculate portfolio allocation percentage.
   * Safely handles division by zero.
   */
  function calculateAllocation(assetValue, totalValue) {
    const safeTotal = safeNumber(totalValue);
    if (safeTotal === 0) return 0;
    return (safeNumber(assetValue) / safeTotal) * 100;
  }

  /**
   * Calculate total portfolio metrics from an array of holdings.
   * Each holding must have: { amount, price, cost }
   */
  function calculatePortfolioTotals(holdings) {
    if (!Array.isArray(holdings) || holdings.length === 0) {
      return { totalValue: 0, totalCost: 0, totalPL: 0, totalPLPercent: 0 };
    }

    let totalValue = 0;
    let totalCost = 0;

    holdings.forEach((h) => {
      const value = calculateValue(h.amount, h.price);
      const cost = safeNumber(h.cost);
      totalValue += value;
      totalCost += cost;
    });

    const totalPL = calculatePL(totalValue, totalCost);
    const totalPLPercent = calculatePLPercent(totalPL, totalCost);

    return {
      totalValue,
      totalCost,
      totalPL,
      totalPLPercent,
    };
  }

  return {
    safeNumber,
    calculateValue,
    calculatePL,
    calculatePLPercent,
    calculateAllocation,
    calculatePortfolioTotals,
  };
})();

console.log("[Finance] Deterministic math engine loaded.");
