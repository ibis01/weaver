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
   *
   * FIXED: Added proper validation and error handling.
   */
  function calculatePortfolioTotals(holdings) {
    // Validate input
    if (!Array.isArray(holdings)) {
      console.warn(
        "[Finance] calculatePortfolioTotals: holdings is not an array",
      );
      return { totalValue: 0, totalCost: 0, totalPL: 0, totalPLPercent: 0 };
    }

    if (holdings.length === 0) {
      return { totalValue: 0, totalCost: 0, totalPL: 0, totalPLPercent: 0 };
    }

    let totalValue = 0;
    let totalCost = 0;
    let invalidCount = 0;

    holdings.forEach((h, index) => {
      // Skip invalid holdings
      if (!h || typeof h !== "object") {
        invalidCount++;
        return;
      }

      const amount = safeNumber(h.amount);
      const price = safeNumber(h.price);
      const cost = safeNumber(h.cost);

      // Validate: cost should be >= 0
      if (cost < 0) {
        console.warn(
          `[Finance] Negative cost for ${h.symbol || "holding #" + index}, using 0`,
        );
        // Use amount * price as fallback cost
        const fallbackCost = amount * price;
        totalValue += amount * price;
        totalCost += fallbackCost;
        return;
      }

      // Validate: amount should be >= 0
      if (amount < 0) {
        console.warn(
          `[Finance] Negative amount for ${h.symbol || "holding #" + index}, using 0`,
        );
        return;
      }

      // Validate: price should be >= 0
      if (price < 0) {
        console.warn(
          `[Finance] Negative price for ${h.symbol || "holding #" + index}, using 0`,
        );
        return;
      }

      totalValue += amount * price;
      totalCost += cost;
    });

    if (invalidCount > 0) {
      console.warn(`[Finance] Skipped ${invalidCount} invalid holdings`);
    }

    const totalPL = calculatePL(totalValue, totalCost);
    const totalPLPercent = calculatePLPercent(totalPL, totalCost);

    return {
      totalValue: Math.round(totalValue * 100) / 100, // Round to 2 decimals
      totalCost: Math.round(totalCost * 100) / 100,
      totalPL: Math.round(totalPL * 100) / 100,
      totalPLPercent: Math.round(totalPLPercent * 100) / 100,
    };
  }

  /**
   * Calculate weighted average price for an asset.
   * Useful for cost basis tracking with multiple buys.
   */
  function calculateWeightedAverage(holdings, symbol) {
    const filtered = holdings.filter(
      (h) => h.symbol?.toUpperCase() === symbol?.toUpperCase(),
    );
    if (!filtered.length) return 0;

    let totalCost = 0;
    let totalAmount = 0;

    filtered.forEach((h) => {
      const amount = safeNumber(h.amount);
      const cost = safeNumber(h.cost);
      totalCost += cost;
      totalAmount += amount;
    });

    if (totalAmount === 0) return 0;
    return totalCost / totalAmount;
  }

  /**
   * Calculate the Sharpe-like ratio for a portfolio.
   * Simplified: (Return - Risk-Free) / Volatility
   */
  function calculateRiskAdjustedReturn(returns, riskFreeRate = 0.02) {
    if (!Array.isArray(returns) || returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) /
      returns.length;
    const volatility = Math.sqrt(variance);

    if (volatility === 0) return 0;
    return (avgReturn - riskFreeRate) / volatility;
  }

  return {
    safeNumber,
    calculateValue,
    calculatePL,
    calculatePLPercent,
    calculateAllocation,
    calculatePortfolioTotals,
    calculateWeightedAverage,
    calculateRiskAdjustedReturn,
  };
})();

console.log("[Finance] Deterministic math engine loaded.");
