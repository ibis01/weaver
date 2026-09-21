// ===============================================================
//         Weaver Track Record v2.1 – auditable history
// ===============================================================
// Historical fidelity: preserve exactly what Weaver knew at capture
// time. User edits are limited to explicit fields and are revisioned.
// Historical views never fetch current market data.

window.W = window.W || {};

W.trackRecord = (() => {
  const STORAGE_KEY = "track_record";
  const LEGACY_STORAGE_KEYS = [
    "track_record_v0",
    "track_records",
    "track_record_v1",
  ];
  const MAX_REVISIONS = 100;
  const SCHEMA_VERSION = "track-record-v1";
  const ACCEPTED_SCHEMA_VERSIONS = new Set([
    SCHEMA_VERSION,
    "track-record-v2.1",
  ]);
  const USER_ACTIONS = new Set([
    "UNSET",
    "NO_DECISION",
    "WATCH",
    "CONSIDER",
    "ENTERED",
    "NOT_ENTERED",
    "EXITED",
    "SKIPPED",
    "HOLD",
  ]);
  const OUTCOME_STATUS = new Set([
    "UNSET",
    "OPEN",
    "CLOSED",
    "UNKNOWN",
    "REPORTED_GAIN",
    "REPORTED_LOSS",
    "REPORTED_FLAT",
  ]);
  const OUTCOME_SOURCES = new Set([
    "USER_ENTERED",
    "PORTFOLIO_TRANSACTION",
    "MARKET_OBSERVATION",
    "UNKNOWN",
    "user-reported",
  ]);
  const MUTABLE_FIELDS = new Set([
    "userDecision.action",
    "userDecision.notes",
    "userDecision.decisionTimestamp",
    "userDecision.linkedTransactionId",
    "outcome.status",
    "outcome.observedPriceAtOutcome",
    "outcome.outcomeTimestamp",
    "outcome.entryTimestamp",
    "outcome.exitTimestamp",
    "outcome.userEntryPrice",
    "outcome.userExitPrice",
    "outcome.positionSize",
    "outcome.resultCurrency",
    "outcome.outcomeSource",
    "outcome.notes",
  ]);
  const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  // ── Outcome-evaluation cooldown ───────────────────────
  const OUTCOME_COOLDOWN_MS = 60_000;
  const OUTCOME_FETCH_TIMEOUT_MS = 9000;
  let lastOutcomeSignature = "";
  let lastOutcomeCheck = 0;
  let warnedUnevaluable = false;

  function stableStringify(value) {
    if (value === null || typeof value !== "object")
      return JSON.stringify(value);
    if (Array.isArray(value))
      return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  function contentHash(value) {
    let hash = 2166136261;
    for (const char of stableStringify(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function deterministicId(value, prefix = "track-legacy") {
    return `${prefix}-${contentHash(value)}`;
  }

  // Narrow signature for identity comparison during migration.
  // Full snapshot comparison fails because canonical and legacy
  // snapshots are structurally different. The fields below are what
  // actually determine whether two records describe the same analysis
  // at the *identity* level.
  function snapshotSignature(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return "null";
    const verdict = snapshot.unifiedVerdict || {};
    const ts = snapshot.analysisTimestamp;
    return JSON.stringify({
      score: verdict.score ?? null,
      confidence: verdict.confidence ?? null,
      scoringVersion:
        snapshot.scoringVersion ?? verdict.evidenceVersion ?? null,
      analysisTimestamp: ts ? ts : null,
    });
  }

  // ── Normalized content projection ─────────────────────
  // Canonical and legacy-v0 snapshots describe the same analysis
  // under structurally incompatible shapes. The projection maps both
  // onto a common semantic shape so that "same analysis" can be
  // compared as a value, not as a structural match.
  //
  // Design rules:
  //
  //   1. Include only fields that are (a) present in both formats
  //      and (b) semantically meaningful for identity.
  //
  //   2. Normalize format-specific representations of the same
  //      semantic value to a common form:
  //        - analysisTimestamp: 0 / null / undefined all mean
  //          "unset" and normalize to null
  //        - scenarioClassification: canonical may store this as a
  //          top-level object, a top-level string, or null; legacy
  //          always stores it as { classification: "UNKNOWN" } for
  //          the unset case. Both normalize to null.
  //
  //   3. Exclude storage-layer fields that describe HOW the
  //      analysis was stored, not WHAT it concluded:
  //        - evidenceQuality: derived
  //        - domains: provider availability varies by scan
  //        - evidenceBuilderVersion, technicalAnalysis,
  //          fundamentalAssessment, securityAssessment: legacy-only
  //        - methodologyVersion: overlaps with scoringVersion
  //
  //   4. Do NOT include the `missing` evidence count. Legacy records
  //      always populate it with a migration placeholder
  //      ("Legacy record did not include structured evidence"), and
  //      canonical records never do. Including it would create a
  //      false conflict on every legitimate canonical-to-legacy
  //      dedupe, defeating the purpose of the gate.
  //
  // Two snapshots whose projections are equal describe the same
  // analysis. Two snapshots whose projections differ describe
  // different analyses and must be preserved as a conflict.
  function analysisProjection(snapshot) {
    const empty = {
      asset: null,
      score: null,
      confidence: null,
      scoringVersion: null,
      analysisTimestamp: null,
      scenarioClassification: null,
      supportingEvidenceCount: 0,
      contradictingEvidenceCount: 0,
    };
    if (!snapshot || typeof snapshot !== "object") return empty;

    const verdict = snapshot.unifiedVerdict || {};

    // analysisTimestamp: 0, null, undefined → null. The narrow
    // signature already applies this rule; the projection repeats it
    // so the two stay in agreement.
    const rawTs = snapshot.analysisTimestamp;
    const analysisTimestamp =
      typeof rawTs === "number" && Number.isFinite(rawTs) && rawTs !== 0
        ? rawTs
        : null;

    // scenarioClassification: read from any of the shapes either
    // format may produce. "UNKNOWN" and empty strings normalize to
    // null because they mean "no scenario was recorded".
    let scenarioClassification = null;
    if (snapshot.scenario && typeof snapshot.scenario === "object") {
      scenarioClassification = snapshot.scenario.classification ?? null;
    } else if (typeof snapshot.scenario === "string") {
      scenarioClassification = snapshot.scenario;
    } else if (typeof verdict.scenario === "string") {
      scenarioClassification = verdict.scenario;
    }
    if (
      typeof scenarioClassification !== "string" ||
      !scenarioClassification.trim() ||
      scenarioClassification === "UNKNOWN"
    ) {
      scenarioClassification = null;
    }

    // Evidence counts: only supporting and contradicting items
    // count. The `missing` array is a list of gaps, not evidence,
    // and its content is format-specific.
    const evidence = snapshot.evidence;
    const supportingEvidenceCount = Array.isArray(evidence?.supporting)
      ? evidence.supporting.length
      : 0;
    const contradictingEvidenceCount = Array.isArray(evidence?.contradicting)
      ? evidence.contradicting.length
      : 0;

    return {
      asset: typeof snapshot.asset === "string" ? snapshot.asset : null,
      score: Number.isFinite(verdict.score) ? verdict.score : null,
      confidence: Number.isFinite(verdict.confidence)
        ? verdict.confidence
        : null,
      scoringVersion:
        snapshot.scoringVersion ?? verdict.evidenceVersion ?? null,
      analysisTimestamp,
      scenarioClassification,
      supportingEvidenceCount,
      contradictingEvidenceCount,
    };
  }

  // Full immutable-content hash. Two snapshots that share a narrow
  // identity signature but differ in their projected content are
  // different analyses and must not be deduplicated.
  function immutableContentHash(snapshot) {
    return contentHash(analysisProjection(snapshot));
  }

  function legacyV0Snapshot(raw) {
    const timestamp = Number.isFinite(raw?.analysisTimestamp)
      ? raw.analysisTimestamp
      : Number.isFinite(raw?.createdAt)
        ? raw.createdAt
        : 0;
    return {
      asset:
        typeof raw?.symbol === "string"
          ? raw.symbol
          : typeof raw?.asset === "string"
            ? raw.asset
            : null,
      methodologyVersion: raw?.methodologyVersion || raw?.methodology || null,
      scoringVersion: raw?.scoringVersion || raw?.scoreVersion || null,
      evidenceBuilderVersion: raw?.evidenceBuilderVersion || null,
      analysisTimestamp: timestamp,
      unifiedVerdict: {
        score: Number.isFinite(raw?.opportunityScore)
          ? raw.opportunityScore
          : Number.isFinite(raw?.score)
            ? raw.score
            : null,
        confidence: Number.isFinite(raw?.confidence) ? raw.confidence : null,
        evidenceQuality: "UNKNOWN",
        domains: {},
      },
      technicalAnalysis: {
        score: null,
        bias: null,
        rsi: null,
        trend: null,
        confidence: null,
        available: false,
      },
      fundamentalAssessment: { score: null, bias: null, available: false },
      securityAssessment: {
        riskScore: null,
        riskLevel: null,
        source: null,
        available: false,
      },
      scenario: {
        classification: "UNKNOWN",
        strength: null,
        reasoning: [],
        limitations: ["Migrated from legacy Track Record v0"],
      },
      evidence: {
        supporting: [],
        contradicting: [],
        missing: ["Legacy record did not include structured evidence"],
      },
    };
  }

  function deepClone(value) {
    if (value === undefined || value === null) return value;
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
    } catch (_) {}
    return JSON.parse(JSON.stringify(value));
  }

  function ownDangerousKey(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      if (DANGEROUS_KEYS.has(key)) return true;
      if (ownDangerousKey(value[key], seen)) return true;
    }
    return false;
  }

  function safeFiniteNumber(value, allowNegative = true) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || (!allowNegative && number < 0)) return null;
    return number;
  }

  function timeMs(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function calculateOutcome(outcome, decisionTimestamp) {
    const entry = safeFiniteNumber(outcome.userEntryPrice, false);
    const exit = safeFiniteNumber(outcome.userExitPrice, false);
    const quantity = safeFiniteNumber(outcome.positionSize, false);
    const result = {
      realizedResult: null,
      realizedResultPct: null,
      holdingDurationMs: null,
    };
    if (entry !== null && exit !== null && quantity !== null) {
      result.realizedResult = (exit - entry) * quantity;
      if (entry !== 0)
        result.realizedResultPct = ((exit - entry) / entry) * 100;
    }
    const start = timeMs(outcome.entryTimestamp) ?? timeMs(decisionTimestamp);
    const end =
      timeMs(outcome.exitTimestamp) ?? timeMs(outcome.outcomeTimestamp);
    if (start !== null && end !== null && end >= start)
      result.holdingDurationMs = end - start;
    return result;
  }

  function canonicalAssetId(analysis, metadata = {}) {
    const source = analysis.assetId || metadata.assetId || {};
    return {
      chainId: source.chainId || "unknown",
      contractAddress: source.contractAddress || null,
      symbol: source.symbol || analysis.asset || "UNKNOWN",
      coingeckoId: source.coingeckoId || null,
      name: source.name || analysis.asset || "Unknown",
    };
  }

  function validRecord(record) {
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      ownDangerousKey(record)
    )
      return false;
    if (
      typeof (record.id || record.recordId) !== "string" ||
      !ACCEPTED_SCHEMA_VERSIONS.has(record.schemaVersion) ||
      record.createdAt === undefined ||
      record.createdAt === null
    )
      return false;
    if (record.assetId && typeof record.assetId !== "object") return false;
    if (!record.assetId && !record.asset) return false;
    if (!record.weaverSnapshot || typeof record.weaverSnapshot !== "object")
      return false;
    if (!record.userDecision || !record.outcome) return false;
    return true;
  }

  function normalizeRecord(record) {
    if (!validRecord(record)) return null;
    const snapshot = deepClone(record.weaverSnapshot);
    const decision = record.userDecision || {};
    const rawOutcome = record.outcome || {};
    const legacyUserReported = rawOutcome.userReported || {};
    const legacyStatus = rawOutcome.status || legacyUserReported.status;
    const outcome = {
      status: OUTCOME_STATUS.has(legacyStatus) ? legacyStatus : "UNKNOWN",
      observedPriceAtOutcome: safeFiniteNumber(
        rawOutcome.observedPriceAtOutcome,
        false,
      ),
      outcomeTimestamp: rawOutcome.outcomeTimestamp ?? null,
      entryTimestamp: rawOutcome.entryTimestamp ?? null,
      exitTimestamp: rawOutcome.exitTimestamp ?? null,
      userEntryPrice: safeFiniteNumber(rawOutcome.userEntryPrice, false),
      userExitPrice: safeFiniteNumber(rawOutcome.userExitPrice, false),
      positionSize: safeFiniteNumber(rawOutcome.positionSize, false),
      realizedResult: safeFiniteNumber(rawOutcome.realizedResult),
      realizedResultPct: safeFiniteNumber(rawOutcome.realizedResultPct),
      resultCurrency:
        typeof rawOutcome.resultCurrency === "string"
          ? rawOutcome.resultCurrency
          : null,
      outcomeSource: OUTCOME_SOURCES.has(rawOutcome.outcomeSource)
        ? rawOutcome.outcomeSource
        : "UNKNOWN",
      notes: typeof rawOutcome.notes === "string" ? rawOutcome.notes : "",
      holdingDurationMs: safeFiniteNumber(rawOutcome.holdingDurationMs, false),
    };
    return {
      id: record.id || record.recordId,
      recordId: record.recordId || record.id,
      schemaVersion: SCHEMA_VERSION,
      createdAt: record.createdAt,
      assetId: canonicalAssetId({
        assetId: record.assetId || {
          symbol: record.asset || snapshot.asset,
          name: record.asset || snapshot.asset,
        },
        asset: record.asset || snapshot.asset,
      }),
      asset:
        record.asset || record.assetId?.symbol || snapshot.asset || "UNKNOWN",
      origin: record.origin === "gem-agent" ? "gem-agent" : "manual",
      weaverSnapshot: snapshot,
      userDecision: {
        action: USER_ACTIONS.has(decision.action)
          ? decision.action
          : "NO_DECISION",
        notes: typeof decision.notes === "string" ? decision.notes : "",
        decisionTimestamp: decision.decisionTimestamp ?? null,
        linkedTransactionId: decision.linkedTransactionId ?? null,
      },
      outcome,
      revisions: Array.isArray(record.revisions)
        ? deepClone(record.revisions)
        : [],
      ...(record.migration ? { migration: deepClone(record.migration) } : {}),
    };
  }

  function migrate(options = {}) {
    const persist = options.persist !== false;
    const canonicalRaw = W.store?.get?.(STORAGE_KEY, []);
    const canonical = Array.isArray(canonicalRaw) ? canonicalRaw : [];
    const quarantined = [];
    let migratedLegacyId = 0;
    let deduped = 0;
    let conflicts = 0;

    const output = canonical
      .map((record) => {
        if (
          record?.migration?.status === "QUARANTINED" &&
          typeof record.id === "string"
        )
          return deepClone(record);
        const normalized = normalizeRecord(record);
        if (normalized) return normalized;
        quarantined.push({
          id: deterministicId(record, "track-quarantine"),
          schemaVersion: SCHEMA_VERSION,
          migration: {
            source: STORAGE_KEY,
            migratedAt: Date.now(),
            status: "QUARANTINED",
            originalRecordId: record?.recordId || record?.id || null,
            reason: "INVALID_SCHEMA",
          },
          rawData: deepClone(record),
        });
        return null;
      })
      .filter(Boolean);

    const byId = new Map(output.map((record) => [record.id, record]));

    const sources = [];
    for (const key of LEGACY_STORAGE_KEYS) {
      const raw = W.store?.get?.(key, []);
      if (Array.isArray(raw)) sources.push({ key, records: raw });
    }

    function quarantine(raw, sourceKey, reason, originalRecordId) {
      const id = deterministicId(raw, "track-quarantine");
      if (byId.has(id)) {
        deduped++;
        return;
      }
      const q = {
        id,
        recordId: id,
        schemaVersion: SCHEMA_VERSION,
        migration: {
          source: sourceKey,
          migratedAt: Date.now(),
          status: "QUARANTINED",
          originalRecordId: originalRecordId ?? null,
          reason,
        },
        rawData: deepClone(raw),
      };
      quarantined.push(q);
      byId.set(id, q);
    }

    for (const source of sources) {
      for (const original of source.records) {
        const raw = deepClone(original);
        if (
          !raw ||
          typeof raw !== "object" ||
          Array.isArray(raw) ||
          ownDangerousKey(raw)
        ) {
          quarantine(raw, source.key, "INVALID_SCHEMA", null);
          continue;
        }
        if (
          typeof raw.schemaVersion === "string" &&
          !ACCEPTED_SCHEMA_VERSIONS.has(raw.schemaVersion)
        ) {
          quarantine(
            raw,
            source.key,
            "UNKNOWN_SCHEMA_VERSION",
            raw.recordId || raw.id || null,
          );
          continue;
        }
        if (source.key === "track_record_v0") {
          const stableId =
            typeof raw.recordId === "string"
              ? raw.recordId
              : deterministicId(
                  {
                    source: source.key,
                    symbol: raw.symbol || raw.asset || null,
                    createdAt: raw.createdAt || null,
                    analysisTimestamp: raw.analysisTimestamp || null,
                  },
                  "track-legacy",
                );
          const legacySnapshot = legacyV0Snapshot(raw);
          const migrated = {
            id: stableId,
            recordId: stableId,
            schemaVersion: SCHEMA_VERSION,
            createdAt: Number.isFinite(raw.createdAt)
              ? raw.createdAt
              : legacySnapshot.analysisTimestamp,
            asset: raw.symbol || raw.asset || "UNKNOWN",
            assetId: canonicalAssetId({
              assetId: raw.assetId || {
                symbol: raw.symbol || raw.asset || "UNKNOWN",
                name: raw.name || raw.symbol || raw.asset,
              },
            }),
            weaverSnapshot: legacySnapshot,
            userDecision: {
              action: USER_ACTIONS.has(raw.userDecision?.action)
                ? raw.userDecision.action
                : "NO_DECISION",
              notes: typeof raw.notes === "string" ? raw.notes : "",
              decisionTimestamp: null,
              linkedTransactionId: null,
            },
            outcome: {
              status: "UNKNOWN",
              observedPriceAtOutcome: null,
              outcomeTimestamp: null,
              entryTimestamp: null,
              exitTimestamp: null,
              userEntryPrice: null,
              userExitPrice: null,
              positionSize: null,
              realizedResult: null,
              realizedResultPct: null,
              resultCurrency: null,
              outcomeSource: "UNKNOWN",
              notes: "",
              holdingDurationMs: null,
            },
            revisions: [],
            migration: {
              source: source.key,
              migratedAt: Date.now(),
              status: "MIGRATED",
              originalRecordId: raw.recordId || null,
            },
          };
          const existing = byId.get(stableId);
          if (existing) {
            // Same narrow identity AND same projected content is a
            // true duplicate. Same identity with different content
            // is a conflict.
            if (
              snapshotSignature(existing.weaverSnapshot) ===
                snapshotSignature(legacySnapshot) &&
              immutableContentHash(existing.weaverSnapshot) ===
                immutableContentHash(legacySnapshot)
            ) {
              deduped++;
              continue;
            }
            const conflictId = `${stableId}-legacy-${immutableContentHash(legacySnapshot)}`;
            if (!byId.has(conflictId)) {
              migrated.id = conflictId;
              migrated.migration = {
                source: source.key,
                migratedAt: Date.now(),
                status: "CONFLICT",
                originalRecordId: stableId,
              };
              byId.set(conflictId, migrated);
              output.push(migrated);
              conflicts++;
            }
            continue;
          }
          byId.set(stableId, migrated);
          output.push(migrated);
          migratedLegacyId++;
          continue;
        }

        const originalId =
          typeof raw.recordId === "string"
            ? raw.recordId
            : typeof raw.id === "string"
              ? raw.id
              : null;
        const candidateId =
          originalId ||
          deterministicId({
            assetId: raw.assetId || raw.asset || null,
            createdAt: raw.createdAt || null,
            analysisTimestamp: raw.weaverSnapshot?.analysisTimestamp || null,
            raw,
          });
        const candidate = {
          ...raw,
          id: candidateId,
          schemaVersion: raw.schemaVersion || SCHEMA_VERSION,
        };
        const normalized = normalizeRecord(candidate);
        if (!normalized) {
          quarantine(raw, source.key, "INVALID_IMMUTABLE_SNAPSHOT", originalId);
          continue;
        }
        normalized.migration = {
          source: source.key,
          migratedAt: Date.now(),
          status: originalId ? "MIGRATED" : "MIGRATED_LEGACY_ID",
          originalRecordId: originalId,
        };
        const existing = byId.get(normalized.id);
        if (!existing) {
          byId.set(normalized.id, normalized);
          output.push(normalized);
          continue;
        }
        // Same narrow identity AND same projected content is a true
        // duplicate. Same identity with different content is a
        // conflict.
        if (
          snapshotSignature(existing.weaverSnapshot) ===
            snapshotSignature(normalized.weaverSnapshot) &&
          immutableContentHash(existing.weaverSnapshot) ===
            immutableContentHash(normalized.weaverSnapshot)
        ) {
          deduped++;
          continue;
        }
        const conflictId = `${normalized.id}-legacy-${immutableContentHash(normalized.weaverSnapshot)}`;
        if (!byId.has(conflictId)) {
          const conflictRecord = deepClone(normalized);
          conflictRecord.id = conflictId;
          conflictRecord.migration = {
            source: source.key,
            migratedAt: Date.now(),
            status: "CONFLICT",
            originalRecordId: normalized.id,
          };
          byId.set(conflictId, conflictRecord);
          output.push(conflictRecord);
          conflicts++;
        }
      }
    }

    const result = [...output, ...quarantined].filter(
      (record, index, list) =>
        list.findIndex((candidate) => candidate.id === record.id) === index,
    );
    if (persist) {
      const saved = save(result);
      if (!saved.ok) return saved;
    }
    return {
      ok: true,
      records: deepClone(result),
      quarantined: quarantined.length,
      migratedLegacyId,
      deduped,
      conflicts,
    };
  }

  function load() {
    try {
      const raw = W.store?.get?.(STORAGE_KEY, []);
      if (!Array.isArray(raw)) return [];
      return raw
        .map((record) => {
          if (
            record?.migration?.status === "QUARANTINED" &&
            typeof record.id === "string"
          )
            return deepClone(record);
          return normalizeRecord(record);
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function save(records) {
    try {
      W.store?.set?.(STORAGE_KEY, deepClone(records));
      return { ok: true };
    } catch (error) {
      const message =
        error?.name === "QuotaExceededError"
          ? "Track Record could not be saved. Local storage is full."
          : "Track Record could not be saved.";
      W.ui?.toast?.(message, "warn");
      return { ok: false, error: message };
    }
  }

  function all() {
    return deepClone(load());
  }
  function get(id) {
    return all().find((record) => record.id === id) || null;
  }

  function capture(analysis, metadata = {}) {
    if (!analysis || typeof analysis !== "object" || !analysis.asset)
      throw new Error("A complete Token Analysis result is required");
    const assetId = canonicalAssetId(analysis, metadata);
    const record = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      schemaVersion: SCHEMA_VERSION,
      recordId: null,
      createdAt: Date.now(),
      asset: analysis.asset,
      assetId,
      origin: metadata.origin === "gem-agent" ? "gem-agent" : "manual",
      weaverSnapshot: deepClone(analysis),
      userDecision: {
        action: "UNSET",
        notes: "",
        decisionTimestamp: null,
        linkedTransactionId: null,
      },
      outcome: {
        status: "UNKNOWN",
        observedPriceAtOutcome: null,
        outcomeTimestamp: null,
        entryTimestamp: null,
        exitTimestamp: null,
        userEntryPrice: null,
        userExitPrice: null,
        positionSize: null,
        realizedResult: null,
        realizedResultPct: null,
        resultCurrency: null,
        outcomeSource: "UNKNOWN",
        notes: "",
        holdingDurationMs: null,
      },
      revisions: [],
    };
    record.recordId = record.id;
    const result = save([record, ...load()]);
    if (!result.ok) throw new Error(result.error);
    return deepClone(record);
  }

  function createFromAnalysis(analysis, assetId, options = {}) {
    if (!analysis || typeof analysis !== "object") {
      throw new Error("createFromAnalysis: analysis object is required");
    }
    const resolvedAsset =
      (assetId && (assetId.symbol || assetId.name)) ||
      (typeof analysis.asset === "string" ? analysis.asset : null) ||
      (analysis.asset && (analysis.asset.symbol || analysis.asset.name)) ||
      analysis.symbol ||
      "UNKNOWN";
    const resolvedAssetId = assetId ||
      analysis.assetId || { symbol: resolvedAsset };
    const score = Number.isFinite(analysis.score)
      ? analysis.score
      : Number.isFinite(analysis.opportunityScore)
        ? analysis.opportunityScore
        : null;
    const normalized = {
      ...analysis,
      asset: resolvedAsset,
      assetId: resolvedAssetId,
      unifiedVerdict: analysis.unifiedVerdict || {
        score,
        confidence: analysis.confidence ?? null,
        scenario: analysis.scenario ?? null,
        domains: analysis.domains ?? null,
        methodologyVersion: analysis.methodologyVersion ?? null,
        evidenceVersion: analysis.scoringVersion ?? null,
      },
      evidenceQuality: analysis.evidenceQuality ?? null,
      evidence: analysis.evidence ?? null,
      methodologyVersion: analysis.methodologyVersion ?? null,
      scoringVersion: analysis.scoringVersion ?? null,
      analysisTimestamp: analysis.analysisTimestamp ?? null,
    };
    return capture(normalized, {
      assetId: resolvedAssetId,
      origin: options.origin,
    });
  }

  function createFromGemAlert({
    symbol,
    chainId,
    contractAddress,
    priceAtCapture,
    scenario,
    confidence,
    reasons,
    methodologyVersion,
  }) {
    if (!symbol || !chainId || !contractAddress) return null;
    const existing = all().find(
      (r) =>
        r.origin === "gem-agent" &&
        r.assetId?.chainId === chainId &&
        r.assetId?.contractAddress === contractAddress,
    );
    if (existing) return existing;

    const price = Number.isFinite(priceAtCapture) ? priceAtCapture : null;
    return createFromAnalysis(
      {
        asset: symbol,
        scenario: scenario || "Bullish scenario",
        confidence: Number.isFinite(confidence) ? confidence : null,
        explanation: Array.isArray(reasons) ? reasons.join("; ") : "",
        methodologyVersion: methodologyVersion || null,
        scoringVersion: methodologyVersion || null,
        priceAtCapture: price,
      },
      { chainId, contractAddress, symbol, name: symbol },
      { origin: "gem-agent" },
    );
  }

  async function fetchWithTimeout(url, timeoutMs = OUTCOME_FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function evaluateGemOutcomes(options = {}) {
    const force = options.force === true;

    const allGemRecords = all().filter((r) => r.origin === "gem-agent");
    const evaluable = (r) =>
      ["UNKNOWN", "OPEN", "REPORTED_FLAT"].includes(r.outcome.status) &&
      r.assetId?.contractAddress &&
      Number.isFinite(r.weaverSnapshot?.priceAtCapture);

    const pending = allGemRecords.filter(evaluable);

    if (!warnedUnevaluable) {
      const unevaluable = allGemRecords.filter(
        (r) =>
          ["UNKNOWN", "OPEN", "REPORTED_FLAT"].includes(r.outcome.status) &&
          r.assetId?.contractAddress &&
          !Number.isFinite(r.weaverSnapshot?.priceAtCapture),
      );
      if (unevaluable.length) {
        console.warn(
          "[TrackRecord]",
          unevaluable.length,
          "gem-agent record(s) have no capture price and cannot be evaluated.",
        );
      }
      warnedUnevaluable = true;
    }

    if (!pending.length) return { checked: 0, updated: 0 };

    const signature = pending
      .map((r) => r.id)
      .sort()
      .join(",");
    const now = Date.now();
    if (
      !force &&
      signature === lastOutcomeSignature &&
      now - lastOutcomeCheck < OUTCOME_COOLDOWN_MS
    ) {
      return { checked: 0, updated: 0, skipped: "cooldown" };
    }
    lastOutcomeSignature = signature;
    lastOutcomeCheck = now;

    const byChain = {};
    pending.forEach((r) => {
      (byChain[r.assetId.chainId] ||= []).push(r);
    });

    let updated = 0;
    for (const [chainId, records] of Object.entries(byChain)) {
      const addresses = records.map((r) => r.assetId.contractAddress);
      let pairs = [];
      try {
        const res = await fetchWithTimeout(
          "https://api.dexscreener.com/latest/dex/tokens/" +
            addresses.join(","),
        );
        if (!res.ok) {
          console.warn(
            "[TrackRecord] Outcome fetch returned HTTP",
            res.status,
            "for chain",
            chainId,
          );
          continue;
        }
        const data = await res.json();
        pairs = Array.isArray(data) ? data : data.pairs || [];
      } catch (e) {
        console.warn(
          "[TrackRecord] Outcome fetch failed for chain",
          chainId,
          ":",
          e.message,
        );
        continue;
      }

      for (const record of records) {
        const pair = pairs.find(
          (p) =>
            p.chainId === chainId &&
            p.baseToken?.address?.toLowerCase() ===
              record.assetId.contractAddress.toLowerCase(),
        );
        const currentPrice = pair ? parseFloat(pair.priceUsd) : null;
        if (!Number.isFinite(currentPrice)) continue;

        const entry = record.weaverSnapshot.priceAtCapture;
        const pct = ((currentPrice - entry) / entry) * 100;
        const status =
          pct > 2
            ? "REPORTED_GAIN"
            : pct < -2
              ? "REPORTED_LOSS"
              : "REPORTED_FLAT";

        const written = updateOutcome(record.id, {
          status,
          observedPriceAtOutcome: currentPrice,
          userEntryPrice: entry,
          userExitPrice: currentPrice,
          positionSize: 1,
          entryTimestamp: record.createdAt,
          outcomeTimestamp: Date.now(),
          outcomeSource: "MARKET_OBSERVATION",
        });
        if (written) updated++;
      }
    }
    return { checked: pending.length, updated };
  }

  function validChange(path, value) {
    if (!MUTABLE_FIELDS.has(path)) return false;
    if (path === "userDecision.action")
      return typeof value === "string" && USER_ACTIONS.has(value);
    if (path === "outcome.status")
      return typeof value === "string" && OUTCOME_STATUS.has(value);
    if (
      path === "userDecision.notes" ||
      path === "outcome.resultCurrency" ||
      path === "outcome.notes"
    )
      return value === null || typeof value === "string";
    if (path === "outcome.outcomeSource")
      return typeof value === "string" && OUTCOME_SOURCES.has(value);
    if (path === "userDecision.linkedTransactionId")
      return value === null || typeof value === "string";
    if (
      path === "userDecision.decisionTimestamp" ||
      path === "outcome.outcomeTimestamp" ||
      path === "outcome.entryTimestamp" ||
      path === "outcome.exitTimestamp"
    )
      return (
        value === null ||
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value))
      );
    return (
      value === null ||
      (typeof value === "number" && Number.isFinite(value) && value >= 0)
    );
  }

  function update(id, changes = {}, reason = "") {
    if (!reason || typeof reason !== "string" || !reason.trim())
      return { ok: false, error: "Revision reason is required" };
    if (
      !changes ||
      typeof changes !== "object" ||
      Array.isArray(changes) ||
      ownDangerousKey(changes)
    )
      return { ok: false, error: "Invalid changes object" };
    const records = load();
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) return { ok: false, error: "Record not found" };
    const keys = Object.keys(changes);
    if (!keys.length) return { ok: false, error: "No changes supplied" };
    for (const path of keys)
      if (!validChange(path, changes[path]))
        return { ok: false, error: `Immutable or invalid field: ${path}` };
    const record = records[index];
    const next = deepClone(record);
    for (const path of keys) {
      const [section, field] = path.split(".");
      const previousValue = next[section][field];
      next[section][field] = deepClone(changes[path]);
      next.revisions.push({
        at: new Date().toISOString(),
        field: path,
        previousValue: deepClone(previousValue),
        newValue: deepClone(changes[path]),
        reason: reason.trim(),
      });
      if (next.revisions.length > MAX_REVISIONS)
        next.revisions = next.revisions.slice(-MAX_REVISIONS);
    }
    const calculated = calculateOutcome(
      next.outcome,
      next.userDecision.decisionTimestamp,
    );
    next.outcome.realizedResult = calculated.realizedResult;
    next.outcome.realizedResultPct = calculated.realizedResultPct;
    next.outcome.holdingDurationMs = calculated.holdingDurationMs;
    const result = save(
      records.map((item, itemIndex) => (itemIndex === index ? next : item)),
    );
    return result.ok ? { ok: true, record: deepClone(next) } : result;
  }

  function remove(id) {
    const records = load();
    const next = records.filter((record) => record.id !== id);
    return next.length === records.length
      ? { ok: false, error: "Record not found" }
      : save(next);
  }

  function updateDecision(recordId, decisionPatch = {}) {
    const changes = {};
    for (const key of [
      "action",
      "notes",
      "decisionTimestamp",
      "linkedTransactionId",
    ]) {
      if (Object.prototype.hasOwnProperty.call(decisionPatch, key))
        changes[`userDecision.${key}`] = decisionPatch[key];
    }
    const result = update(recordId, changes, "User decision update");
    if (!result.ok) {
      console.warn("[TrackRecord] updateDecision failed:", result.error);
      return null;
    }
    return result.record || null;
  }

  function updateOutcome(recordId, outcomePatch = {}) {
    const changes = {};
    for (const key of [
      "status",
      "observedPriceAtOutcome",
      "outcomeTimestamp",
      "entryTimestamp",
      "exitTimestamp",
      "userEntryPrice",
      "userExitPrice",
      "positionSize",
      "resultCurrency",
      "outcomeSource",
      "notes",
    ]) {
      if (Object.prototype.hasOwnProperty.call(outcomePatch, key))
        changes[`outcome.${key}`] = outcomePatch[key];
    }
    const result = update(recordId, changes, "Observed outcome update");
    if (!result.ok) {
      console.warn("[TrackRecord] updateOutcome failed:", result.error);
      return null;
    }
    return result.record || null;
  }

  function linkTransaction(recordId, transactionId) {
    return updateDecision(recordId, { linkedTransactionId: transactionId });
  }
  function deleteRecord(recordId) {
    return remove(recordId).ok;
  }

  function escape(value) {
    return W.fmt?.escapeHTML ? W.fmt.escapeHTML(value) : String(value ?? "");
  }
  function csvCell(value) {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function buildCSV() {
    const headers = [
      "Record ID",
      "Asset ID",
      "Symbol",
      "Created At",
      "Methodology",
      "Scenario",
      "Evidence",
      "Confidence",
      "User Decision",
      "User Notes",
      "Outcome Status",
      "Observed Price",
      "Entry Price",
      "Exit Price",
      "Position Size",
      "Realized Result",
      "Result %",
      "Currency",
      "Outcome Source",
      "Outcome Notes",
    ];
    const rows = load()
      .map((record) => {
        if (record.migration?.status === "QUARANTINED") return null;
        const snapshot = record.weaverSnapshot || {};
        const verdict = snapshot.unifiedVerdict || {};
        const outcome = record.outcome;
        return [
          record.id,
          record.assetId.coingeckoId ||
            record.assetId.contractAddress ||
            record.assetId.symbol,
          record.assetId.symbol,
          record.createdAt,
          verdict.methodologyVersion || "",
          snapshot.scenario || snapshot.verdict || "",
          snapshot.evidenceQuality?.status || verdict.evidence?.status || "",
          snapshot.confidence,
          record.userDecision.action,
          record.userDecision.notes,
          outcome.status,
          outcome.observedPriceAtOutcome,
          outcome.userEntryPrice,
          outcome.userExitPrice,
          outcome.positionSize,
          outcome.realizedResult,
          outcome.realizedResultPct,
          outcome.resultCurrency,
          outcome.outcomeSource,
          outcome.notes,
        ]
          .map(csvCell)
          .join(",");
      })
      .filter(Boolean);
    return [headers.map(csvCell).join(","), ...rows].join("\n");
  }

  function exportCSV() {
    const csv = buildCSV();
    if (
      typeof Blob !== "undefined" &&
      typeof URL !== "undefined" &&
      document?.createElement
    ) {
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `weaver-track-record-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
    return csv;
  }

  function transactionOptions(selected) {
    return (W.portfolio?.txs?.() || [])
      .map((tx) => {
        const id = String(tx.id || "");
        return `<option value="${escape(id)}" ${id === selected ? "selected" : ""}>${escape(`${tx.type || "Transaction"} ${tx.symbol || "asset"}`)}</option>`;
      })
      .join("");
  }

  async function render(view) {
    try {
      await evaluateGemOutcomes();
    } catch (e) {
      console.warn("[TrackRecord] Gem outcome evaluation skipped:", e.message);
    }
    const current = all();
    const gemRecords = current
      .filter((r) => r.origin === "gem-agent")
      .sort((a, b) => b.createdAt - a.createdAt);
    const manualRecords = current.filter((r) => r.origin !== "gem-agent");

    const badgeFor = (status) =>
      status === "REPORTED_GAIN"
        ? ["bullish", "Gain"]
        : status === "REPORTED_LOSS"
          ? ["bearish", "Loss"]
          : status === "REPORTED_FLAT"
            ? ["neutral", "Flat"]
            : ["neutral", "Pending"];

    const resolved = gemRecords.filter((r) =>
      ["REPORTED_GAIN", "REPORTED_LOSS", "REPORTED_FLAT"].includes(
        r.outcome.status,
      ),
    );
    const wins = resolved.filter(
      (r) => r.outcome.status === "REPORTED_GAIN",
    ).length;
    const winRate = resolved.length
      ? Math.round((wins / resolved.length) * 100)
      : null;

    const publicSection = `
      <div class="card">
        <div class="flex-between"><h3>🌐 Weaver's Public Track Record</h3></div>
        <p class="muted small">Every Gem Agent call, tracked automatically — wins and losses shown equally. These are Weaver's own market calls, never a user's personal trades.</p>
        <p class="small">
          ${
            resolved.length
              ? `<b>${wins}W / ${resolved.length - wins}L or flat</b> · Win rate ${winRate}% of ${resolved.length} resolved`
              : "No resolved calls yet."
          }
          ${gemRecords.length - resolved.length > 0 ? ` · ${gemRecords.length - resolved.length} pending` : ""}
        </p>
        ${
          gemRecords.length
            ? gemRecords
                .slice(0, 20)
                .map((r) => {
                  const [cls, label] = badgeFor(r.outcome.status);
                  const pct = r.outcome.realizedResultPct;
                  return `<div class="kv-row"><span>${escape(r.assetId.symbol)} (${escape(r.assetId.chainId)}) · ${new Date(r.createdAt).toLocaleDateString()}</span><span class="tag ${cls}">${label}${pct !== null && pct !== undefined ? " " + (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%" : ""}</span></div>`;
                })
                .join("")
            : '<p class="muted small">No Gem Agent calls captured yet.</p>'
        }
      </div>`;

    const manualSection = `<div class="card"><div class="flex-between"><h3>Your Analyses</h3><button class="btn tiny" data-action="export">Export CSV</button></div><p class="muted small">Historical Weaver analyses are immutable. Decisions and outcomes are stored separately; this view does not fetch current market data.</p></div><div id="track-record-list">${manualRecords.length ? manualRecords.map((record) => `<article class="card track-record-entry" data-record-id="${escape(record.id)}"><h4>Weaver's Analysis — ${escape(record.assetId.symbol)}</h4><p class="small muted">${escape(record.weaverSnapshot.explanation || "No explanation captured.")}</p><p class="small">Scenario: ${escape(record.weaverSnapshot.scenario || record.weaverSnapshot.verdict || "Unknown")} · Confidence: ${record.weaverSnapshot.confidence === null || record.weaverSnapshot.confidence === undefined ? "not stated" : escape(record.weaverSnapshot.confidence + "%")}</p><h4>Your Decision</h4><select data-field="userDecision.action"><option value="NO_DECISION" ${record.userDecision.action === "NO_DECISION" ? "selected" : ""}>Not recorded</option><option value="WATCH" ${record.userDecision.action === "WATCH" ? "selected" : ""}>Watch</option><option value="CONSIDER" ${record.userDecision.action === "CONSIDER" ? "selected" : ""}>Consider</option><option value="ENTERED" ${record.userDecision.action === "ENTERED" ? "selected" : ""}>Entered decision</option><option value="NOT_ENTERED" ${record.userDecision.action === "NOT_ENTERED" ? "selected" : ""}>Did not enter</option><option value="HOLD" ${record.userDecision.action === "HOLD" ? "selected" : ""}>Held / waited</option></select><select data-field="userDecision.linkedTransactionId"><option value="">No linked transaction</option>${transactionOptions(record.userDecision.linkedTransactionId)}</select><textarea class="input mt" data-field="userDecision.notes" rows="2">${escape(record.userDecision.notes)}</textarea><h4>Outcome</h4><select data-field="outcome.status"><option value="UNKNOWN" ${record.outcome.status === "UNKNOWN" ? "selected" : ""}>Not reported</option><option value="REPORTED_GAIN" ${record.outcome.status === "REPORTED_GAIN" ? "selected" : ""}>Reported gain</option><option value="REPORTED_LOSS" ${record.outcome.status === "REPORTED_LOSS" ? "selected" : ""}>Reported loss</option><option value="REPORTED_FLAT" ${record.outcome.status === "REPORTED_FLAT" ? "selected" : ""}>Reported flat</option></select><div class="grid-2"><input class="input" data-field="outcome.userEntryPrice" type="number" min="0" step="any" value="${record.outcome.userEntryPrice ?? ""}" placeholder="Entry price"><input class="input" data-field="outcome.userExitPrice" type="number" min="0" step="any" value="${record.outcome.userExitPrice ?? ""}" placeholder="Exit price"><input class="input" data-field="outcome.positionSize" type="number" min="0" step="any" value="${record.outcome.positionSize ?? ""}" placeholder="Position size"><input class="input" data-field="outcome.resultCurrency" value="${escape(record.outcome.resultCurrency || "")}" placeholder="Currency"></div><input class="input mt" data-field="outcome.outcomeSource" value="${escape(record.outcome.outcomeSource || "")}" placeholder="Outcome source (e.g. user-reported)"><input class="input mt" data-field="revisionReason" placeholder="Reason for update (required)"><button class="btn primary tiny mt" data-action="save">Save update</button><button class="btn danger tiny mt" data-action="delete">Delete record</button></article>`).join("") : '<p class="muted">No historical analyses captured yet.</p>'}</div>`;

    view.innerHTML = publicSection + manualSection;
    view
      .querySelector("[data-action='export']")
      ?.addEventListener("click", exportCSV);
    view.querySelectorAll("[data-action='save']").forEach(
      (button) =>
        (button.onclick = () => {
          const entry = button.closest("[data-record-id]");
          const changes = {};
          entry.querySelectorAll("[data-field]").forEach((field) => {
            const value = field.value;
            if (
              field.dataset.field.includes("Price") ||
              field.dataset.field === "outcome.positionSize"
            )
              changes[field.dataset.field] =
                value === "" ? null : Number(value);
            else changes[field.dataset.field] = value || null;
          });
          const result = update(
            entry.dataset.recordId,
            changes,
            entry.querySelector("[data-field='revisionReason']")?.value || "",
          );
          if (!result.ok) return W.ui?.toast?.(result.error, "warn");
          W.ui?.toast?.(
            "Track Record updated; historical analysis unchanged.",
            "ok",
          );
          render(view);
        }),
    );
    view.querySelectorAll("[data-action='delete']").forEach(
      (button) =>
        (button.onclick = () => {
          const entry = button.closest("[data-record-id]");
          const result = remove(entry.dataset.recordId);
          if (result.ok) render(view);
        }),
    );
  }

  try {
    migrate();
  } catch (error) {
    console.warn("[TrackRecord] Migration deferred:", error.message);
  }

  // ── Summary for the Evidence Drawer ─────────────────────────
  //
  // Produces a one-line summary of this user's Track Record for a
  // given asset identity. Called by token-analysis.js when opening
  // the drawer. Read-only: does not mutate any record.
  //
  // Returns null when:
  //   - the track record has no matching records
  //   - the identity has no usable key (no symbol, address, or id)
  //   - any internal error occurs
  //
  // The caller treats null as "omit the line", not as "no history".
  // A user with zero recorded decisions has no line — Weaver does
  // not fabricate a negative claim.
  function summariseForAsset(identity = {}) {
    try {
      const records = all();
      if (!Array.isArray(records) || !records.length) return null;

      const symbol =
        typeof identity.symbol === "string"
          ? identity.symbol.trim().toUpperCase()
          : null;
      const address =
        typeof identity.contractAddress === "string"
          ? identity.contractAddress.trim().toLowerCase()
          : null;
      const coingeckoId =
        typeof identity.coingeckoId === "string"
          ? identity.coingeckoId.trim().toLowerCase()
          : null;

      if (!symbol && !address && !coingeckoId) return null;

      const matches = records.filter((rec) => {
        if (!rec || typeof rec !== "object") return false;
        const recSymbol =
          typeof rec.symbol === "string"
            ? rec.symbol.trim().toUpperCase()
            : typeof rec.asset === "string"
              ? rec.asset.trim().toUpperCase()
              : null;
        if (symbol && recSymbol === symbol) return true;
        const recCg =
          typeof rec.coingeckoId === "string"
            ? rec.coingeckoId.trim().toLowerCase()
            : null;
        if (coingeckoId && recCg === coingeckoId) return true;
        const recAddr =
          typeof rec.contractAddress === "string"
            ? rec.contractAddress.trim().toLowerCase()
            : null;
        if (address && recAddr === address) return true;
        return false;
      });

      if (!matches.length) return null;

      const total = matches.length;
      // A record has a decision only when the user actually recorded one.
      // The default value is "NO_DECISION", which is stored but does not
      // represent a decision the user made.
      const withDecision = matches.filter(
        (m) =>
          m.userDecision &&
          typeof m.userDecision === "object" &&
          typeof m.userDecision.action === "string" &&
          m.userDecision.action !== "NO_DECISION",
      ).length;

      // A record is resolved only when the user reported an outcome.
      // The existence of holdingDurationMs is NOT a resolution signal —
      // it is present on every record (possibly as null) because it is
      // computed from entry/exit timestamps whenever they exist.
      const resolvedStatuses = new Set([
        "REPORTED_GAIN",
        "REPORTED_LOSS",
        "REPORTED_FLAT",
      ]);
      const withOutcome = matches.filter(
        (m) =>
          m.outcome &&
          typeof m.outcome === "object" &&
          resolvedStatuses.has(m.outcome.status),
      ).length;

      const noun = total === 1 ? "record" : "records";
      let text = `${total} ${noun} for this asset`;
      if (withDecision > 0 && withDecision < total) {
        text += ` — ${withDecision} with a recorded decision`;
      } else if (withDecision === total && total > 0) {
        text += " — all have a recorded decision";
      }
      if (withOutcome > 0) {
        text += `, ${withOutcome} resolved`;
      }
      return text;
    } catch (e) {
      console.warn("[TrackRecord] summariseForAsset failed:", e && e.message);
      return null;
    }
  }

  return {
    STORAGE_KEY,
    SCHEMA_VERSION,
    MUTABLE_FIELDS,
    all,
    get,
    getAll: all,
    getById: get,
    capture,
    createFromAnalysis,
    createFromGemAlert,
    evaluateGemOutcomes,
    update,
    updateDecision,
    updateOutcome,
    linkTransaction,
    remove,
    deleteRecord,
    migrate,
    calculateOutcome,
    normalizeRecord,
    buildCSV,
    exportCSV,
    render,
    summariseForAsset,
    _internal: { analysisProjection, immutableContentHash, contentHash },
  };
})();

console.log("[TrackRecord] Module loaded (track-record-v2.1).");
