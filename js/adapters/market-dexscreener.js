
W.adapters = W.adapters || {};

W.adapters.marketFromDexScreener = function (rawPair) {
  if (!rawPair || typeof rawPair !== "object") return null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  return W.memeContracts.parseContract("MarketSnapshot", {
    observedAt: Date.now(),
    pairAgeMinutes: rawPair.pairCreatedAt
      ? (Date.now() - rawPair.pairCreatedAt) / 60000
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

    buys5m: num(rawPair.txns?.m5?.buys),
    sells5m: num(rawPair.txns?.m5?.sells),
    buys1h: num(rawPair.txns?.h1?.buys),
    sells1h: num(rawPair.txns?.h1?.sells),
    buys24h: num(rawPair.txns?.h24?.buys),
    sells24h: num(rawPair.txns?.h24?.sells),

    provenance: {
      source: "dexscreener",
      observedAt: Date.now(),
      fetchedAt: Date.now(),
      methodologyVersion: "meme-contracts-v1",
      completeness: completenessOfPair(rawPair),
    },
  });
};
