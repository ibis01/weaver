// ===============================================================
// js/intelligence/types.js – Canonical Intelligence Contracts
// ===============================================================
//
// These types define the structure of all intelligence data.
// Every intelligence module MUST use these contracts.
//
// Confidence is computed, not hardcoded.
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
 * @property {string} name - human-readable name
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
 * @property {number} score - weighted sum (relevance * impact * urgency * confidence)
 * @property {string} recommendedAction - 'MONITOR' | 'REVIEW_THESIS' | 'REBALANCE' | 'LOG_DECISION'
 * @property {string} explanation
 */

// ── Source reliability map ────────────────────────────────
// These are static, evidence-based values. They represent the
// historical accuracy and trustworthiness of each data source.
W.intelligence.sourceReliability = {
  // High-reliability sources (direct from APIs)
  coingecko: 0.95,
  binance: 0.9,
  alternative_me: 0.85, // Fear & Greed index

  // Medium-reliability sources
  regime_engine: 0.8,
  token_unlocks: 0.7,
  wallet_sync: 0.85,
  dex_screener: 0.65,
  blockscout: 0.75,

  // Low-reliability sources
  rss_feed: 0.4,
  user_input: 0.5,
  opportunity_scanner: 0.6,
  thesis_health: 0.7,

  // Fallback
  unknown: 0.5,
};

// ── Freshness windows (seconds) ────────────────────────────
// After this time, data is considered stale (freshness → 0)
W.intelligence.freshnessWindows = {
  PRICE_MOVE: 300, // 5 minutes
  REGIME_SHIFT: 3600, // 1 hour
  UNLOCK: 86400, // 1 day
  OPPORTUNITY: 86400, // 1 day
  THESIS_DETERIORATION: 3600, // 1 hour
  BEHAVIORAL_PATTERN: 86400, // 1 day
};

// ── Minimum corroboration for confidence boost ─────────────
W.intelligence.corroborationThreshold = 2;

// ── Compute confidence from evidence components ─────────────
function computeConfidence(evidence) {
  const {
    sourceReliability = 0.5,
    dataFreshness = 0.8,
    corroborationCount = 1,
    dataCompleteness = 0.8,
    interpretationConfidence = 0.7,
  } = evidence;

  // Clamp all values to [0, 1]
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const sr = clamp(sourceReliability);
  const df = clamp(dataFreshness);
  const cc = Math.max(1, Math.floor(corroborationCount));
  const dc = clamp(dataCompleteness);
  const ic = clamp(interpretationConfidence);

  // Corroboration boost: 1.0 for single source, up to 1.5 for 3+ sources
  const corroborationBoost = Math.min(1.5, 1 + (cc - 1) * 0.15);

  // Combined confidence: product of all components with corroboration boost
  let confidence = sr * df * dc * ic * corroborationBoost;

  // Clamp final confidence to [0, 1]
  confidence = clamp(confidence);

  // If confidence is extremely low, floor at 0.05 to avoid zero
  if (confidence < 0.05 && (sr > 0 || df > 0 || dc > 0 || ic > 0)) {
    confidence = 0.05;
  }

  return confidence;
}

// ── Helper: compute freshness from timestamp and type ──────
function computeFreshness(timestamp, signalType) {
  const age = Date.now() - timestamp;
  const window = W.intelligence.freshnessWindows[signalType] || 3600;
  const freshness = Math.max(0, 1 - age / (window * 1000));
  return Math.min(1, freshness);
}

// ── Helper: get source reliability ──────────────────────────
function getSourceReliability(source) {
  return (
    W.intelligence.sourceReliability[source] ||
    W.intelligence.sourceReliability.unknown
  );
}

// ── Export helpers ──────────────────────────────────────────
W.intelligence.computeConfidence = computeConfidence;
W.intelligence.computeFreshness = computeFreshness;
W.intelligence.getSourceReliability = getSourceReliability;

console.log("[Intelligence] Confidence model loaded.");
