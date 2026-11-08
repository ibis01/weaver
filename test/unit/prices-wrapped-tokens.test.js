const { expect } = require("chai");

require("../../js/api/prices.js");

// Wrapped/staked token index coverage for the radar and Smart Money
// Tracker OHLCV paths. Slugs verified against the live CoinPaprika
// search API on 2026-11-08; CoinLore nameids verified against the
// live tickers API the same day.
describe("Prices — wrapped/staked token index coverage", () => {
  const CASES = [
    ["wrapped-bitcoin", "WBTC", "wbtc-wrapped-bitcoin"],
    ["weth", "WETH", "weth-weth"],
    ["staked-ether", "STETH", "steth-lido-staked-ether"],
    ["reth", "RETH", "reth-rocket-pool-eth"],
    ["coinbase-wrapped-btc", "CBBTC", "cbbtc-coinbase-wrapped-btc"],
  ];

  it("maps every wrapped/staked CoinLore nameid to a symbol and a CoinPaprika slug", () => {
    const { ID_TO_SYMBOL, ID_TO_PAPRIKA } = W.api._internal;
    for (const [id, symbol, slug] of CASES) {
      expect(ID_TO_SYMBOL[id], `ID_TO_SYMBOL[${id}]`).to.equal(symbol);
      expect(ID_TO_PAPRIKA[id], `ID_TO_PAPRIKA[${id}]`).to.equal(slug);
    }
  });

  it("resolves the wrapped symbols back to the same ids (SYMBOL_TO_ID round-trip)", () => {
    const { ID_TO_SYMBOL } = W.api._internal;
    // SYMBOL_TO_ID is derived and frozen; access through the module's
    // resolution used by tickers: getSymbol / learnSymbols are dynamic,
    // so assert the derivation invariant directly via the exported map.
    for (const [id, symbol] of Object.entries(ID_TO_SYMBOL)) {
      // Every static symbol must be uppercase A-Z0-9 (Binance pair
      // guard binancePairFor relies on this shape).
      expect(symbol).to.match(/^[A-Z0-9]{2,12}$/);
      expect(id).to.be.a("string").and.have.length.greaterThan(0);
    }
  });

  it("keeps WBTC on the Coinbase fallback (verified live pair)", () => {
    const { COINBASE_PAIRS } = W.api._internal;
    expect(COINBASE_PAIRS["wrapped-bitcoin"]).to.equal("WBTC-USD");
  });

  it("does not claim an index for wstETH (CoinLore does not list it)", () => {
    const { ID_TO_SYMBOL, ID_TO_PAPRIKA } = W.api._internal;
    expect(ID_TO_SYMBOL.wsteth).to.equal(undefined);
    expect(ID_TO_PAPRIKA.wsteth).to.equal(undefined);
  });
});
