const fs = require("fs");
const vm = require("vm");
const ctx = { window: {}, console };
ctx.window.W = {
  asset: { resolve: async () => ({ symbol: "BTC", coingeckoId: "bitcoin" }) },
  technicalAnalysis: { analyze: async () => ({ bias: "bullish", score: 80, confidence: 80, multiTimeframe: { timeframeAlignment: "4/4", liquidityZones: [] }, rsi: 58, trend: "uptrend", structure: { label: "Bullish" }, smc: { liquidity: "No sweep" } }) },
  api: { coin: async () => ({ market_cap_rank: 2, market_data: { market_cap: { usd: 1000000000 }, total_volume: { usd: 100000000 }, circulating_supply: 90, total_supply: 100, ath: { usd: 100 }, current_price: { usd: 80 } } }) },
  events: { collectEvents: async () => [] },
  portfolio: null,
};
ctx.W = ctx.window.W;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/features/token-analysis.js", "utf8"), ctx);
ctx.W.tokenAnalysis.analyze("BTC").then((result) => {
  console.log({ action: result.action, actionConfidence: result.actionConfidence, fundamentalBias: result.fundamentals.bias, fundamentalScore: result.fundamentals.score });
  if (result.action !== "BUY" || !result.fundamentals || result.fundamentals.score < 60) process.exit(1);
});
