const { expect } = require("chai");

describe("Portfolio Module", () => {
  it("should merge duplicate holdings with weighted-average", () => {
    global.W.store.clearAll();
    global.W.portfolio.add({
      symbol: "BTC",
      name: "Bitcoin",
      qty: 1,
      buyPrice: 50000,
    });
    global.W.portfolio.add({
      symbol: "BTC",
      name: "Bitcoin",
      qty: 1,
      buyPrice: 70000,
    });

    const holdings = global.W.portfolio.all();
    expect(holdings.length).to.equal(1);
    expect(holdings[0].qty).to.equal(2);
    expect(holdings[0].buyPrice).to.equal(60000); // (50k + 70k) / 2
  });

  it("should handle zero or negative quantities", () => {
    global.W.store.clearAll();
    const result1 = global.W.portfolio.add({
      symbol: "ETH",
      qty: 0,
      buyPrice: 3000,
    });
    const result2 = global.W.portfolio.add({
      symbol: "ETH",
      qty: -5,
      buyPrice: 3000,
    });

    expect(result1).to.equal(false);
    expect(result2).to.equal(false);
    expect(global.W.portfolio.all().length).to.equal(0);
  });

  it("should handle UNKNOWN cost basis for wallet holdings", () => {
    // This is tested in dashboard.js enrich(), but we can verify the portfolio module doesn't crash
    global.W.store.clearAll();
    global.W.portfolio.add({ symbol: "SOL", qty: 10, buyPrice: 0 });
    const holdings = global.W.portfolio.all();
    expect(holdings[0].buyPrice).to.equal(0);
  });
});
