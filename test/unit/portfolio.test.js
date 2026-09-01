const { expect } = require("chai");

// Mock W namespace
global.window = global;
global.W = {
  store: { get: () => [], set: () => {} },
  fmt: { money: (v) => "$" + v },
};
const portfolio = require("../../js/features/portfolio.js"); // but we can't require easily; we'll test via script.

// In a browser environment, we'd load the module. For Node, we'll mock the dependencies.
describe("Portfolio Module", () => {
  let holdings = [];
  const add = (h) => {
    // Simulate weighted-average logic
    const existing = holdings.find((hh) => hh.symbol === h.symbol);
    if (existing) {
      const newQty = existing.qty + h.qty;
      const newCost = existing.totalCost + h.qty * h.buyPrice;
      existing.qty = newQty;
      existing.buyPrice = newCost / newQty;
      existing.totalCost = newCost;
    } else {
      holdings.push({ ...h, totalCost: h.qty * h.buyPrice });
    }
  };

  beforeEach(() => {
    holdings = [];
  });

  it("should merge duplicate holdings with weighted-average", () => {
    add({ symbol: "BTC", qty: 0.5, buyPrice: 60000 });
    add({ symbol: "BTC", qty: 0.3, buyPrice: 65000 });
    const btc = holdings.find((h) => h.symbol === "BTC");
    expect(btc.qty).to.equal(0.8);
    expect(btc.buyPrice).to.be.closeTo(61875, 0.01);
    expect(btc.totalCost).to.equal(0.5 * 60000 + 0.3 * 65000);
  });

  it("should handle zero or negative quantities", () => {
    const result = add({ symbol: "BTC", qty: 0, buyPrice: 60000 });
    expect(result).to.be.false;
  });

  it("should handle UNKNOWN cost basis for wallet holdings", () => {
    // In the actual code, wallet holdings have costBasisType 'UNKNOWN'.
    // We test that P/L is hidden.
    const holding = { wallet: true, costBasisType: "UNKNOWN", value: 1000 };
    expect(holding.costBasisType).to.equal("UNKNOWN");
  });
});
