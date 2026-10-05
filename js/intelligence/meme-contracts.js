// ===============================================================
// Canonical Meme Intelligence Contracts
// Contract: meme-contracts-v1
// ===============================================================
// All meme discovery and analysis modules exchange these shapes. The
// identity key is chain + tokenAddress; pools are observations, not tokens.
window.W = window.W || {};

W.memeContracts = (() => {
  const VERSION = "meme-contracts-v1";
  const CHAINS = new Set([
    "bitcoin", "ethereum", "bsc", "solana", "polygon", "arbitrum",
    "optimism", "base", "avalanche", "other", "unknown",
  ]);
  const STATUSES = new Set([
    "ELIGIBLE", "INSUFFICIENT_EVIDENCE", "SECURITY_REJECTED",
  ]);
  const CATEGORIES = new Set([
    "EARLY_HIGH_QUALITY", "MOMENTUM_BUT_SPECULATIVE",
    "WATCH_FOR_CONFIRMATION", "INSUFFICIENT_DATA", "SECURITY_REJECTED",
  ]);
  const TRADE_SIZES = Object.freeze([100, 500, 1000, 5000]);
  const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
  const string = (v, max = 256) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const finite = (v, min = -Infinity, max = Infinity) => Number.isFinite(v) && v >= min && v <= max;
  const clone = (v) => {
    if (!isObject(v)) return {};
    const out = {};
    for (const key of Object.keys(v)) {
      if (!["__proto__", "constructor", "prototype"].includes(key)) out[key] = v[key];
    }
    return out;
  };

  function identityKey(candidate) {
    if (!candidate || !string(candidate.chain) || !string(candidate.tokenAddress)) return null;
    return `${candidate.chain.toLowerCase()}:${candidate.tokenAddress.toLowerCase()}`;
  }

  function normalizeCandidate(input = {}) {
    const source = clone(input);
    const chain = String(source.chain || source.chainId || "unknown").toLowerCase().trim();
    const tokenAddress = String(source.tokenAddress || source.address || source.baseToken?.address || "").trim();
    const candidate = Object.freeze({
      tokenAddress,
      chain: CHAINS.has(chain) ? chain : "unknown",
      symbol: String(source.symbol || source.baseToken?.symbol || "").trim().slice(0, 32),
      name: String(source.name || source.baseToken?.name || source.symbol || "").trim().slice(0, 128),
      pairAddress: source.pairAddress || source.pair?.address || null,
      dex: source.dex || source.dexId || null,
      discoveredAt: Number.isFinite(source.discoveredAt) ? source.discoveredAt : Date.now(),
      source: source.source || source.discoverySource || "unknown",
      sourceConfidence: finite(source.sourceConfidence, 0, 1) ? source.sourceConfidence : null,
    });
    return candidate;
  }

  function validateCandidate(candidate) {
    const errors = [];
    if (!isObject(candidate)) return { ok: false, errors: ["candidate: must be an object"] };
    if (!string(candidate.tokenAddress, 256)) errors.push("candidate.tokenAddress: required");
    if (!string(candidate.chain, 32) || !CHAINS.has(candidate.chain)) errors.push("candidate.chain: unsupported");
    if (!string(candidate.symbol, 32)) errors.push("candidate.symbol: required");
    if (!string(candidate.name, 128)) errors.push("candidate.name: required");
    if (!Number.isFinite(candidate.discoveredAt) || candidate.discoveredAt <= 0) errors.push("candidate.discoveredAt: invalid");
    if (candidate.sourceConfidence !== null && !finite(candidate.sourceConfidence, 0, 1)) errors.push("candidate.sourceConfidence: invalid");
    return { ok: errors.length === 0, errors };
  }

  function normalizeMarket(input = {}) {
    const p = clone(input);
    return Object.freeze({
      observedAt: Number.isFinite(p.observedAt) ? p.observedAt : Date.now(),
      pairCreatedAt: Number.isFinite(p.pairCreatedAt) ? p.pairCreatedAt : null,
      pairAddress: p.pairAddress || null,
      liquidityUsd: Number.isFinite(p.liquidityUsd) ? p.liquidityUsd : Number.isFinite(p.liquidity?.usd) ? p.liquidity.usd : null,
      volume24hUsd: Number.isFinite(p.volume24hUsd) ? p.volume24hUsd : Number.isFinite(p.volume?.h24) ? p.volume.h24 : null,
      priceUsd: Number.isFinite(p.priceUsd) ? p.priceUsd : null,
      priceChange1hPct: Number.isFinite(p.priceChange1hPct) ? p.priceChange1hPct : Number.isFinite(p.priceChange?.h1) ? p.priceChange.h1 : null,
      priceChange6hPct: Number.isFinite(p.priceChange6hPct) ? p.priceChange6hPct : Number.isFinite(p.priceChange?.h6) ? p.priceChange.h6 : null,
      priceChange24hPct: Number.isFinite(p.priceChange24hPct) ? p.priceChange24hPct : Number.isFinite(p.priceChange?.h24) ? p.priceChange.h24 : null,
      buys24h: Number.isFinite(p.buys24h) ? p.buys24h : Number.isFinite(p.txns?.h24?.buys) ? p.txns.h24.buys : null,
      sells24h: Number.isFinite(p.sells24h) ? p.sells24h : Number.isFinite(p.txns?.h24?.sells) ? p.txns.h24.sells : null,
    });
  }

  function validateMarket(market) {
    if (!isObject(market)) return { ok: false, errors: ["market: must be an object"] };
    const errors = [];
    if (!Number.isFinite(market.observedAt) || market.observedAt <= 0) errors.push("market.observedAt: invalid");
    for (const field of ["liquidityUsd", "volume24hUsd", "priceUsd", "priceChange1hPct", "priceChange6hPct", "priceChange24hPct", "buys24h", "sells24h"]) {
      if (market[field] !== null && !Number.isFinite(market[field])) errors.push(`market.${field}: invalid`);
    }
    return { ok: errors.length === 0, errors };
  }

  function normalizeSecurity(input = {}) {
    const value = clone(input);
    return Object.freeze({
      verdict: value.verdict || null,
      honeypot: value.honeypot === true ? true : value.honeypot === false ? false : null,
      canSell: value.canSell === true ? true : value.canSell === false ? false : null,
      mintAuthorityActive: value.mintAuthorityActive === true ? true : value.mintAuthorityActive === false ? false : null,
      freezeAuthorityActive: value.freezeAuthorityActive === true ? true : value.freezeAuthorityActive === false ? false : null,
      ownerCanBlacklist: value.ownerCanBlacklist === true ? true : value.ownerCanBlacklist === false ? false : null,
      liquidityRemovable: value.liquidityRemovable === true ? true : value.liquidityRemovable === false ? false : null,
      liquidityLock: value.liquidityLock || null,
      source: value.source || null,
      observedAt: Number.isFinite(value.observedAt) ? value.observedAt : null,
    });
  }

  function validateSecurity(security) {
    if (!isObject(security)) return { ok: false, errors: ["security: must be an object"] };
    const errors = [];
    for (const field of ["honeypot", "canSell", "mintAuthorityActive", "freezeAuthorityActive", "ownerCanBlacklist", "liquidityRemovable"]) {
      if (security[field] !== null && typeof security[field] !== "boolean") errors.push(`security.${field}: must be boolean or null`);
    }
    return { ok: errors.length === 0, errors };
  }

  function normalizeEvidence(input = {}) {
    const value = clone(input);
    return Object.freeze({
      sourceReliability: finite(value.sourceReliability, 0, 1) ? value.sourceReliability : null,
      dataFreshness: finite(value.dataFreshness, 0, 1) ? value.dataFreshness : null,
      dataCompleteness: finite(value.dataCompleteness, 0, 1) ? value.dataCompleteness : null,
      interpretationConfidence: finite(value.interpretationConfidence, 0, 1) ? value.interpretationConfidence : null,
      corroborationCount: Number.isFinite(value.corroborationCount) ? Math.max(1, Math.floor(value.corroborationCount)) : null,
      items: Array.isArray(value.items) ? value.items : [],
    });
  }

  function normalizeObservation(input = {}) {
    const value = clone(input);
    return Object.freeze({
      top10Pct: finite(value.top10Pct, 0, 100) ? value.top10Pct : null,
      holderCount: finite(value.holderCount, 0) ? value.holderCount : null,
      clusteredSharePct: finite(value.clusteredSharePct, 0, 100) ? value.clusteredSharePct : null,
      netWalletFlowUsd: Number.isFinite(value.netWalletFlowUsd) ? value.netWalletFlowUsd : null,
      observedAt: Number.isFinite(value.observedAt) ? value.observedAt : null,
    });
  }

  function normalizeAssessment(input = {}) {
    const value = clone(input);
    const eligibility = isObject(value.eligibility) ? value.eligibility : {};
    const scores = isObject(value.scores) ? value.scores : {};
    return Object.freeze({
      methodologyVersion: VERSION,
      eligibility: Object.freeze({
        status: STATUSES.has(eligibility.status) ? eligibility.status : "INSUFFICIENT_EVIDENCE",
        vetoes: Array.isArray(eligibility.vetoes) ? eligibility.vetoes.map(String).slice(0, 32) : [],
      }),
      scores: Object.freeze({
        opportunity: finite(scores.opportunity, 0, 100) ? scores.opportunity : null,
        survivability: finite(scores.survivability, 0, 100) ? scores.survivability : null,
        executionRisk: finite(scores.executionRisk, 0, 100) ? scores.executionRisk : null,
      }),
      confidence: finite(value.confidence, 0, 1) ? value.confidence : null,
      category: CATEGORIES.has(value.category) ? value.category : "INSUFFICIENT_DATA",
      breakdown: isObject(value.breakdown) ? value.breakdown : {},
      evidence: Array.isArray(value.evidence) ? value.evidence : [],
      freshness: isObject(value.freshness) ? value.freshness : {},
      reasons: Array.isArray(value.reasons) ? value.reasons.map(String).slice(0, 64) : [],
    });
  }

  return Object.freeze({
    VERSION,
    TRADE_SIZES,
    identityKey,
    normalizeCandidate,
    validateCandidate,
    normalizeMarket,
    validateMarket,
    normalizeSecurity,
    validateSecurity,
    normalizeEvidence,
    normalizeObservation,
    normalizeAssessment,
    isCandidate: (v) => validateCandidate(v).ok,
    isMarket: (v) => validateMarket(v).ok,
  });
})();
