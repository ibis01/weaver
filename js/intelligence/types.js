// ===============================================================
//              Canonical Intelligence Contracts
// ===============================================================
//
// These types define the structure of all intelligence data.
// Every intelligence module MUST use these contracts.
//
// Confidence is computed, not hardcoded. There is exactly ONE
// confidence function in Weaver: W.intelligence.computeConfidence().
// Every other module (evidence-builder.js, decision-engine.js) must
// delegate to it rather than re-deriving a formula. If a second
// formula ever appears, that is a bug.
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
 * @property {string} id - UUID
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
 * @property {number|null} confidence - 0–1, or null when any factor is unknown
 * @property {boolean} incomplete
 * @property {string[]} reasoning
 */

/**
 * @typedef {Object} PersonalContext
 * @property {AssetId} assetId
 * @property {number} portfolioWeight - 0–1, % of portfolio in this asset
 * @property {string} watchlistStatus - 'WATCHING' | 'NOT_WATCHING'
 * @property {string} thesisStatus - 'ACTIVE' | 'INVALIDATED' | 'NONE'
 * @property {number} recentDecisions - count in last 7 days
 * @property {string} behavioralRisk - 'PANIC' | 'FOMO' | 'NONE'
 * @property {number} portfolioExposure - alias for portfolioWeight (kept for clarity)
 * @property {number} riskLimit - user-defined risk limit (from settings, default 0.5)
 * @property {string} timeHorizon - user's investment horizon: 'short' | 'medium' | 'long'
 * @property {number} thesisHealth - current health score of active thesis (0–100)
 * @property {number} decisionConfidence - user's average confidence in recent decisions (0–1)
 * @property {number} chainExposure - % of portfolio in same chain (0–1)
 * @property {number} sectorExposure - % of portfolio in same sector (0–1)
 */

/**
 * @typedef {Object} Assessment
 * @property {string} signalId
 * @property {number} relevance - 0–1, from PersonalContext
 * @property {number|null} impact - 0–1, or null when confidence is unknown
 * @property {number} urgency - 0–1, time decay or volatility
 * @property {number|null} confidence - 0–1, or null when unknown
 * @property {string[]} reasoning
 */

/**
 * @typedef {Object} DecisionPriority
 * @property {string} signalId
 * @property {Assessment} assessment
 * @property {number|null} score - weighted product, or null when any factor unknown
 * @property {string} eligibility - 'ELIGIBLE' | 'INSUFFICIENT_EVIDENCE'
 * @property {string} recommendedAction
 * @property {string} explanation
 */

// ── Source reliability map ────────────────────────────────
W.intelligence.sourceReliability = {
  coingecko: 0.95,
  binance: 0.9,
  alternative_me: 0.85,
  regime_engine: 0.8,
  token_unlocks: 0.7,
  wallet_sync: 0.85,
  dex_screener: 0.65,
  blockscout: 0.75,
  rss_feed: 0.4,
  user_input: 0.5,
  opportunity_scanner: 0.6,
  thesis_health: 0.7,
  unknown: 0.5,
};

// ── Freshness windows (seconds) ────────────────────────────
W.intelligence.freshnessWindows = {
  PRICE_MOVE: 300,
  REGIME_SHIFT: 3600,
  UNLOCK: 86400,
  OPPORTUNITY: 86400,
  THESIS_DETERIORATION: 3600,
  BEHAVIORAL_PATTERN: 86400,
};

// ── Compute confidence from evidence components ─────────────
//
// This is the single authoritative confidence function. Any module
// that needs a confidence value MUST call this function rather than
// re-deriving a formula.
//
// MISSING-DATA POLICY:
//   Every factor is required. If any of sourceReliability,
//   dataFreshness, dataCompleteness, or interpretationConfidence is
//   missing or non-finite, the function returns `null`.
//
//   `null` means "we do not have enough information to make a
//   numeric claim" — it does NOT mean "zero confidence". Callers
//   must surface that distinction honestly rather than coercing to
//   a number.
//
//   Earlier versions defaulted sourceReliability to 0.5 and
//   dataFreshness to 0.8. Those defaults were the exact
//   synthetic-confidence pattern §2.7 and §2.9 exist to prevent.
//   They have been removed.
//
// CORROBORATION:
//   corroborationCount defaults to 1. A value below 1 is clamped
//   to 1. The boost is capped at 1.5×.
//
function computeConfidence(evidence) {
  if (!evidence || typeof evidence !== "object") return null;

  const {
    sourceReliability,
    dataFreshness,
    corroborationCount = 1,
    dataCompleteness,
    interpretationConfidence,
  } = evidence;

  // Every factor must be present and finite. Missing means we cannot
  // make a numeric confidence claim, and "unknown ≠ zero" applies.
  if (!Number.isFinite(sourceReliability)) return null;
  if (!Number.isFinite(dataFreshness)) return null;
  if (!Number.isFinite(dataCompleteness)) return null;
  if (!Number.isFinite(interpretationConfidence)) return null;

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const sr = clamp(sourceReliability);
  const df = clamp(dataFreshness);
  const cc = Math.max(1, Math.floor(corroborationCount));
  const dc = clamp(dataCompleteness);
  const ic = clamp(interpretationConfidence);

  const corroborationBoost = Math.min(1.5, 1 + (cc - 1) * 0.15);
  let confidence = sr * df * dc * ic * corroborationBoost;
  confidence = clamp(confidence);

  // Floor at 0.05 for cases where all four factors are non-zero but
  // the product rounds to a value indistinguishable from "we didn't
  // measure". This is a display aid, not a claim about precision.
  if (confidence < 0.05 && (sr > 0 || df > 0 || dc > 0 || ic > 0)) {
    confidence = 0.05;
  }

  return confidence;
}

function computeFreshness(timestamp, signalType) {
  const age = Date.now() - timestamp;
  const window = W.intelligence.freshnessWindows[signalType] || 3600;
  const freshness = Math.max(0, 1 - age / (window * 1000));
  return Math.min(1, freshness);
}

function getSourceReliability(source) {
  return (
    W.intelligence.sourceReliability[source] ||
    W.intelligence.sourceReliability.unknown
  );
}

W.intelligence.computeConfidence = computeConfidence;
W.intelligence.computeFreshness = computeFreshness;
W.intelligence.getSourceReliability = getSourceReliability;

console.log("[Intelligence] Confidence model loaded.");
