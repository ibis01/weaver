// js/adapters/market-dexscreener.js
//
// STATUS: NOT YET WIRED.
//   - Not listed in concat.js — this file is not in dist/bundle.js.
//   - No caller in js/features/gems.js or elsewhere yet.
//   - Wire when gems.js migrates from W.memeOpportunity.analyze(pair)
//     to the canonical assess({ market, security, holders, ... }) path.
//
// Converts a DexScreener pair response into a MarketSnapshot.
// Returns null (which the engine treats as "unknown") if the input
// is malformed.
window.W = window.W || {};
W.adapters = W.adapters || {};

W.adapters.marketFromDexScreener = function (rawPair) {
  if (!rawPair || typeof rawPair !== "object") return null;

  const num = (v) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // Transaction counts are ints per the contract; coerce defensively.
  const int = (v) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
  };

  return W.memeContracts.parse("MarketSnapshot", {
    observedAt: Date.now(),
    pairAgeMinutes: rawPair.pairCreatedAt
      ? (Date.now() - Number(rawPair.pairCreatedAt)) / 60000
      : null,

    liquidityUsd: num(rawPair.liquidity?.usd),
    liquidityChange1h: num(rawPair.liquidity?.change1h),

    volume5m: num(rawPair.volume?.m5),
    volume1h: num(rawPair.volume?.h1),
    volume6h: num(rawPair.volume?.h6),
    volume24h: num(rawPair.volume?.h24),

    priceChange5m: num(rawPair.priceChange?.m5),
    priceChange1h: num(rawPair.priceChange?.h1),
    priceChange6h: num(rawPair.priceChange?.h6),
    priceChange24h: num(rawPair.priceChange?.h24),

    buys5m: int(rawPair.txns?.m5?.buys),
    sells5m: int(rawPair.txns?.m5?.sells),
    buys1h: int(rawPair.txns?.h1?.buys),
    sells1h: int(rawPair.txns?.h1?.sells),
    buys24h: int(rawPair.txns?.h24?.buys),
    sells24h: int(rawPair.txns?.h24?.sells),

    provenance: {
      source: "dexscreener",
      observedAt: Date.now(),
      fetchedAt: Date.now(),
      methodologyVersion: W.memeContracts.METHODOLOGY_VERSION,
      // DexScreener does not publish a "completeness" measure.
      // The engine can compute one from null counts if needed;
      // fabricating a number here would be worse than null.
      completeness: null,
    },
  });
};
