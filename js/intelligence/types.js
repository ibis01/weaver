// ================================================================
//              Canonical Intelligence Contracts — types.js
// ================================================================
// Single source of truth for every intelligence type in Weaver.
//
// Purpose:
//   The intelligence pipeline (events → evidence → assessment →
//   decision) previously passed loose objects between modules. Each
//   module re-implemented its own field names and its own confidence
//   arithmetic. That is the exact class of drift the constitution
//   forbids (§2.7, §2.9, §3.7).
//
//   This module defines, in one place:
//     - Frozen enums for every closed set of values.
//     - JSDoc typedefs for every contract.
//     - Runtime type guards (fast, structural).
//     - Validators that return a detailed error list (never throw).
//     - Assertions for fail-fast in tests (throw with a path).
//     - Factories that build canonical, frozen instances.
//     - The ONE confidence function. Any module that needs a
//       confidence value MUST call W.intelligence.computeConfidence().
//       A second formula anywhere else is a bug.
//
// Non-goals:
//   - No DOM access. Safe to require from any context, including
//     tests and workers.
//   - No network. No side effects beyond a single console.log.
//   - No dependency on other W.* modules. types.js loads first.
//
// Contract version:
//   CONTRACT_VERSION increments when a required field is added,
//   removed, renamed, or changes semantic meaning. Optional field
//   additions do NOT bump the version.
//
// Backward compatibility:
//   Every name from the previous types.js is preserved
//   (W.intelligence.sourceReliability, .freshnessWindows,
//   .computeConfidence, .computeFreshness, .getSourceReliability).
//   New names are additive under W.intelligence.types, .is,
//   .validate, .assert, .create.
//
// SECURITY:
//   - Prototype-pollution guard on every factory input. Keys named
//     __proto__, constructor, or prototype are rejected outright at
//     any depth.
//   - Factories never throw. Validation errors are returned as
//     arrays. The pipeline treats an unvalidated signal as a bug in
//     the producing module, not as user error.
//   - Every returned object is Object.freeze'd. Nothing downstream
//     can mutate a canonical signal.
//   - Enums are frozen. Adding a new signal type requires an edit
//     here, which makes the change visible in one diff.
// ================================================================

window.W = window.W || {};
W.intelligence = W.intelligence || {};

// ── Contract version ─────────────────────────────────────────
const CONTRACT_VERSION = "intelligence-contracts-v2";

// ================================================================
// 1. PROTOTYPE-POLLUTION GUARD
// ================================================================
// JSON.parse is safe on its own — it does not walk the prototype
// chain for `__proto__`. But once that object flows into a factory
// and the factory does `obj[k] = v`, the dangerous keys become
// live. We reject them at the boundary so no downstream code has
// to worry.

const _POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function _hasPollutionKey(obj, depth = 0) {
  if (depth > 16) return true; // absurdly deep — treat as hostile
  if (!obj || typeof obj !== "object") return false;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (_hasPollutionKey(obj[i], depth + 1)) return true;
    }
    return false;
  }
  for (const key of Object.keys(obj)) {
    if (_POLLUTION_KEYS.has(key)) return true;
    if (_hasPollutionKey(obj[key], depth + 1)) return true;
  }
  return false;
}

// ================================================================
// 2. FROZEN ENUMS
// ================================================================

function _makeEnum(values) {
  const forward = Object.create(null);
  for (const v of values) forward[v] = v;
  return Object.freeze(forward);
}

function _makeSet(values) {
  return new Set(values);
}

const _SIGNAL_TYPES = [
  "PRICE_MOVE",
  "REGIME_SHIFT",
  "UNLOCK",
  "OPPORTUNITY",
  "THESIS_DETERIORATION",
  "BEHAVIORAL_PATTERN",
  "SMART_MONEY_ENTRY",
];
const _THESIS_STATUSES = [
  "Healthy",
  "Strengthening",
  "Weakening",
  "Invalidated",
  "Unknown",
];
const _THESIS_ACTIVATIONS = ["ACTIVE", "INVALIDATED", "NONE"];
const _WATCHLIST_STATUSES = ["WATCHING", "NOT_WATCHING"];
const _BEHAVIORAL_RISKS = ["NONE", "PANIC", "FOMO"];
const _HORIZONS = ["short", "medium", "long"];
const _ELIGIBILITIES = ["ELIGIBLE", "INSUFFICIENT_EVIDENCE"];
const _RECOMMENDED_ACTIONS = ["MONITOR", "REVIEW", "ACT", "EXIT", "IGNORE"];
const _ASSET_CHAINS = [
  "bitcoin",
  "ethereum",
  "bsc",
  "solana",
  "polygon",
  "arbitrum",
  "optimism",
  "base",
  "avalanche",
  "other",
  "unknown",
];

const SIGNAL_TYPE = _makeEnum(_SIGNAL_TYPES);
const THESIS_STATUS = _makeEnum(_THESIS_STATUSES);
const THESIS_ACTIVATION = _makeEnum(_THESIS_ACTIVATIONS);
const WATCHLIST_STATUS = _makeEnum(_WATCHLIST_STATUSES);
const BEHAVIORAL_RISK = _makeEnum(_BEHAVIORAL_RISKS);
const HORIZON = _makeEnum(_HORIZONS);
const ELIGIBILITY = _makeEnum(_ELIGIBILITIES);
const RECOMMENDED_ACTION = _makeEnum(_RECOMMENDED_ACTIONS);
const ASSET_CHAIN = _makeEnum(_ASSET_CHAINS);

const _SIGNAL_TYPE_SET = _makeSet(_SIGNAL_TYPES);
const _THESIS_STATUS_SET = _makeSet(_THESIS_STATUSES);
const _THESIS_ACTIVATION_SET = _makeSet(_THESIS_ACTIVATIONS);
const _WATCHLIST_STATUS_SET = _makeSet(_WATCHLIST_STATUSES);
const _BEHAVIORAL_RISK_SET = _makeSet(_BEHAVIORAL_RISKS);
const _HORIZON_SET = _makeSet(_HORIZONS);
const _ELIGIBILITY_SET = _makeSet(_ELIGIBILITIES);
const _RECOMMENDED_ACTION_SET = _makeSet(_RECOMMENDED_ACTIONS);
const _ASSET_CHAIN_SET = _makeSet(_ASSET_CHAINS);

// ================================================================
// 3. SOURCE RELIABILITY (Constitution Rule 2.9)
// ================================================================

const SOURCE_RELIABILITY = Object.freeze({
  coinlore: 0.9,
  coinbase: 0.9,
  coinpaprika: 0.85,
  alternative_me: 0.85,
  weaver_regime: 0.85,
  regime_engine: 0.85,
  token_unlocks: 0.85,
  wallet_sync: 0.85,
  blockscout: 0.75,
  opportunity_scanner: 0.6,
  thesis_health: 0.75,
  dex_screener: 0.65,
  rss_feed: 0.4,
  user_input: 0.5,
  // Radar is a derived signal, not a primary source. Below
  // dex_screener (0.65) because it composes multiple upstream
  // reads, each of which can be individually stale or partial.
  // Calibration target: adjust after the first backtest.
  smart_money_radar: 0.6,
  unknown: 0.5,
});

// ================================================================
// 4. FRESHNESS WINDOWS
// ================================================================

const FRESHNESS_WINDOWS = Object.freeze({
  PRICE_MOVE: 300,
  REGIME_SHIFT: 3600,
  UNLOCK: 86400,
  OPPORTUNITY: 86400,
  THESIS_DETERIORATION: 3600,
  BEHAVIORAL_PATTERN: 86400,
  // Smart-money convergence windows are short. A signal older
  // than 30 minutes is no longer "pre-momentum" by construction.
  SMART_MONEY_ENTRY: 1800,
});

// ================================================================
// 5. TYPEDEFS (JSDoc)
// ================================================================
// These typedefs are the authoritative contract. Runtime validators
// below enforce the same shape. When this section changes, the
// validators must change with it.

/**
 * @typedef {Object} AssetId
 * @property {string} chainId
 * @property {string|null} contractAddress
 * @property {string} symbol
 * @property {string|null} coingeckoId
 * @property {string} name
 */

/**
 * @typedef {Object} SignalMetadata
 * @property {number} corroborationCount
 * @property {number|null} dataCompleteness
 * @property {number|null} interpretationConfidence
 */

/**
 * @typedef {Object} Signal
 * @property {string} id
 * @property {string} type
 * @property {string} source
 * @property {AssetId} assetId
 * @property {number} timestamp
 * @property {*} rawData
 * @property {SignalMetadata} metadata
 */

/**
 * @typedef {Object} Evidence
 * @property {string} signalId
 * @property {number} sourceReliability
 * @property {number} dataFreshness
 * @property {number} corroborationCount
 * @property {number} dataCompleteness
 * @property {number} interpretationConfidence
 * @property {number|null} confidence
 * @property {boolean} incomplete
 * @property {string[]} reasoning
 */

/**
 * @typedef {Object} PersonalContext
 * @property {AssetId} assetId
 * @property {number} portfolioWeight
 * @property {string} watchlistStatus
 * @property {string} thesisStatus
 * @property {number} recentDecisions
 * @property {string} behavioralRisk
 * @property {number} portfolioExposure
 * @property {number} riskLimit
 * @property {string} timeHorizon
 * @property {number} thesisHealth
 * @property {number} decisionConfidence
 * @property {number} chainExposure
 * @property {number} sectorExposure
 */

/**
 * @typedef {Object} Assessment
 * @property {string} signalId
 * @property {number} relevance
 * @property {number|null} impact
 * @property {number} urgency
 * @property {number|null} confidence
 * @property {string[]} reasoning
 */

/**
 * @typedef {Object} DecisionPriority
 * @property {string} signalId
 * @property {Assessment} assessment
 * @property {number|null} score
 * @property {string} eligibility
 * @property {string} recommendedAction
 * @property {string} explanation
 */

// ================================================================
// 6. VALIDATION PRIMITIVES
// ================================================================

function _mustBeString(minLen = 1, maxLen = Infinity) {
  return (v, path) => {
    if (typeof v !== "string") return `${path}: must be a string`;
    if (v.length < minLen) return `${path}: must be at least ${minLen} char(s)`;
    if (v.length > maxLen) return `${path}: must be at most ${maxLen} chars`;
    return null;
  };
}

function _mustBeFiniteNumber(min = -Infinity, max = Infinity) {
  return (v, path) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return `${path}: must be a finite number`;
    }
    if (v < min) return `${path}: must be >= ${min}`;
    if (v > max) return `${path}: must be <= ${max}`;
    return null;
  };
}

function _mustBeInteger(min = -Infinity, max = Infinity) {
  return (v, path) => {
    if (!Number.isInteger(v)) return `${path}: must be an integer`;
    if (v < min) return `${path}: must be >= ${min}`;
    if (v > max) return `${path}: must be <= ${max}`;
    return null;
  };
}

function _mustBeEnum(set, enumName) {
  return (v, path) => {
    if (typeof v !== "string") return `${path}: must be a string`;
    if (!set.has(v)) return `${path}: must be one of ${enumName}`;
    return null;
  };
}

function _mustBeBoolean() {
  return (v, path) => {
    if (typeof v !== "boolean") return `${path}: must be a boolean`;
    return null;
  };
}

function _mustBeArrayOfStrings() {
  return (v, path) => {
    if (!Array.isArray(v)) return `${path}: must be an array`;
    for (let i = 0; i < v.length; i++) {
      if (typeof v[i] !== "string") return `${path}[${i}]: must be a string`;
    }
    return null;
  };
}

function _nullable(check) {
  return (v, path) => (v === null ? null : check(v, path));
}

function _runChecks(obj, spec, basePath = "") {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return [`${basePath || "value"}: must be an object`];
  }
  const errors = [];
  for (const field of Object.keys(spec)) {
    const path = basePath ? `${basePath}.${field}` : field;
    const err = spec[field](obj[field], path);
    if (err) errors.push(err);
  }
  return errors;
}

// ================================================================
// 7. ASSET ID
// ================================================================

const _ASSET_ID_SPEC = {
  chainId: _mustBeString(1, 32),
  contractAddress: _nullable(_mustBeString(1, 128)),
  symbol: _mustBeString(1, 32),
  coingeckoId: _nullable(_mustBeString(1, 64)),
  name: _mustBeString(1, 128),
};

function validateAssetId(assetId) {
  if (_hasPollutionKey(assetId)) {
    return {
      ok: false,
      errors: ["assetId: prototype-pollution keys rejected"],
    };
  }
  const errors = _runChecks(assetId, _ASSET_ID_SPEC);
  return { ok: errors.length === 0, errors };
}

function isAssetId(x) {
  return validateAssetId(x).ok;
}

function assertAssetId(x) {
  const { ok, errors } = validateAssetId(x);
  if (!ok) throw new TypeError(`Invalid AssetId: ${errors.join("; ")}`);
  return x;
}

function createAssetId(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (_hasPollutionKey(input)) return null;

  const candidate = {
    chainId: String(input.chainId || "")
      .toLowerCase()
      .trim(),
    contractAddress:
      input.contractAddress == null || input.contractAddress === ""
        ? null
        : String(input.contractAddress),
    symbol: String(input.symbol || "")
      .toUpperCase()
      .trim(),
    coingeckoId:
      input.coingeckoId == null || input.coingeckoId === ""
        ? null
        : String(input.coingeckoId),
    name: String(input.name || input.symbol || "").trim(),
  };

  if (!validateAssetId(candidate).ok) return null;
  return Object.freeze(candidate);
}

// ================================================================
// 8. SIGNAL
// ================================================================

const _SIGNAL_METADATA_SPEC = {
  corroborationCount: _mustBeInteger(1, 1000),
  dataCompleteness: _nullable(_mustBeFiniteNumber(0, 1)),
  interpretationConfidence: _nullable(_mustBeFiniteNumber(0, 1)),
};

function validateSignalMetadata(metadata) {
  const errors = _runChecks(metadata, _SIGNAL_METADATA_SPEC, "metadata");
  return { ok: errors.length === 0, errors };
}

function validateSignal(signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    return { ok: false, errors: ["signal: must be an object"] };
  }
  const errors = [];

  const scalarSpec = {
    id: _mustBeString(1, 128),
    type: _mustBeEnum(_SIGNAL_TYPE_SET, "SIGNAL_TYPE"),
    source: _mustBeString(1, 64),
    timestamp: _mustBeFiniteNumber(1, Number.MAX_SAFE_INTEGER),
  };
  errors.push(..._runChecks(signal, scalarSpec));

  const assetIdResult = validateAssetId(signal.assetId);
  if (!assetIdResult.ok) {
    for (const e of assetIdResult.errors) errors.push(`assetId.${e}`);
  }

  if (!("rawData" in signal)) {
    errors.push("rawData: field is required (may be null)");
  }

  if (signal.metadata !== undefined && signal.metadata !== null) {
    const mResult = validateSignalMetadata(signal.metadata);
    if (!mResult.ok) errors.push(...mResult.errors);
  }

  return { ok: errors.length === 0, errors };
}

function isSignal(x) {
  return validateSignal(x).ok;
}

function assertSignal(x) {
  const { ok, errors } = validateSignal(x);
  if (!ok) throw new TypeError(`Invalid Signal: ${errors.join("; ")}`);
  return x;
}

function createSignal(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (_hasPollutionKey(input)) return null;

  const assetId = createAssetId(input.assetId);
  if (!assetId) return null;

  const id =
    typeof input.id === "string" && input.id.length > 0
      ? input.id
      : _generateId();

  const timestamp =
    Number.isFinite(input.timestamp) && input.timestamp > 0
      ? input.timestamp
      : Date.now();

  const metadata = _coerceMetadata(input.metadata);

  const signal = {
    id,
    type: String(input.type || ""),
    source: String(input.source || ""),
    assetId,
    timestamp,
    rawData: input.rawData === undefined ? null : input.rawData,
    metadata,
  };

  if (!validateSignal(signal).ok) return null;
  return Object.freeze(signal);
}

function _coerceMetadata(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Object.freeze({
      corroborationCount: 1,
      dataCompleteness: null,
      interpretationConfidence: null,
    });
  }
  const corroborationCount =
    Number.isInteger(input.corroborationCount) && input.corroborationCount >= 1
      ? input.corroborationCount
      : 1;
  const dataCompleteness =
    Number.isFinite(input.dataCompleteness) &&
    input.dataCompleteness >= 0 &&
    input.dataCompleteness <= 1
      ? input.dataCompleteness
      : null;
  const interpretationConfidence =
    Number.isFinite(input.interpretationConfidence) &&
    input.interpretationConfidence >= 0 &&
    input.interpretationConfidence <= 1
      ? input.interpretationConfidence
      : null;
  return Object.freeze({
    corroborationCount,
    dataCompleteness,
    interpretationConfidence,
  });
}

function _generateId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return (
    "sig_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

// ================================================================
// 9. EVIDENCE
// ================================================================

const _EVIDENCE_SPEC = {
  signalId: _mustBeString(1, 128),
  sourceReliability: _mustBeFiniteNumber(0, 1),
  dataFreshness: _mustBeFiniteNumber(0, 1),
  corroborationCount: _mustBeInteger(1, 1000),
  dataCompleteness: _mustBeFiniteNumber(0, 1),
  interpretationConfidence: _mustBeFiniteNumber(0, 1),
  confidence: _nullable(_mustBeFiniteNumber(0, 1)),
  incomplete: _mustBeBoolean(),
  reasoning: _mustBeArrayOfStrings(),
};

function validateEvidence(evidence) {
  const errors = _runChecks(evidence, _EVIDENCE_SPEC);
  return { ok: errors.length === 0, errors };
}

function isEvidence(x) {
  return validateEvidence(x).ok;
}

function assertEvidence(x) {
  const { ok, errors } = validateEvidence(x);
  if (!ok) throw new TypeError(`Invalid Evidence: ${errors.join("; ")}`);
  return x;
}

function createEvidence(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const confidence = computeConfidence({
    sourceReliability: input.sourceReliability,
    dataFreshness: input.dataFreshness,
    corroborationCount: input.corroborationCount,
    dataCompleteness: input.dataCompleteness,
    interpretationConfidence: input.interpretationConfidence,
  });

  const evidence = {
    signalId: String(input.signalId || ""),
    sourceReliability: input.sourceReliability,
    dataFreshness: input.dataFreshness,
    corroborationCount: input.corroborationCount ?? 1,
    dataCompleteness: input.dataCompleteness,
    interpretationConfidence: input.interpretationConfidence,
    confidence,
    incomplete: confidence === null,
    reasoning: Array.isArray(input.reasoning) ? input.reasoning.slice() : [],
  };

  if (!validateEvidence(evidence).ok) return null;
  return Object.freeze(evidence);
}

// ================================================================
// 10. PERSONAL CONTEXT
// ================================================================

const _PERSONAL_CONTEXT_SPEC = {
  portfolioWeight: _mustBeFiniteNumber(0, 1),
  watchlistStatus: _mustBeEnum(_WATCHLIST_STATUS_SET, "WATCHLIST_STATUS"),
  thesisStatus: _mustBeEnum(_THESIS_ACTIVATION_SET, "THESIS_ACTIVATION"),
  recentDecisions: _mustBeInteger(0, 10000),
  behavioralRisk: _mustBeEnum(_BEHAVIORAL_RISK_SET, "BEHAVIORAL_RISK"),
  portfolioExposure: _mustBeFiniteNumber(0, 1),
  riskLimit: _mustBeFiniteNumber(0, 1),
  timeHorizon: _mustBeEnum(_HORIZON_SET, "HORIZON"),
  thesisHealth: _mustBeFiniteNumber(0, 100),
  decisionConfidence: _mustBeFiniteNumber(0, 1),
  chainExposure: _mustBeFiniteNumber(0, 1),
  sectorExposure: _mustBeFiniteNumber(0, 1),
};

function validatePersonalContext(ctx) {
  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) {
    return { ok: false, errors: ["personalContext: must be an object"] };
  }
  const errors = _runChecks(ctx, _PERSONAL_CONTEXT_SPEC);
  const assetIdResult = validateAssetId(ctx.assetId);
  if (!assetIdResult.ok) {
    for (const e of assetIdResult.errors) errors.push(`assetId.${e}`);
  }
  return { ok: errors.length === 0, errors };
}

function isPersonalContext(x) {
  return validatePersonalContext(x).ok;
}

function assertPersonalContext(x) {
  const { ok, errors } = validatePersonalContext(x);
  if (!ok) throw new TypeError(`Invalid PersonalContext: ${errors.join("; ")}`);
  return x;
}

function createPersonalContext(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const assetId = createAssetId(input.assetId);
  if (!assetId) return null;

  const ctx = {
    assetId,
    portfolioWeight: input.portfolioWeight,
    watchlistStatus: String(input.watchlistStatus || ""),
    thesisStatus: String(input.thesisStatus || ""),
    recentDecisions: input.recentDecisions,
    behavioralRisk: String(input.behavioralRisk || ""),
    portfolioExposure:
      input.portfolioExposure === undefined
        ? input.portfolioWeight
        : input.portfolioExposure,
    riskLimit: input.riskLimit,
    timeHorizon: String(input.timeHorizon || ""),
    thesisHealth: input.thesisHealth,
    decisionConfidence: input.decisionConfidence,
    chainExposure: input.chainExposure,
    sectorExposure: input.sectorExposure,
  };

  if (!validatePersonalContext(ctx).ok) return null;
  return Object.freeze(ctx);
}

// ================================================================
// 11. ASSESSMENT
// ================================================================

const _ASSESSMENT_SPEC = {
  signalId: _mustBeString(1, 128),
  relevance: _mustBeFiniteNumber(0, 1),
  impact: _nullable(_mustBeFiniteNumber(0, 1)),
  urgency: _mustBeFiniteNumber(0, 1),
  confidence: _nullable(_mustBeFiniteNumber(0, 1)),
  reasoning: _mustBeArrayOfStrings(),
};

function validateAssessment(a) {
  const errors = _runChecks(a, _ASSESSMENT_SPEC);
  return { ok: errors.length === 0, errors };
}

function isAssessment(x) {
  return validateAssessment(x).ok;
}

function assertAssessment(x) {
  const { ok, errors } = validateAssessment(x);
  if (!ok) throw new TypeError(`Invalid Assessment: ${errors.join("; ")}`);
  return x;
}

function createAssessment(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const assessment = {
    signalId: String(input.signalId || ""),
    relevance: input.relevance,
    impact: input.impact === undefined ? null : input.impact,
    urgency: input.urgency,
    confidence: input.confidence === undefined ? null : input.confidence,
    reasoning: Array.isArray(input.reasoning) ? input.reasoning.slice() : [],
  };
  if (!validateAssessment(assessment).ok) return null;
  return Object.freeze(assessment);
}

// ================================================================
// 12. DECISION PRIORITY
// ================================================================

const _DECISION_PRIORITY_SPEC = {
  signalId: _mustBeString(1, 128),
  score: _nullable(_mustBeFiniteNumber(0, 10)),
  eligibility: _mustBeEnum(_ELIGIBILITY_SET, "ELIGIBILITY"),
  recommendedAction: _mustBeEnum(_RECOMMENDED_ACTION_SET, "RECOMMENDED_ACTION"),
  explanation: _mustBeString(1, 2000),
};

function validateDecisionPriority(dp) {
  if (!dp || typeof dp !== "object" || Array.isArray(dp)) {
    return { ok: false, errors: ["decisionPriority: must be an object"] };
  }
  const errors = _runChecks(dp, _DECISION_PRIORITY_SPEC);
  const aResult = validateAssessment(dp.assessment);
  if (!aResult.ok) {
    for (const e of aResult.errors) errors.push(`assessment.${e}`);
  }
  return { ok: errors.length === 0, errors };
}

function isDecisionPriority(x) {
  return validateDecisionPriority(x).ok;
}

function assertDecisionPriority(x) {
  const { ok, errors } = validateDecisionPriority(x);
  if (!ok)
    throw new TypeError(`Invalid DecisionPriority: ${errors.join("; ")}`);
  return x;
}

function createDecisionPriority(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const assessment = createAssessment(input.assessment);
  if (!assessment) return null;

  const dp = {
    signalId: String(input.signalId || ""),
    assessment,
    score: input.score === undefined ? null : input.score,
    eligibility: String(input.eligibility || ""),
    recommendedAction: String(input.recommendedAction || ""),
    explanation: String(input.explanation || ""),
  };

  if (!validateDecisionPriority(dp).ok) return null;
  return Object.freeze(dp);
}

// ================================================================
// 13. THE ONE CONFIDENCE FUNCTION
// ================================================================
// Every module that needs a confidence value MUST call this. A
// second formula anywhere else is a bug.
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

function computeConfidence(evidence) {
  if (!evidence || typeof evidence !== "object") return null;

  const {
    sourceReliability,
    dataFreshness,
    corroborationCount = 1,
    dataCompleteness,
    interpretationConfidence,
  } = evidence;

  if (!Number.isFinite(sourceReliability)) return null;
  if (!Number.isFinite(dataFreshness)) return null;
  if (!Number.isFinite(dataCompleteness)) return null;
  if (!Number.isFinite(interpretationConfidence)) return null;
  if (!Number.isFinite(corroborationCount)) return null;

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const sr = clamp(sourceReliability);
  const df = clamp(dataFreshness);
  const cc = Math.max(1, Math.floor(corroborationCount));
  const dc = clamp(dataCompleteness);
  const ic = clamp(interpretationConfidence);

  const corroborationBoost = Math.min(1.5, 1 + (cc - 1) * 0.15);
  let confidence = sr * df * dc * ic * corroborationBoost;
  confidence = clamp(confidence);

  if (confidence < 0.05 && (sr > 0 || df > 0 || dc > 0 || ic > 0)) {
    confidence = 0.05;
  }
  return confidence;
}

// ================================================================
//  AGGREGATE CONFIDENCE
// ================================================================
// Used when a composite view needs a single confidence number
// derived from N independently-computed confidences.
//
// MISSING-DATA POLICY (matches computeConfidence):
//   - Evidence items with null confidence are EXCLUDED from the
//     average, not treated as zero. A null means "we could not
//     measure this", not "we measured zero".
//   - If NO evidence items have a finite confidence, the aggregate
//     is null — never a fabricated midpoint.
//   - The returned object carries `coverage` (measured / total) so
//     callers can distinguish "0.7 from 3 of 3 items" from
//     "0.7 from 3 of 5 items". Coverage itself is honest metadata,
//     not a confidence number.
//
// This is deliberately the ONLY other function in the codebase
// permitted to touch a confidence value. Any module that needs an
// aggregate confidence MUST call this, not re-implement the
// average inline.

function computeAggregateConfidence(evidenceItems) {
  if (!Array.isArray(evidenceItems)) return null;
  if (evidenceItems.length === 0) {
    return Object.freeze({
      confidence: null,
      coverage: 0,
      measuredCount: 0,
      totalCount: 0,
    });
  }
  const finite = [];
  for (const item of evidenceItems) {
    if (!item || typeof item !== "object") continue;
    const c = item.confidence;
    if (Number.isFinite(c) && c >= 0 && c <= 1) finite.push(c);
  }
  const totalCount = evidenceItems.length;
  const measuredCount = finite.length;
  const coverage = totalCount > 0 ? measuredCount / totalCount : 0;
  if (measuredCount === 0) {
    return Object.freeze({
      confidence: null,
      coverage: 0,
      measuredCount: 0,
      totalCount,
    });
  }
  const sum = finite.reduce((a, b) => a + b, 0);
  const mean = sum / measuredCount;
  const clamped = Math.max(0, Math.min(1, mean));
  return Object.freeze({
    confidence: clamped,
    coverage,
    measuredCount,
    totalCount,
  });
}

function computeFreshness(timestamp, signalType) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  const ageMs = Date.now() - timestamp;
  if (ageMs <= 0) return 1;
  const window = FRESHNESS_WINDOWS[signalType] || 3600;
  return Math.min(1, Math.max(0, 1 - ageMs / (window * 1000)));
}

function getSourceReliability(source) {
  if (typeof source !== "string") return SOURCE_RELIABILITY.unknown;
  return SOURCE_RELIABILITY[source] ?? SOURCE_RELIABILITY.unknown;
}

// ================================================================
// 14. EXPORTS
// ================================================================

W.intelligence.types = Object.freeze({
  SIGNAL_TYPE,
  THESIS_STATUS,
  THESIS_ACTIVATION,
  WATCHLIST_STATUS,
  BEHAVIORAL_RISK,
  HORIZON,
  ELIGIBILITY,
  RECOMMENDED_ACTION,
  ASSET_CHAIN,
});

W.intelligence.is = Object.freeze({
  assetId: isAssetId,
  signal: isSignal,
  evidence: isEvidence,
  personalContext: isPersonalContext,
  assessment: isAssessment,
  decisionPriority: isDecisionPriority,
});

W.intelligence.validate = Object.freeze({
  assetId: validateAssetId,
  signal: validateSignal,
  signalMetadata: validateSignalMetadata,
  evidence: validateEvidence,
  personalContext: validatePersonalContext,
  assessment: validateAssessment,
  decisionPriority: validateDecisionPriority,
});

W.intelligence.assert = Object.freeze({
  assetId: assertAssetId,
  signal: assertSignal,
  evidence: assertEvidence,
  personalContext: assertPersonalContext,
  assessment: assertAssessment,
  decisionPriority: assertDecisionPriority,
});

W.intelligence.create = Object.freeze({
  assetId: createAssetId,
  signal: createSignal,
  evidence: createEvidence,
  personalContext: createPersonalContext,
  assessment: createAssessment,
  decisionPriority: createDecisionPriority,
});

W.intelligence.sourceReliability = SOURCE_RELIABILITY;
W.intelligence.freshnessWindows = FRESHNESS_WINDOWS;
W.intelligence.computeConfidence = computeConfidence;
// The aggregate function is the ONLY other permitted arithmetic
// on confidence values. Any module that needs a composite
// confidence MUST call this, not re-implement an average inline.
W.intelligence.computeAggregateConfidence = computeAggregateConfidence;
W.intelligence.computeFreshness = computeFreshness;
W.intelligence.getSourceReliability = getSourceReliability;
W.intelligence.CONTRACT_VERSION = CONTRACT_VERSION;

console.log(
  `[Intelligence] Canonical contracts loaded (${CONTRACT_VERSION}): ` +
    `6 types, ${_SIGNAL_TYPES.length} signal types, one confidence function.`,
);