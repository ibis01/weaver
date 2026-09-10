// test/portfolio.test.js
const assert = require("assert");

// Mock W.store for testing
global.W = {
  store: {
    data: {},
    get: (k, d) => global.W.store.data[k] ?? d,
    set: (k, v) => {
      global.W.store.data[k] = v;
    },
  },
};

// Require the module (adjust path if necessary)
require("../js/features/portfolio.js");

describe("Portfolio Cost Basis Logic", () => {
  beforeEach(() => {
    W.store.data = {}; // Clear before each test
  });

  it("should create a new holding with correct totalCost", () => {
    W.portfolio.add({
      symbol: "BTC",
      name: "Bitcoin",
      qty: 1,
      buyPrice: 50000,
    });
    const holdings = W.portfolio.all();
    assert.strictEqual(holdings.length, 1);
    assert.strictEqual(holdings[0].qty, 1);
    assert.strictEqual(holdings[0].buyPrice, 50000);
    assert.strictEqual(holdings[0].totalCost, 50000);
  });

  it("should calculate weighted-average cost basis on merge", () => {
    W.portfolio.add({
      symbol: "BTC",
      name: "Bitcoin",
      qty: 1,
      buyPrice: 40000,
    });
    W.portfolio.add({
      symbol: "BTC",
      name: "Bitcoin",
      qty: 1,
      buyPrice: 60000,
    });

    const holdings = W.portfolio.all();
    assert.strictEqual(holdings.length, 1);
    assert.strictEqual(holdings[0].qty, 2);
    assert.strictEqual(holdings[0].buyPrice, 50000); // (40k + 60k) / 2
    assert.strictEqual(holdings[0].totalCost, 100000);
  });

  it("should handle zero quantity gracefully without NaN", () => {
    const result = W.portfolio.add({ symbol: "ETH", qty: 0, buyPrice: 3000 });
    assert.strictEqual(result, false); // Should reject invalid qty
    assert.strictEqual(W.portfolio.all().length, 0);
  });

  it("should handle negative price gracefully", () => {
    const result = W.portfolio.add({ symbol: "SOL", qty: 10, buyPrice: -50 });
    assert.strictEqual(result, false);
  });
});
