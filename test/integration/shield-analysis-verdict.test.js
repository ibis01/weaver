const { expect } = require("chai");

require("../../js/intelligence/unified-verdict.js");
require("../../js/features/token-analysis.js");

describe("Gem → Shield → Token Analysis → Unified Verdict", () => {
  it("carries a verified Shield assessment into the Token Analysis verdict", async () => {
    const originalCheck = W.shield.check;
    const originalResolve = W.asset.resolve;
    const originalCoin = W.api.coin;
    const originalTechnical = W.technicalAnalysis;
    const originalEvents = W.events;
    const originalEvidence = W.evidence.build;

    W.shield.check = async () => ({
      riskScore: 12,
      risks: ["Owner not renounced"],
      riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
      scoreVersion: "shield-evm-v1",
      flags: { isHoneypot: false, isMintable: false, isProxy: false },
    });
    W.asset.resolve = async () => ({
      symbol: "TEST",
      coingeckoId: "test-token",
      name: "Test Token",
    });
    W.api.coin = async () => ({
      market_cap_rank: 50,
      market_data: {
        market_cap: { usd: 1000000 },
        total_volume: { usd: 100000 },
        circulating_supply: 800,
        total_supply: 1000,
        ath: { usd: 2 },
        current_price: { usd: 1 },
      },
    });
    W.technicalAnalysis = {
      analyze: async () => ({
        bias: "bullish",
        score: 72,
        confidence: 70,
        current: 1,
        atr: 0.05,
        multiTimeframe: {
          timeframeAlignment: "4/4",
          liquidityZones: [],
        },
      }),
    };
    W.events = { collectEvents: async () => [] };
    W.evidence.build = () => ({ confidence: 0.8, reasoning: [] });

    try {
      const shield = await W.gems.checkShield(
        "0x0000000000000000000000000000000000000001",
        "ethereum",
        { symbol: "TEST" },
      );
      expect(shield.ok).to.equal(true);

      const report = await W.tokenAnalysis.analyze("TEST");
      expect(report.unifiedVerdict).to.exist;
      expect(report.unifiedVerdict.domains.security.status).to.equal(
        "verified",
      );
      expect(report.unifiedVerdict.domains.security.source).to.equal("goplus");
      expect(
        report.unifiedVerdict.provenance.some((p) => p.type === "security"),
      ).to.equal(true);
      expect(report.unifiedVerdict.evidence.status).to.equal("PARTIAL");
      expect(report.unifiedVerdict.scenario.levels).to.equal(null);
    } finally {
      W.shield.check = originalCheck;
      W.asset.resolve = originalResolve;
      W.api.coin = originalCoin;
      W.technicalAnalysis = originalTechnical;
      W.events = originalEvents;
      W.evidence.build = originalEvidence;
    }
  });
});
