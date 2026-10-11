const { expect } = require("chai");
const v2 = require("../../scripts/pattern-check-v2.js");
const stage2 = require("../../scripts/pattern-check-stage2.js");

describe("JavaScript wallet-pattern validation", () => {
  it("preserves exact token-unit precision with BigInt formatting", () => {
    expect(v2.formatUnits("459999999999999999999", 18)).to.equal("459.999999999999999999");
  });

  it("fails closed when a pagination page is unavailable", async () => {
    const responses = [{ items: [{ id: 1 }], next_page_params: { page: 2 } }, null];
    const result = await v2.pagesOf("https://example.test/items?token=0xabc", { fetcher: async () => responses.shift(), sleepFn: async () => {} });
    expect(result.complete).to.equal(false);
    expect(result.failedPages).to.deep.equal([2]);
    expect(result.items).to.have.length(1);
  });

  it("preserves the token filter when following pagination", async () => {
    const urls = [];
    const responses = [{ items: [], next_page_params: { page: "2 3" } }, { items: [], next_page_params: null }];
    await v2.pagesOf("https://example.test/items?token=0xabc", { fetcher: async (url) => { urls.push(url); return responses.shift(); }, sleepFn: async () => {} });
    expect(urls[1]).to.include("token=0xabc");
    expect(urls[1]).to.include("page=2+3");
  });

  it("requires sender, successful status, quote, router, and swap evidence", async () => {
    const router = Object.keys(v2.ROUTERS)[0];
    const quote = Object.keys(v2.QUOTES).find((address) => v2.QUOTES[address].symbol === "USDC");
    const responses = {
      [`${"https://eth.blockscout.com/api/v2"}/transactions/0xtx`]: { from: { hash: "0xwallet" }, to: { hash: router }, status: "ok" },
      [`${"https://eth.blockscout.com/api/v2"}/transactions/0xtx/token-transfers`]: { items: [
        { from: { hash: "0xpool" }, to: { hash: "0xwallet" }, token: { address: "0xtarget" }, total: { value: "1000000000000000000", decimals: 18 } },
        { from: { hash: "0xwallet" }, to: { hash: "0xpool" }, token: { address: quote }, total: { value: "10000000", decimals: 6 } },
      ] },
      [`${"https://eth.blockscout.com/api/v2"}/transactions/0xtx/logs`]: { items: [{ decoded: { name: "Swap" } }] },
    };
    const result = await v2.classifyTx("0xtx", "0xwallet", "0xtarget", async (url) => responses[url]);
    expect(result.classification).to.equal("CONFIRMED_DEX_BUY");
    expect(result.detail.transactionSucceeded).to.equal(true);
    expect(result.detail.tokenAmount).to.equal("1");
  });

  it("rejects reverted and non-originator transactions", async () => {
    const router = Object.keys(v2.ROUTERS)[0];
    const reverted = await v2.classifyTx("0xreverted", "0xwallet", "0xtarget", async (url) => url.endsWith("0xreverted") ? { from: { hash: "0xwallet" }, to: { hash: router }, status: "error" } : { items: [] });
    expect(reverted.classification).to.equal("UNCLASSIFIED");
    const nonSender = await v2.classifyTx("0xother", "0xwallet", "0xtarget", async () => ({ from: { hash: "0xother" }, to: { hash: router }, status: "ok" }));
    expect(nonSender.classification).to.equal("UNCLASSIFIED");
  });

  it("rejects PEPE and overlapping controls for Stage 2 inputs", () => {
    expect(stage2.validateTokens([{ symbol: "PEPE", address: v2.PEPE, windowStart: "2026-01-01", windowEnd: "2026-01-02", pumpDay: "2026-01-02" }])).to.not.deep.equal([]);
    const comparison = stage2.compareGroups([
      { group: "gold", status: "COMPLETE", blockRangeExact: true, confirmedBuy: true, probableBuy: true },
      { group: "control", status: "COMPLETE", blockRangeExact: true, confirmedBuy: false, probableBuy: false },
    ]);
    expect(comparison.confirmedRateDeltaGoldMinusControl).to.equal(1);
  });
});
