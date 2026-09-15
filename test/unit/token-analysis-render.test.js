const { expect } = require("chai");
require("../../js/features/token-analysis.js");

describe("Token Analysis scenario UI", () => {
  const baseTechnical = (alignment = "4/4", bias = "bullish") => ({
    bias,
    score: bias === "bullish" ? 80 : 20,
    confidence: 75,
    current: 100,
    atr: 2,
    rsi: 55,
    rsiBias: "bullish momentum",
    trend: bias === "bullish" ? "uptrend" : "downtrend",
    ema20: 99,
    ema50: 95,
    macd: bias === "bullish" ? 1 : -1,
    bollingerPosition: 50,
    structure: {
      label: bias === "bullish" ? "Bullish" : "Bearish",
      breakOfStructure: "None",
      choch: {},
    },
    smc: {
      liquidity: "No confirmed liquidity sweep",
      orderBlock: "No high-confidence order block",
      limitation: "Heuristic.",
    },
    relativeVolume: 1.2,
    multiTimeframe: { timeframeAlignment: alignment, liquidityZones: [] },
    support: 94,
    resistance: 108,
    confluence: "4/5 signals agree",
    volatility: 30,
  });

  async function renderWith({ technical, coin }) {
    const saved = {
      asset: W.asset,
      api: W.api,
      events: W.events,
      evidence: W.evidence,
      portfolio: W.portfolio,
      ui: W.ui,
      technicalAnalysis: W.technicalAnalysis,
    };
    W.asset = {
      resolve: async () => ({ symbol: "BTC", coingeckoId: "bitcoin" }),
    };
    W.api = { coin: async () => coin };
    W.events = { collectEvents: async () => [] };
    W.evidence = { build: () => ({ confidence: 0.8, reasoning: [] }) };
    W.portfolio = { all: () => [] };
    W.ui = { spinner: () => "<div>Loading</div>" };
    W.technicalAnalysis = { analyze: async () => technical };
    const view = document.createElement("div");
    await W.tokenAnalysis.render(view, "BTC");
    Object.assign(W, saved);
    return view.textContent;
  }

  it("renders a bullish scenario with partial evidence and limitation disclosure", async () => {
    const text = await renderWith({
      technical: baseTechnical(),
      coin: {
        market_cap_rank: 2,
        market_data: {
          market_cap: { usd: 1000 },
          total_volume: { usd: 100 },
          circulating_supply: 90,
          total_supply: 100,
          ath: { usd: 120 },
          current_price: { usd: 100 },
        },
      },
    });
    expect(text).to.include("Bullish scenario");
    expect(text).to.include("Evidence quality: PARTIAL");
    expect(text).to.include("Limitations:");
  });

  it("renders neutral evidence limitations when data is partial", async () => {
    const text = await renderWith({
      technical: baseTechnical("2/4"),
      coin: null,
    });
    expect(text).to.include("Neutral / insufficient evidence");
    expect(text).to.include("Evidence quality: PARTIAL");
    expect(text).to.include("Limitations:");
  });
});
