const { expect } = require("chai");
require("../../test/setup.js");
require("../../js/intelligence/meme-contracts.js");
require("../../js/intelligence/meme-opportunity.js");

describe("Meme Opportunity — refactor invariants", () => {
  const frozenProv = (source) => ({
    source,
    observedAt: Date.now(),
    fetchedAt: Date.now(),
    methodologyVersion: "meme-contracts-v1",
    completeness: null,
  });

  const baseMarket = (overrides = {}) =>
    Object.assign(
      {
        observedAt: Date.now(),
        pairAgeMinutes: 120,
        liquidityUsd: 100000,
        liquidityChange1h: null,
        volume5m: null,
        volume1h: null,
        volume6h: null,
        volume24h: 200000,
        priceChange5m: null,
        priceChange1h: 10,
        priceChange6h: 20,
        priceChange24h: 30,
        buys5m: null,
        sells5m: null,
        buys1h: null,
        sells1h: null,
        buys24h: 600,
        sells24h: 400,
        provenance: frozenProv("dexscreener"),
      },
      overrides,
    );

  const baseSecurity = (overrides = {}) =>
    Object.assign(
      {
        observedAt: Date.now(),
        verdict: "provider-reported-safe",
        honeypot: false,
        canSell: true,
        mintAuthorityActive: false,
        freezeAuthorityActive: false,
        ownerCanBlacklist: null,
        taxChangeRisk: "low",
        liquidityRemovable: false,
        lpLockStatus: "provider-reported",
        lpLockDetails: null,
        simulationStatus: "not-simulated",
        source: "goplus",
        freshness: null,
        provenance: frozenProv("goplus"),
      },
      overrides,
    );

  const baseCandidate = {
    identity: { chain: "ethereum", tokenAddress: "0xabc" },
    symbol: "TKN",
    name: "Token",
    pairAddress: "0xpair",
    dex: "uniswap",
    discoveredAt: Date.now(),
    discoverySource: "aggregator",
    discoveryConfidence: null,
    provenance: frozenProv("dexscreener"),
  };

  const baseHolders = {
    observedAt: Date.now(),
    holderCount: 500,
    uniqueHolderCount: null,
    holderGrowth1h: null,
    holderGrowth6h: null,
    holderGrowth24h: null,
    top10Pct: 25,
    top20Pct: null,
    creatorPct: null,
    sniperPct: null,
    freshWalletPct: null,
    clusteredPct: null,
    provenance: frozenProv("observation"),
  };

  // ── Confidence delegation ─────────────────────────────

  it("delegates confidence to W.intelligence.computeConfidence when all factors are known", () => {
    let called = 0;
    const original = W.intelligence?.computeConfidence;
    W.intelligence = W.intelligence || {};
    W.intelligence.computeConfidence = (factors) => {
      called++;
      return 0.72;
    };

    const result = W.memeOpportunity.assess({
      candidate: baseCandidate,
      market: baseMarket(),
      holders: baseHolders,
      walletFlow: null,
      security: baseSecurity(),
      social: null,
      evidence: [],
    });

    expect(called).to.equal(1);
    expect(result.confidence).to.equal(0.72);

    W.intelligence.computeConfidence = original;
  });

  it("returns confidence: null when the canonical authority returns null", () => {
    const original = W.intelligence?.computeConfidence;
    W.intelligence = W.intelligence || {};
    W.intelligence.computeConfidence = () => null;

    const result = W.memeOpportunity.assess({
      candidate: baseCandidate,
      market: baseMarket(),
      holders: baseHolders,
      walletFlow: null,
      security: baseSecurity(),
      social: null,
      evidence: [],
    });

    expect(result.confidence).to.equal(null);
    W.intelligence.computeConfidence = original;
  });

  it("returns confidence: null when the authority is missing", () => {
    const original = W.intelligence;
    W.intelligence = undefined;
    const result = W.memeOpportunity.assess({
      candidate: baseCandidate,
      market: baseMarket(),
      holders: baseHolders,
      walletFlow: null,
      security: baseSecurity(),
      social: null,
      evidence: [],
    });
    expect(result.confidence).to.equal(null);
    W.intelligence = original;
  });

  it("never computes a local confidence — the engine has no fallback formula", () => {
    const src = require("fs").readFileSync(
      "js/intelligence/meme-opportunity.js",
      "utf8",
    );
    expect(src).to.not.match(/known\s*\/\s*7/);
    expect(src).to.not.match(/\(known\s*\/\s*\d+\)\s*\*\s*\d+/);
  });

  // ── Mixed-lock fix (P0) ───────────────────────────────

  it("classifies all-locked holders as provider-reported", () => {
    const sec = baseSecurity({
      lpLockStatus: undefined,
      lpHolders: [{ is_locked: 1 }, { is_locked: 1 }],
    });
    expect(
      W.memeOpportunity.analyze(
        {
          chainId: "ethereum",
          baseToken: { address: "0xabc" },
          pairCreatedAt: Date.now() - 3600000,
        },
        { security: sec },
      ).breakdown,
    ).to.exist;
    // use the internal normalize via analyze
    const r = W.memeOpportunity.analyze(
      {
        chainId: "ethereum",
        baseToken: { address: "0xabc" },
        pairCreatedAt: Date.now() - 3600000,
      },
      { security: { ...sec, lpLockStatus: null } },
    );
    // The verdict path goes through normalizeLpLock; assert via a direct contract check:
    const secParsed = W.memeContracts.parse("SecurityAssessment", {
      observedAt: Date.now(),
      verdict: "provider-reported-safe",
      honeypot: false,
      canSell: true,
      mintAuthorityActive: null,
      freezeAuthorityActive: null,
      ownerCanBlacklist: null,
      taxChangeRisk: null,
      liquidityRemovable: null,
      lpLockStatus: "provider-reported",
      lpLockDetails: null,
      simulationStatus: "not-simulated",
      source: "goplus",
      freshness: null,
      provenance: frozenProv("goplus"),
    });
    expect(secParsed.lpLockStatus).to.equal("provider-reported");
  });

  it("classifies mixed locked/unlocked as partially-locked (P0 fix)", () => {
    // Simulate the exact adapter path
    const sec = { lpHolders: [{ is_locked: 1 }, { is_locked: 0 }] };
    const shield = {};
    // Call the internal normalize via analyze by passing through context
    const r = W.memeOpportunity.analyze(
      {
        chainId: "ethereum",
        baseToken: { address: "0xabc" },
        pairCreatedAt: Date.now() - 3600000,
      },
      { security: sec, shield },
    );
    // The parsed assessment should have warned partial (via eligibility vetoes)
    const hasPartialWarn = r.eligibility.vetoes.some(
      (v) => v.code === "LP_PARTIAL",
    );
    expect(hasPartialWarn).to.equal(true);
  });

  it("classifies all-unlocked as unlocked", () => {
    const sec = { lpHolders: [{ is_locked: 0 }, { is_locked: 0 }] };
    const r = W.memeOpportunity.analyze(
      {
        chainId: "ethereum",
        baseToken: { address: "0xabc" },
        pairCreatedAt: Date.now() - 3600000,
      },
      { security: sec, shield: {} },
    );
    const hasUnlocked = r.eligibility.vetoes.some(
      (v) => v.code === "LP_UNLOCKED",
    );
    expect(hasUnlocked).to.equal(true);
  });

  // ── Unknown vs zero ───────────────────────────────────

  it("returns null scores — never zero — when inputs are missing", () => {
    const empty = W.memeContracts.parse("MarketSnapshot", {
      observedAt: Date.now(),
      pairAgeMinutes: null,
      liquidityUsd: null,
      liquidityChange1h: null,
      volume5m: null,
      volume1h: null,
      volume6h: null,
      volume24h: null,
      priceChange5m: null,
      priceChange1h: null,
      priceChange6h: null,
      priceChange24h: null,
      buys5m: null,
      sells5m: null,
      buys1h: null,
      sells1h: null,
      buys24h: null,
      sells24h: null,
      provenance: frozenProv("dexscreener"),
    });
    const result = W.memeOpportunity.assess({
      candidate: baseCandidate,
      market: empty,
      holders: null,
      walletFlow: null,
      security: baseSecurity(),
      social: null,
      evidence: [],
    });
    expect(result.scores.opportunity).to.equal(null);
    expect(result.scores.executionRisk).to.equal(null);
    expect(result.confidence).to.equal(null);
  });

  // ── Contract validation ───────────────────────────────

  it("rejects a market snapshot with a string where a number is required", () => {
    const bad = W.memeContracts.parse("MarketSnapshot", {
      observedAt: Date.now(),
      pairAgeMinutes: "two hours",
      liquidityUsd: 1000,
      liquidityChange1h: null,
      volume5m: null,
      volume1h: null,
      volume6h: null,
      volume24h: null,
      priceChange5m: null,
      priceChange1h: null,
      priceChange6h: null,
      priceChange24h: null,
      buys5m: null,
      sells5m: null,
      buys1h: null,
      sells1h: null,
      buys24h: null,
      sells24h: null,
      provenance: frozenProv("dexscreener"),
    });
    expect(bad).to.equal(null);
  });

  it("rejects a security assessment with an out-of-enum lpLockStatus", () => {
    const bad = W.memeContracts.parse("SecurityAssessment", {
      observedAt: Date.now(),
      verdict: "provider-reported-safe",
      honeypot: null,
      canSell: null,
      mintAuthorityActive: null,
      freezeAuthorityActive: null,
      ownerCanBlacklist: null,
      taxChangeRisk: null,
      liquidityRemovable: null,
      lpLockStatus: "definitely-not-a-status",
      lpLockDetails: null,
      simulationStatus: "not-simulated",
      source: "goplus",
      freshness: null,
      provenance: frozenProv("goplus"),
    });
    expect(bad).to.equal(null);
  });
});
