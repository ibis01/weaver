// ===============================================================
// js/intelligence/types.js – Canonical Intelligence Contracts
// ===============================================================
//
// These types define the structure of all intelligence data.
// No business logic – only type definitions and validation helpers.
//
// ===============================================================

window.W = window.W || {};
W.intelligence = W.intelligence || {};

/**
 * @typedef {Object} AssetId
 * @property {string} chainId - 'ethereum' | 'solana' | 'bitcoin' | ...
 * @property {string|null} contractAddress - null for native coins
 * @property {string} symbol - display symbol
 * @property {string|null} coingeckoId - primary key for price lookup
 */

/**
 * @typedef {Object} Signal
 * @property {string} id - UUID or hash
 * @property {string} type - 'PRICE_MOVE' | 'REGIME_SHIFT' | 'UNLOCK' | 'OPPORTUNITY' | 'THESIS_DETERIORATION' | 'BEHAVIORAL_PATTERN'
 * @property {string} source - e.g., 'coingecko', 'regime_engine'
 * @property {AssetId} assetId
 * @property {number} timestamp
 * @property {*} rawData - original provider-specific data
 */

/**
 * @typedef {Object} Evidence
 * @property {string} signalId
 * @property {number} sourceReliability - 0–1, static per source
 * @property {number} dataFreshness - 0–1, decays with age
 * @property {number} corroborationCount - number of independent sources confirming
 * @property {number} dataCompleteness - 0–1, full/partial data
 * @property {number} interpretationConfidence - 0–1, model-specific confidence
 * @property {number} confidence - 0–1, computed product of above (with corroboration boost)
 * @property {string[]} reasoning
 */

/**
 * @typedef {Object} PersonalContext
 * @property {AssetId} assetId
 * @property {number} portfolioWeight - 0–1
 * @property {string} watchlistStatus - 'WATCHING' | 'NOT_WATCHING'
 * @property {string} thesisStatus - 'ACTIVE' | 'INVALIDATED' | 'NONE'
 * @property {number} recentDecisions - count in last 7 days
 * @property {string} behavioralRisk - 'PANIC' | 'FOMO' | 'NONE'
 */

/**
 * @typedef {Object} Assessment
 * @property {string} signalId
 * @property {number} relevance - 0–1, from PersonalContext
 * @property {number} impact - 0–1, from Evidence + market cap factor
 * @property {number} urgency - 0–1, time decay or volatility
 * @property {number} confidence - 0–1, from Evidence.confidence
 * @property {string[]} reasoning
 */

/**
 * @typedef {Object} DecisionPriority
 * @property {string} signalId
 * @property {Assessment} assessment
 * @property {number} score - weighted sum
 * @property {string} recommendedAction - 'MONITOR' | 'REVIEW_THESIS' | 'REBALANCE' | 'LOG_DECISION'
 * @property {string} explanation
 */

// ── Source reliability map ────────────────────────────────
W.intelligence.sourceReliability = {
  coingecko: 0.95,
  binance: 0.9,
  regime_engine: 0.8,
  token_unlocks: 0.7,
  dex_screener: 0.6,
  rss_feed: 0.4,
  wallet_sync: 0.85,
  user_input: 0.5,
};

// ── Freshness windows (seconds) ────────────────────────────
W.intelligence.freshnessWindows = {
  PRICE_MOVE: 300, // 5 minutes
  REGIME_SHIFT: 3600, // 1 hour
  UNLOCK: 86400, // 1 day
  OPPORTUNITY: 86400,
  THESIS_DETERIORATION: 3600,
  BEHAVIORAL_PATTERN: 86400,
};

console.log("[Intelligence] Types and constants loaded.");
