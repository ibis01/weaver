// test/unit/portfolio.test.js
const { expect } = require("chai");
require("../../js/features/portfolio.js");
describe("Portfolio Module", () => {
  beforeEach(() => {
    global.W.portfolio.clear();
  });

  // ── Weighted-average on add ─────────────────────────────
  describe("add — weighted-average cost basis", () => {
    it("merges duplicate holdings with weighted average", async () => {
      await global.W.portfolio.add({
        symbol: "BTC",
        name: "Bitcoin",
        qty: 1,
        buyPrice: 50000,
      });
      await global.W.portfolio.add({
        symbol: "BTC",
        name: "Bitcoin",
        qty: 1,
        buyPrice: 70000,
      });

      const h = global.W.portfolio.all();
      expect(h.length).to.equal(1);
      expect(h[0].qty).to.equal(2);
      expect(h[0].buyPrice).to.equal(60000);
      expect(h[0].totalCost).to.equal(120000);
    });

    it("rejects zero quantity", async () => {
      const r = await global.W.portfolio.add({
        symbol: "ETH",
        qty: 0,
        buyPrice: 3000,
      });
      expect(r).to.equal(false);
      expect(global.W.portfolio.all().length).to.equal(0);
    });

    it("rejects negative quantity", async () => {
      const r = await global.W.portfolio.add({
        symbol: "ETH",
        qty: -5,
        buyPrice: 3000,
      });
      expect(r).to.equal(false);
    });

    it("accepts unknown cost basis (buyPrice: 0)", async () => {
      await global.W.portfolio.add({ symbol: "SOL", qty: 10, buyPrice: 0 });
      const h = global.W.portfolio.all();
      expect(h[0].buyPrice).to.equal(0);
      expect(h[0].totalCost).to.equal(0);
    });
  });

  // ── update validation ───────────────────────────────────
  describe("update — validation", () => {
    let id;

    beforeEach(async () => {
      await global.W.portfolio.add({
        symbol: "BTC",
        name: "Bitcoin",
        qty: 1,
        buyPrice: 50000,
      });
      id = global.W.portfolio.all()[0].id;
    });

    it("accepts a valid qty change", () => {
      const ok = global.W.portfolio.update(id, { qty: 2 });
      expect(ok).to.equal(true);
      expect(global.W.portfolio.all()[0].qty).to.equal(2);
    });

    it("accepts a valid buyPrice change", () => {
      const ok = global.W.portfolio.update(id, { buyPrice: 55000 });
      expect(ok).to.equal(true);
      expect(global.W.portfolio.all()[0].buyPrice).to.equal(55000);
    });

    it("rejects qty = 0", () => {
      const ok = global.W.portfolio.update(id, { qty: 0 });
      expect(ok).to.equal(false);
    });

    it("rejects negative qty", () => {
      const ok = global.W.portfolio.update(id, { qty: -1 });
      expect(ok).to.equal(false);
    });

    it("rejects negative buyPrice", () => {
      const ok = global.W.portfolio.update(id, { buyPrice: -100 });
      expect(ok).to.equal(false);
    });

    it("rejects NaN qty", () => {
      const ok = global.W.portfolio.update(id, { qty: "abc" });
      expect(ok).to.equal(false);
    });

    it("returns false for unknown id", () => {
      const ok = global.W.portfolio.update("does-not-exist", { qty: 2 });
      expect(ok).to.equal(false);
    });

    it("does not allow assetId to be overwritten", () => {
      global.W.portfolio.update(id, { assetId: { coingeckoId: "evil" } });
      expect(global.W.portfolio.all()[0].assetId.coingeckoId).to.not.equal(
        "evil",
      );
    });
  });

  // ── sell — the accounting matrix ────────────────────────
  describe("sell — realized P&L and cost basis", () => {
    let id;

    beforeEach(async () => {
      await global.W.portfolio.add({
        symbol: "BTC",
        name: "Bitcoin",
        qty: 2,
        buyPrice: 50000,
      });
      id = global.W.portfolio.all()[0].id;
    });

    it("partial sell reduces qty and preserves average cost", () => {
      const d = global.W.portfolio.sell(id, 1, 60000);
      expect(d).to.not.equal(null);
      expect(d.realizedPnl).to.equal(10000); // (60000 - 50000) * 1

      const h = global.W.portfolio.all()[0];
      expect(h.qty).to.equal(1);
      expect(h.buyPrice).to.equal(50000);
      expect(h.totalCost).to.equal(50000);
      expect(h.realizedPnl).to.equal(10000);
    });

    it("full sell zeroes the position and marks closedAt", () => {
      global.W.portfolio.sell(id, 2, 70000);
      const h = global.W.portfolio.all()[0];
      expect(h.qty).to.equal(0);
      expect(h.totalCost).to.equal(0);
      expect(h.realizedPnl).to.equal(40000);
      expect(h.closedAt).to.be.a("number");
    });

    it("accumulates realized P&L across multiple sells", () => {
      global.W.portfolio.sell(id, 1, 60000); // +10000
      global.W.portfolio.sell(id, 1, 70000); // +20000
      const h = global.W.portfolio.all()[0];
      expect(h.qty).to.equal(0);
      expect(h.realizedPnl).to.equal(30000);
      expect(h.disposals).to.have.length(2);
    });

    it("computes a loss when selling below cost", () => {
      const d = global.W.portfolio.sell(id, 1, 40000);
      expect(d.realizedPnl).to.equal(-10000);
    });

    it("rejects qty > held", () => {
      const d = global.W.portfolio.sell(id, 3, 60000);
      expect(d).to.equal(null);
      expect(global.W.portfolio.all()[0].qty).to.equal(2);
    });

    it("rejects qty = 0", () => {
      expect(global.W.portfolio.sell(id, 0, 60000)).to.equal(null);
    });

    it("rejects negative qty", () => {
      expect(global.W.portfolio.sell(id, -1, 60000)).to.equal(null);
    });

    it("rejects negative price", () => {
      expect(global.W.portfolio.sell(id, 1, -100)).to.equal(null);
    });

    it("rejects NaN price", () => {
      expect(global.W.portfolio.sell(id, 1, "abc")).to.equal(null);
    });

    it("rejects unknown id", () => {
      expect(global.W.portfolio.sell("nope", 1, 60000)).to.equal(null);
    });

    it("records a sell transaction in the log", () => {
      const before = global.W.portfolio.txs().length;
      global.W.portfolio.sell(id, 1, 60000);
      const after = global.W.portfolio.txs();
      expect(after.length).to.equal(before + 1);
      expect(after[after.length - 1].type).to.equal("sell");
      expect(after[after.length - 1].qty).to.equal(1);
      expect(after[after.length - 1].realizedPnl).to.equal(10000);
    });

    it("three buys, one sell — average cost is correct", async () => {
      global.W.portfolio.clear();
      await global.W.portfolio.add({ symbol: "ETH", qty: 1, buyPrice: 100 });
      await global.W.portfolio.add({ symbol: "ETH", qty: 1, buyPrice: 200 });
      await global.W.portfolio.add({ symbol: "ETH", qty: 1, buyPrice: 300 });
      // avg cost = 200, qty = 3, totalCost = 600
      const eid = global.W.portfolio.all()[0].id;
      const d = global.W.portfolio.sell(eid, 1, 250);
      expect(d.realizedPnl).to.equal(50); // (250 - 200) * 1

      const h = global.W.portfolio.all()[0];
      expect(h.qty).to.equal(2);
      expect(h.buyPrice).to.equal(200);
      expect(h.totalCost).to.equal(400);
    });
  });
});
