// js/intelligence/meme-contracts.js
// Canonical contracts for the meme-opportunity pipeline.
// Self-contained validator — no Zod, no external dependency.
window.W = window.W || {};

W.memeContracts = (() => {
  const METHODOLOGY_VERSION = "meme-contracts-v1";

  // ── Minimal validator ─────────────────────────────────
  // spec forms:
  //   "string" | "number" | "int" | "boolean" | "any"
  //   { type, nullable?, enum? }
  //   { type: "object", schema: {...} }
  //   { type: "array", of: spec }
  //   { type: "record", of: spec }

  function checkField(spec, val, path) {
    if (typeof spec === "string") spec = { type: spec };
    const { type, nullable = false, enum: enumVals } = spec;

    if (val === null || val === undefined) {
      return nullable
        ? { ok: true, value: null }
        : { ok: false, issues: [`${path}: required, got null`] };
    }
    if (enumVals) {
      return enumVals.includes(val)
        ? { ok: true, value: val }
        : {
            ok: false,
            issues: [`${path}: not in enum ${JSON.stringify(enumVals)}`],
          };
    }
    if (type === "string")
      return typeof val === "string"
        ? { ok: true, value: val }
        : { ok: false, issues: [`${path}: expected string`] };
    if (type === "number")
      return Number.isFinite(val)
        ? { ok: true, value: val }
        : { ok: false, issues: [`${path}: expected finite number`] };
    if (type === "int")
      return Number.isInteger(val)
        ? { ok: true, value: val }
        : { ok: false, issues: [`${path}: expected integer`] };
    if (type === "boolean")
      return typeof val === "boolean"
        ? { ok: true, value: val }
        : { ok: false, issues: [`${path}: expected boolean`] };
    if (type === "any") return { ok: true, value: val };

    if (type === "object") {
      if (val === null || typeof val !== "object" || Array.isArray(val)) {
        return { ok: false, issues: [`${path}: expected object`] };
      }
      const out = {};
      const issues = [];
      for (const [k, s] of Object.entries(spec.schema || {})) {
        const r = checkField(s, val[k], `${path}.${k}`);
        if (r.ok) out[k] = r.value;
        else issues.push(...r.issues);
      }
      return issues.length ? { ok: false, issues } : { ok: true, value: out };
    }
    if (type === "array") {
      if (!Array.isArray(val))
        return { ok: false, issues: [`${path}: expected array`] };
      const out = [];
      for (let i = 0; i < val.length; i++) {
        const r = checkField(spec.of, val[i], `${path}[${i}]`);
        if (!r.ok) return r;
        out.push(r.value);
      }
      return { ok: true, value: out };
    }
    if (type === "record") {
      if (val === null || typeof val !== "object" || Array.isArray(val)) {
        return { ok: false, issues: [`${path}: expected record`] };
      }
      const out = {};
      for (const [k, v] of Object.entries(val)) {
        const r = checkField(spec.of, v, `${path}.${k}`);
        if (!r.ok) return r;
        out[k] = r.value;
      }
      return { ok: true, value: out };
    }
    return { ok: false, issues: [`${path}: unknown spec type ${type}`] };
  }

  // ── Schemas ───────────────────────────────────────────

  const Provenance = {
    source: "string",
    observedAt: { type: "int", nullable: true },
    fetchedAt: "int",
    methodologyVersion: "string",
    completeness: { type: "number", nullable: true },
  };

  const Identity = { chain: "string", tokenAddress: "string" };

  const Candidate = {
    identity: { type: "object", schema: Identity },
    symbol: { type: "string", nullable: true },
    name: { type: "string", nullable: true },
    pairAddress: { type: "string", nullable: true },
    dex: { type: "string", nullable: true },
    discoveredAt: "int",
    discoverySource: {
      type: "string",
      enum: ["native-launch-feed", "aggregator", "manual", "unknown"],
    },
    discoveryConfidence: { type: "number", nullable: true },
    provenance: { type: "object", schema: Provenance },
  };

  const MarketSnapshot = {
    observedAt: "int",
    pairAgeMinutes: { type: "number", nullable: true },
    liquidityUsd: { type: "number", nullable: true },
    liquidityChange1h: { type: "number", nullable: true },
    volume5m: { type: "number", nullable: true },
    volume1h: { type: "number", nullable: true },
    volume6h: { type: "number", nullable: true },
    volume24h: { type: "number", nullable: true },
    priceChange5m: { type: "number", nullable: true },
    priceChange1h: { type: "number", nullable: true },
    priceChange6h: { type: "number", nullable: true },
    priceChange24h: { type: "number", nullable: true },
    buys5m: { type: "int", nullable: true },
    sells5m: { type: "int", nullable: true },
    buys1h: { type: "int", nullable: true },
    sells1h: { type: "int", nullable: true },
    buys24h: { type: "int", nullable: true },
    sells24h: { type: "int", nullable: true },
    provenance: { type: "object", schema: Provenance },
  };

  const HolderSnapshot = {
    observedAt: "int",
    holderCount: { type: "int", nullable: true },
    uniqueHolderCount: { type: "int", nullable: true },
    holderGrowth1h: { type: "number", nullable: true },
    holderGrowth6h: { type: "number", nullable: true },
    holderGrowth24h: { type: "number", nullable: true },
    top10Pct: { type: "number", nullable: true },
    top20Pct: { type: "number", nullable: true },
    creatorPct: { type: "number", nullable: true },
    sniperPct: { type: "number", nullable: true },
    freshWalletPct: { type: "number", nullable: true },
    clusteredPct: { type: "number", nullable: true },
    provenance: { type: "object", schema: Provenance },
  };

  const WalletFlowSnapshot = {
    observedAt: "int",
    newBuyerCount: { type: "int", nullable: true },
    returningBuyerCount: { type: "int", nullable: true },
    smartWalletMethodology: { type: "string", nullable: true },
    smartWalletInflow: { type: "number", nullable: true },
    smartWalletOutflow: { type: "number", nullable: true },
    smartWalletNetflow: { type: "number", nullable: true },
    freshWalletInflow: { type: "number", nullable: true },
    freshWalletOutflow: { type: "number", nullable: true },
    creatorLinkedFlow: { type: "number", nullable: true },
    clusteredFlow: { type: "number", nullable: true },
    provenance: { type: "object", schema: Provenance },
  };

  const LP_LOCK_STATUSES = [
    "verified-locked",
    "provider-reported",
    "partially-locked",
    "unlocked",
    "conflicting",
    "unknown",
    "unavailable",
  ];

  const SecurityAssessment = {
    observedAt: "int",
    verdict: {
      type: "string",
      enum: [
        "verified-safe",
        "provider-reported-safe",
        "conflicting",
        "unknown",
        "unavailable",
      ],
    },
    honeypot: { type: "boolean", nullable: true },
    canSell: { type: "boolean", nullable: true },
    mintAuthorityActive: { type: "boolean", nullable: true },
    freezeAuthorityActive: { type: "boolean", nullable: true },
    ownerCanBlacklist: { type: "boolean", nullable: true },
    taxChangeRisk: {
      type: "string",
      nullable: true,
      enum: ["none", "low", "medium", "high", "unknown"],
    },
    liquidityRemovable: { type: "boolean", nullable: true },
    lpLockStatus: { type: "string", enum: LP_LOCK_STATUSES },
    lpLockDetails: {
      type: "object",
      nullable: true,
      schema: {
        verifiedVia: {
          type: "string",
          enum: ["rpc", "indexer", "provider", "none"],
        },
        lockedPct: { type: "number", nullable: true },
        unlockAt: { type: "int", nullable: true },
      },
    },
    simulationStatus: {
      type: "string",
      enum: ["simulated-ok", "simulated-fail", "not-simulated", "unsupported"],
    },
    source: "string",
    freshness: { type: "int", nullable: true },
    provenance: { type: "object", schema: Provenance },
  };

  const SocialAssessment = {
    observedAt: "int",
    mentionVelocity: { type: "number", nullable: true },
    uniqueAuthors: { type: "int", nullable: true },
    engagementQuality: { type: "number", nullable: true },
    authorDiversity: { type: "number", nullable: true },
    botRisk: { type: "number", nullable: true },
    botRiskMethodology: { type: "string", nullable: true },
    narrativeConsistency: { type: "number", nullable: true },
    officialActivity: { type: "boolean", nullable: true },
    catalyst: { type: "string", nullable: true },
    provenance: { type: "object", schema: Provenance },
  };

  const MemeOpportunityAssessment = {
    methodologyVersion: { type: "string", enum: ["meme-opportunity-v1"] },
    identity: { type: "object", schema: Identity },
    eligibility: {
      type: "object",
      schema: {
        status: {
          type: "string",
          enum: ["ELIGIBLE", "INELIGIBLE", "INSUFFICIENT_DATA"],
        },
        vetoes: {
          type: "array",
          of: {
            type: "object",
            schema: {
              code: "string",
              reason: "string",
              severity: { type: "string", enum: ["block", "warn"] },
            },
          },
        },
      },
    },
    scores: {
      type: "object",
      schema: {
        opportunity: { type: "number", nullable: true },
        survivability: { type: "number", nullable: true },
        executionRisk: { type: "number", nullable: true },
      },
    },
    confidence: { type: "number", nullable: true },
    category: {
      type: "string",
      enum: [
        "WATCH_FOR_CONFIRMATION",
        "EARLY_MOMENTUM",
        "ESTABLISHED",
        "AVOID",
        "UNKNOWN",
      ],
    },
    breakdown: { type: "record", of: { type: "number", nullable: true } },
    evidence: { type: "array", of: "any" },
    freshness: { type: "record", of: "any" },
    reasons: { type: "array", of: "string" },
  };

  const SCHEMAS = {
    Candidate,
    MarketSnapshot,
    HolderSnapshot,
    WalletFlowSnapshot,
    SecurityAssessment,
    SocialAssessment,
    MemeOpportunityAssessment,
  };

  function parse(name, raw) {
    const schema = SCHEMAS[name];
    if (!schema) throw new Error(`Unknown contract: ${name}`);
    const result = checkField({ type: "object", schema }, raw, "$");
    if (!result.ok) {
      console.warn(`[MemeContracts] ${name} parse failed:`, result.issues);
      return null;
    }
    return result.value;
  }

  return {
    METHODOLOGY_VERSION,
    SCHEMAS,
    LP_LOCK_STATUSES,
    parse,
    _validate: checkField, // for tests
  };
})();
