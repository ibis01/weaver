const { expect } = require("chai");
require("../../js/intelligence/meme-contracts.js");
require("../../js/intelligence/meme-opportunity.js");

describe("Canonical meme contracts", () => {
  it("normalizes and deduplicates identity by chain plus token address", () => {
    const a = W.memeContracts.normalizeCandidate({ chainId: "Solana", address: "TokenABC", symbol: "dog", name: "Dog" });
    const b = W.memeContracts.normalizeCandidate({ chain: "solana", tokenAddress: "tokenabc", symbol: "DOG", name: "Dog" });
    expect(W.memeContracts.identityKey(a)).to.equal("solana:tokenabc");
    expect(W.memeContracts.identityKey(a)).to.equal(W.memeContracts.identityKey(b));
    expect(W.memeContracts.validateCandidate(a).ok).to.equal(true);
  });

  it("uses Weaver's canonical confidence authority and returns null when evidence is incomplete", () => {
    const result = W.memeOpportunity.assess({
      candidate: { chain: "solana", tokenAddress: "abc", symbol: "DOG", name: "Dog", source: "dex_screener" },
      market: { liquidityUsd: 100000, volume24hUsd: 200000, observedAt: Date.now() },
      context: { sourceCount: 1 },
    });
    expect(result.confidence).to.equal(null);
    expect(result.confidencePct).to.equal(null);
  });

  it("models impact and slippage for all required trade sizes", () => {
    const execution = W.memeOpportunity.executionAnalysis(100000);
    expect(execution.trades.map((trade) => trade.inputUsd)).to.deep.equal([100, 500, 1000, 5000]);
    expect(execution.trades[0].estimatedPriceImpactPct).to.be.lessThan(execution.trades[3].estimatedPriceImpactPct);
    expect(execution.trades[3].capacity).to.equal("POOR");
    expect(execution.tradabilityCapacityUsd).to.equal(2500);
  });

  it("keeps security vetoes ahead of opportunity scoring", () => {
    const result = W.memeOpportunity.assess({
      candidate: { chain: "solana", tokenAddress: "abc", symbol: "DOG", name: "Dog", source: "dex_screener" },
      market: { liquidityUsd: 500000, volume24hUsd: 1000000, priceChange24hPct: 80, observedAt: Date.now() },
      security: { honeypot: true },
      context: { sourceCount: 2, interpretationConfidence: 0.9 },
    });
    expect(result.eligibility.status).to.equal("SECURITY_REJECTED");
    expect(result.eligible).to.equal(false);
  });
});
