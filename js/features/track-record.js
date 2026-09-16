// ===============================================================
//         Track Record Module — v2.1 (Corrected)
// ===============================================================

window.W = window.W || {};

W.trackRecord = (() => {
  const STORAGE_KEY = "track_record";
  const SCHEMA_VERSION = "track-record-v1";
  const MAX_REVISIONS = 100;

  // ── Legacy migration sources ───────────────────────────────
  //   track_record_v0  — the pre-v2.1 Track Record shape emitted by
  //                      the original Token Analysis "capture"
  //                      prototype. Records carry { symbol,
  //                      createdAt, opportunityScore, confidence,
  //                      notes } at the top level (no recordId, no
  //                      schemaVersion).
  const LEGACY_KEYS = ["track_record_v0"];

  // ── Enum whitelists ────────────────────────────────────────
  const ACTIONS = [
    "UNSET",
    "NO_DECISION",
    "WATCH",
    "CONSIDER",
    "ENTERED",
    "EXITED",
    "SKIPPED",
  ];
  const OUTCOME_STATUS = ["OPEN", "CLOSED", "UNKNOWN"];
  const OUTCOME_SOURCE = [
    "USER_ENTERED",
    "PORTFOLIO_TRANSACTION",
    "MARKET_OBSERVATION",
    "UNKNOWN",
  ];
  const EVIDENCE_QUALITY = ["SUFFICIENT", "PARTIAL", "INSUFFICIENT", "UNKNOWN"];
  const SCENARIO_CLASS = ["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"];
  const KNOWN_SCHEMA_VERSIONS = new Set(["track-record-v1"]);

  // ── Deterministic content hash (cyrb53) ────────────────────
  function stableHash(input, seed = 0) {
    const str = String(input || "");
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return n.toString(36);
  }

  function newId() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return (
      "tr-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function validEnum(value, whitelist, fallback) {
    return whitelist.includes(value) ? value : fallback;
  }

  // ── Analysis normalization ─────────────────────────────────
  // options.fallbackTimestamp makes normalization deterministic for
  // legacy records — otherwise the same input would get a different
  // analysisTimestamp (Date.now()) on each migration run, defeating
  // content-equality checks.
  function normalizeAnalysis(analysis, options = {}) {
    const a = analysis || {};
    const fallbackTs = options.fallbackTimestamp;

    const unified = a.unifiedVerdict || a.verdict || {};
    const ta = a.technicalAnalysis || a.technicals || {};
    const fa =
      a.fundamentalAssessment || a.fundamental || a.fundamentalReport || {};
    const sa = a.securityAssessment || a.shield || {};
    const sc = a.scenario || {};
    const ev = a.evidence || {};

    let domains = {};
    if (
      unified.domains &&
      typeof unified.domains === "object" &&
      !Array.isArray(unified.domains)
    ) {
      domains = { ...unified.domains };
    } else if (Array.isArray(unified.domains)) {
      unified.domains.forEach((d) => {
        if (d && typeof d === "object" && d.name) {
          domains[String(d.name).toLowerCase()] = { ...d };
        }
      });
    }

    const analysisTimestamp =
      typeof a.analysisTimestamp === "number"
        ? a.analysisTimestamp
        : typeof fallbackTs === "number"
          ? fallbackTs
          : Date.now();

    return {
      asset: typeof a.asset === "string" ? a.asset : null,
      methodologyVersion: a.methodologyVersion ?? a.methodology ?? null,
      scoringVersion: a.scoringVersion ?? a.scoreVersion ?? null,
      evidenceBuilderVersion: a.evidenceBuilderVersion ?? null,
      analysisTimestamp,

      unifiedVerdict: {
        score:
          typeof unified.score === "number"
            ? unified.score
            : typeof a.opportunityScore === "number"
              ? a.opportunityScore
              : typeof a.score === "number"
                ? a.score
                : null,
        confidence:
          typeof unified.confidence === "number"
            ? unified.confidence
            : typeof a.confidence === "number"
              ? a.confidence
              : null,
        evidenceQuality: validEnum(
          unified.evidenceQuality,
          EVIDENCE_QUALITY,
          "UNKNOWN",
        ),
        domains,
      },

      technicalAnalysis: {
        score: typeof ta.score === "number" ? ta.score : null,
        bias: typeof ta.bias === "string" ? ta.bias : null,
        rsi: typeof ta.rsi === "number" ? ta.rsi : null,
        trend: typeof ta.trend === "string" ? ta.trend : null,
        confidence: typeof ta.confidence === "number" ? ta.confidence : null,
        available:
          typeof ta.available === "boolean" ? ta.available : ta.score != null,
      },

      fundamentalAssessment: {
        score: typeof fa.score === "number" ? fa.score : null,
        bias: typeof fa.bias === "string" ? fa.bias : null,
        available:
          typeof fa.available === "boolean" ? fa.available : fa.score != null,
      },

      securityAssessment: {
        riskScore: typeof sa.riskScore === "number" ? sa.riskScore : null,
        riskLevel:
          typeof sa.riskLevel === "string"
            ? sa.riskLevel
            : Array.isArray(sa.riskLevel)
              ? sa.riskLevel[0]
              : null,
        source: typeof sa.source === "string" ? sa.source : null,
        available:
          typeof sa.available === "boolean"
            ? sa.available
            : sa.riskScore != null,
      },

      scenario: {
        classification: validEnum(sc.classification, SCENARIO_CLASS, "UNKNOWN"),
        strength: typeof sc.strength === "number" ? sc.strength : null,
        reasoning: Array.isArray(sc.reasoning) ? sc.reasoning.slice() : [],
        limitations: Array.isArray(sc.limitations)
          ? sc.limitations.slice()
          : [],
      },

      evidence: {
        supporting: Array.isArray(ev.supporting)
          ? ev.supporting.slice()
          : Array.isArray(a.bullishEvidence)
            ? a.bullishEvidence.slice()
            : [],
        contradicting: Array.isArray(ev.contradicting)
          ? ev.contradicting.slice()
          : Array.isArray(a.bearishEvidence)
            ? a.bearishEvidence.slice()
            : [],
        missing: Array.isArray(ev.missing) ? ev.missing.slice() : [],
      },
    };
  }

  function normalizeAssetId(asset) {
    const a = asset || {};
    return {
      chainId: typeof a.chainId === "string" ? a.chainId : null,
      contractAddress:
        typeof a.contractAddress === "string" ? a.contractAddress : null,
      symbol: typeof a.symbol === "string" ? a.symbol : null,
      coingeckoId: typeof a.coingeckoId === "string" ? a.coingeckoId : null,
      name: typeof a.name === "string" ? a.name : null,
    };
  }

  // ── Immutable snapshot guard ───────────────────────────────
  const IMMUTABLE_TOP = [
    "recordId",
    "createdAt",
    "weaverSnapshot",
    "schemaVersion",
  ];

  function patchRecord(record, patch) {
    const next = { ...record };

    for (const key of Object.keys(patch)) {
      if (IMMUTABLE_TOP.includes(key)) {
        console.warn(
          `[TrackRecord] Rejected mutation of immutable field: ${key}`,
        );
        continue;
      }
      if (key === "userDecision") {
        next.userDecision = normalizeDecision({
          ...next.userDecision,
          ...patch.userDecision,
        });
        continue;
      }
      if (key === "outcome") {
        next.outcome = normalizeOutcome({ ...next.outcome, ...patch.outcome });
        continue;
      }
      if (
        [
          "displaySymbol",
          "displayName",
          "assetId",
          "revisions",
          "migration",
          "updatedAt",
        ].includes(key)
      ) {
        next[key] = patch[key];
      }
    }
    return next;
  }

  function normalizeDecision(d, defaultAction = "NO_DECISION") {
    const x = d || {};
    return {
      action: validEnum(x.action, ACTIONS, defaultAction),
      decisionTimestamp:
        typeof x.decisionTimestamp === "number" ? x.decisionTimestamp : null,
      notes: typeof x.notes === "string" ? x.notes : "",
      linkedTransactionId:
        typeof x.linkedTransactionId === "string"
          ? x.linkedTransactionId
          : null,
      updatedAt: typeof x.updatedAt === "number" ? x.updatedAt : null,
    };
  }

  function normalizeOutcome(o) {
    const x = o || {};
    return {
      status: validEnum(x.status, OUTCOME_STATUS, "UNKNOWN"),
      observedPriceAtOutcome:
        typeof x.observedPriceAtOutcome === "number"
          ? x.observedPriceAtOutcome
          : null,
      entryTimestamp:
        typeof x.entryTimestamp === "number" ? x.entryTimestamp : null,
      exitTimestamp:
        typeof x.exitTimestamp === "number" ? x.exitTimestamp : null,
      userEntryPrice:
        typeof x.userEntryPrice === "number" ? x.userEntryPrice : null,
      userExitPrice:
        typeof x.userExitPrice === "number" ? x.userExitPrice : null,
      positionSize: typeof x.positionSize === "number" ? x.positionSize : null,
      realizedResult:
        typeof x.realizedResult === "number" ? x.realizedResult : null,
      realizedResultPct:
        typeof x.realizedResultPct === "number" ? x.realizedResultPct : null,
      resultCurrency:
        typeof x.resultCurrency === "string" ? x.resultCurrency : null,
      holdingDurationMs:
        typeof x.holdingDurationMs === "number" ? x.holdingDurationMs : null,
      outcomeSource: validEnum(x.outcomeSource, OUTCOME_SOURCE, "UNKNOWN"),
    };
  }

  function recomputeOutcome(outcome) {
    const o = { ...outcome };

    if (
      o.userEntryPrice == null ||
      o.userExitPrice == null ||
      o.userEntryPrice === 0
    ) {
      o.realizedResultPct = null;
    } else {
      o.realizedResultPct =
        ((o.userExitPrice - o.userEntryPrice) / o.userEntryPrice) * 100;
    }

    if (
      o.userEntryPrice == null ||
      o.userExitPrice == null ||
      o.positionSize == null
    ) {
      o.realizedResult = null;
    } else {
      o.realizedResult = (o.userExitPrice - o.userEntryPrice) * o.positionSize;
    }

    if (
      o.entryTimestamp != null &&
      o.exitTimestamp != null &&
      o.exitTimestamp >= o.entryTimestamp
    ) {
      o.holdingDurationMs = o.exitTimestamp - o.entryTimestamp;
    } else {
      o.holdingDurationMs = null;
    }

    return o;
  }

  function loadAll() {
    const raw = W.store.get(STORAGE_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (r) => r && typeof r === "object" && typeof r.recordId === "string",
    );
  }

  function saveAll(records) {
    W.store.set(STORAGE_KEY, records);
  }

  // ── Public CRUD ────────────────────────────────────────────

  function createFromAnalysis(analysis, asset) {
    if (!analysis || typeof analysis !== "object") {
      throw new Error("createFromAnalysis requires an analysis object");
    }

    const assetId = normalizeAssetId(asset);
    const snapshot = normalizeAnalysis(analysis);
    const now = Date.now();

    const record = {
      schemaVersion: SCHEMA_VERSION,
      recordId: newId(),
      assetId,
      displaySymbol:
        assetId.symbol ||
        (analysis.asset ? String(analysis.asset).toUpperCase() : "UNKNOWN"),
      displayName: assetId.name || analysis.asset || "Unknown",
      createdAt: now,
      weaverSnapshot: snapshot,
      userDecision: normalizeDecision({}, "UNSET"),
      outcome: normalizeOutcome({}),
      revisions: [],
    };

    const records = loadAll();
    records.unshift(record);
    saveAll(records);
    return record;
  }

  function getAll() {
    return loadAll();
  }

  function getById(recordId) {
    return loadAll().find((r) => r.recordId === recordId) || null;
  }

  function updateDecision(recordId, decisionPatch) {
    const records = loadAll();
    const idx = records.findIndex((r) => r.recordId === recordId);
    if (idx === -1) return null;
    const existing = records[idx];
    const patch = {
      userDecision: {
        ...existing.userDecision,
        ...decisionPatch,
        updatedAt: Date.now(),
      },
    };
    records[idx] = patchRecord(existing, patch);
    saveAll(records);
    return records[idx];
  }

  function updateOutcome(recordId, outcomePatch) {
    const records = loadAll();
    const idx = records.findIndex((r) => r.recordId === recordId);
    if (idx === -1) return null;
    const existing = records[idx];
    const mergedOutcome = recomputeOutcome({
      ...existing.outcome,
      ...outcomePatch,
    });
    records[idx] = patchRecord(existing, { outcome: mergedOutcome });
    saveAll(records);
    return records[idx];
  }

  function linkTransaction(recordId, transactionId) {
    return updateDecision(recordId, { linkedTransactionId: transactionId });
  }

  function deleteRecord(recordId) {
    const records = loadAll().filter((r) => r.recordId !== recordId);
    saveAll(records);
    return true;
  }

  function exportCSV() {
    const records = loadAll();
    const headers = [
      "recordId",
      "createdAt",
      "symbol",
      "name",
      "verdict_score",
      "verdict_confidence",
      "evidence_quality",
      "scenario_classification",
      "decision_action",
      "decision_notes",
      "outcome_status",
      "outcome_source",
      "entry_price",
      "exit_price",
      "result",
      "result_pct",
      "methodology_version",
    ];

    const rows = records.map((r) => [
      r.recordId,
      new Date(r.createdAt).toISOString(),
      r.displaySymbol,
      r.displayName,
      r.weaverSnapshot?.unifiedVerdict?.score,
      r.weaverSnapshot?.unifiedVerdict?.confidence,
      r.weaverSnapshot?.unifiedVerdict?.evidenceQuality,
      r.weaverSnapshot?.scenario?.classification,
      r.userDecision?.action,
      r.userDecision?.notes || "",
      r.outcome?.status,
      r.outcome?.outcomeSource,
      r.outcome?.userEntryPrice,
      r.outcome?.userExitPrice,
      r.outcome?.realizedResult,
      r.outcome?.realizedResultPct,
      r.weaverSnapshot?.methodologyVersion,
    ]);

    const csvEscape = (v) => {
      if (v == null) return "";
      let s = String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    const lines = [headers.map(csvEscape).join(",")];
    rows.forEach((row) => lines.push(row.map(csvEscape).join(",")));
    return lines.join("\n");
  }

  // ── Migration ──────────────────────────────────────────────

  function migrate() {
    const canonical = loadAll();
    const canonicalById = new Map(canonical.map((r) => [r.recordId, r]));
    const migrationSummary = {
      migrated: 0,
      conflicts: 0,
      migratedLegacyId: 0,
      quarantined: 0,
      deduped: 0,
    };

    const runTimestamp = Date.now();

    const legacyCandidates = [];
    for (const key of LEGACY_KEYS) {
      const data = W.store.get(key, null);
      if (Array.isArray(data)) {
        data.forEach((r) => legacyCandidates.push({ source: key, raw: r }));
      }
    }

    for (const candidate of legacyCandidates) {
      const { raw, source } = candidate;

      // ── Malformed ────────────────────────────────────────
      if (!raw || typeof raw !== "object") {
        const quarantineId =
          "track-quarantine-" +
          stableHash(JSON.stringify(raw ?? null) + "|" + source);
        if (canonicalById.has(quarantineId)) {
          migrationSummary.deduped++;
          continue;
        }
        const q = quarantineRecord(raw, source, "INVALID_SCHEMA", quarantineId);
        canonical.push(q);
        canonicalById.set(quarantineId, q);
        migrationSummary.quarantined++;
        continue;
      }

      // ── Unknown schema version ───────────────────────────
      if (
        typeof raw.schemaVersion === "string" &&
        !KNOWN_SCHEMA_VERSIONS.has(raw.schemaVersion)
      ) {
        const quarantineId =
          "track-quarantine-" +
          stableHash(JSON.stringify(raw) + "|" + source + "|UNKNOWN_SCHEMA");
        if (canonicalById.has(quarantineId)) {
          migrationSummary.deduped++;
          continue;
        }
        const q = quarantineRecord(
          raw,
          source,
          "UNKNOWN_SCHEMA_VERSION",
          quarantineId,
        );
        canonical.push(q);
        canonicalById.set(quarantineId, q);
        migrationSummary.quarantined++;
        continue;
      }

      // ── Deterministic ID for records missing one ─────────
      let recordId = typeof raw.recordId === "string" ? raw.recordId : null;
      let wasMissingId = false;
      if (!recordId) {
        const stableInput = [
          raw.displaySymbol || raw.symbol || "",
          typeof raw.createdAt === "number" ? raw.createdAt : "",
          raw.weaverSnapshot?.analysisTimestamp || raw.analysisTimestamp || "",
          source,
        ].join("|");
        recordId = "track-legacy-" + stableHash(stableInput);
        wasMissingId = true;
      }

      // ── Normalize the legacy snapshot ONCE ───────────────
      // fallbackTimestamp makes the snapshot deterministic across
      // migration runs, so sameImmutable() can match it.
      const legacySnapshot = normalizeAnalysis(raw.weaverSnapshot || raw, {
        fallbackTimestamp: stableCreatedAt(raw),
      });

      // ── Canonical already has this recordId ──────────────
      const existing = canonicalById.get(recordId);
      if (existing) {
        if (sameImmutable(existing.weaverSnapshot, legacySnapshot)) {
          migrationSummary.deduped++;
          continue;
        }

        // Immutable conflict — preserve legacy as a derived record.
        const derivedId =
          recordId +
          "-legacy-" +
          stableHash(
            JSON.stringify({
              s: legacySnapshot.scoringVersion,
              a: legacySnapshot.analysisTimestamp,
              v: legacySnapshot.unifiedVerdict?.score,
              c: legacySnapshot.unifiedVerdict?.confidence,
            }),
          );

        if (canonicalById.has(derivedId)) {
          migrationSummary.deduped++;
          continue;
        }

        const preserved = normalizeLegacy(
          raw,
          derivedId,
          source,
          "CONFLICT",
          recordId,
          runTimestamp,
          legacySnapshot,
        );
        canonical.push(preserved);
        canonicalById.set(derivedId, preserved);
        migrationSummary.conflicts++;
        continue;
      }

      // ── Fresh migration ──────────────────────────────────
      const migrated = normalizeLegacy(
        raw,
        recordId,
        source,
        wasMissingId ? "MIGRATED_LEGACY_ID" : "MIGRATED",
        null,
        runTimestamp,
        legacySnapshot,
      );
      canonical.push(migrated);
      canonicalById.set(recordId, migrated);
      if (wasMissingId) migrationSummary.migratedLegacyId++;
      else migrationSummary.migrated++;
    }

    saveAll(canonical);
    return migrationSummary;
  }

  // Compares two immutable snapshot objects. Legacy records must be
  // normalized BEFORE this is called so both sides share the same shape.
  function sameImmutable(av, bv) {
    av = av || {};
    bv = bv || {};
    return (
      av.methodologyVersion === bv.methodologyVersion &&
      av.scoringVersion === bv.scoringVersion &&
      av.evidenceBuilderVersion === bv.evidenceBuilderVersion &&
      av.analysisTimestamp === bv.analysisTimestamp &&
      av.unifiedVerdict?.score === bv.unifiedVerdict?.score &&
      av.unifiedVerdict?.confidence === bv.unifiedVerdict?.confidence
    );
  }

  function stableCreatedAt(raw) {
    if (typeof raw.createdAt === "number") return raw.createdAt;
    if (typeof raw.weaverSnapshot?.analysisTimestamp === "number")
      return raw.weaverSnapshot.analysisTimestamp;
    if (typeof raw.analysisTimestamp === "number") return raw.analysisTimestamp;
    // Deterministic fallback — never Date.now().
    return 0;
  }

  function normalizeLegacy(
    raw,
    recordId,
    source,
    status,
    originalId,
    migratedAt,
    snapshot,
  ) {
    return {
      schemaVersion: SCHEMA_VERSION,
      recordId,
      assetId: normalizeAssetId(raw.assetId || raw.asset),
      displaySymbol: raw.displaySymbol || raw.symbol || "UNKNOWN",
      displayName: raw.displayName || raw.name || "Unknown",
      createdAt: stableCreatedAt(raw),
      weaverSnapshot: snapshot,
      userDecision: normalizeDecision(raw.userDecision || {}),
      outcome: normalizeOutcome(raw.outcome || {}),
      revisions: [],
      migration: {
        source,
        migratedAt,
        status,
        originalRecordId: originalId,
      },
    };
  }

  function quarantineRecord(raw, source, reason, quarantineId) {
    return {
      schemaVersion: SCHEMA_VERSION,
      recordId: quarantineId,
      assetId: normalizeAssetId(null),
      displaySymbol: "QUARANTINED",
      displayName: "Unmigrated record",
      createdAt: 0,
      weaverSnapshot: normalizeAnalysis(null, { fallbackTimestamp: 0 }),
      userDecision: normalizeDecision({}),
      outcome: normalizeOutcome({}),
      revisions: [],
      migration: {
        source,
        migratedAt: 0,
        status: "QUARANTINED",
        originalRecordId: null,
        reason,
      },
      quarantined: { reason, original: raw },
    };
  }

  // ── UI ─────────────────────────────────────────────────────
  async function render(view) {
    const records = loadAll();

    if (records.length === 0) {
      view.innerHTML = `
        <div class="card">
          <h2>Track Record</h2>
          <p class="muted small">
            Historical snapshots of Weaver's analysis alongside your decisions and observed outcomes.
            Records are private, stored locally, and never sent anywhere.
          </p>
          <div class="empty-state">
            <div class="icon">🧾</div>
            <div class="msg">No records yet</div>
            <div class="sub">Save an analysis from the Token Analysis page to start a record.</div>
          </div>
        </div>
      `;
      return;
    }

    view.innerHTML = `
      <div class="card">
        <h2>Track Record</h2>
        <p class="muted small">
          Historical snapshots of Weaver's analysis alongside your decisions and observed outcomes.
          Records are private, stored locally, and never sent anywhere.
        </p>
        <div class="qa mt">
          <button class="btn tiny" id="tr-export">Export CSV</button>
        </div>
      </div>
      <div id="tr-list"></div>
    `;

    view.querySelector("#tr-export").onclick = () => {
      const csv = exportCSV();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `weaver-track-record-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const list = view.querySelector("#tr-list");
    list.innerHTML = records.map(renderRecordCard).join("");

    list.querySelectorAll("[data-expand]").forEach((btn) => {
      btn.onclick = () => {
        const recordId = btn.dataset.expand;
        const record = getById(recordId);
        if (!record) return;
        openRecordModal(record);
      };
    });
  }

  function renderRecordCard(record) {
    const s = record.weaverSnapshot || {};
    const verdict = s.unifiedVerdict || {};
    const scenario = s.scenario || {};
    const decision = record.userDecision || {};
    const outcome = record.outcome || {};
    const safe = W.fmt.escapeHTML;

    return `
      <div class="card tr-card">
        <div class="watch-head">
          <div>
            <b>${safe(record.displaySymbol)}</b>
            <span class="muted small">${safe(record.displayName)}</span>
            <br>
            <span class="muted small">${new Date(record.createdAt).toLocaleString()}</span>
          </div>
          <button class="btn tiny" data-expand="${safe(record.recordId)}">View</button>
        </div>
        <div class="kv-row"><span class="muted">Scenario</span><span>${safe(scenario.classification || "UNKNOWN")}</span></div>
        <div class="kv-row"><span class="muted">Evidence quality</span><span>${safe(verdict.evidenceQuality || "UNKNOWN")}</span></div>
        <div class="kv-row"><span class="muted">Your decision</span><span>${safe(decision.action || "UNSET")}</span></div>
        <div class="kv-row"><span class="muted">Outcome</span><span>${safe(outcome.status || "UNKNOWN")}</span></div>
        <div class="kv-row"><span class="muted">Methodology</span><span class="small">${safe(s.methodologyVersion || "—")}</span></div>
      </div>
    `;
  }

  function openRecordModal(record) {
    const m = W.ui.modal({
      title: `Track Record — ${W.fmt.escapeHTML(record.displaySymbol)}`,
      body: buildModalBody(record),
      footer: `<button class="btn ghost" id="tr-close">Close</button>`,
    });

    m.el.querySelector("#tr-close").onclick = m.close;

    m.el.querySelectorAll("[data-tab]").forEach((tab) => {
      tab.onclick = () => {
        m.el
          .querySelectorAll("[data-tab]")
          .forEach((t) => t.classList.remove("active"));
        m.el
          .querySelectorAll("[data-tab-panel]")
          .forEach((p) => p.classList.add("hidden"));
        tab.classList.add("active");
        const panel = m.el.querySelector(
          `[data-tab-panel="${tab.dataset.tab}"]`,
        );
        if (panel) panel.classList.remove("hidden");
      };
    });

    const decisionForm = m.el.querySelector("#tr-decision-form");
    if (decisionForm) {
      decisionForm.onsubmit = (e) => {
        e.preventDefault();
        const action = m.el.querySelector("#tr-action").value;
        const notes = m.el.querySelector("#tr-notes").value;
        updateDecision(record.recordId, {
          action,
          notes,
          decisionTimestamp: Date.now(),
        });
        W.ui.toast("Decision saved", "ok");
        m.close();
        W.refresh();
      };
    }

    const outcomeForm = m.el.querySelector("#tr-outcome-form");
    if (outcomeForm) {
      outcomeForm.onsubmit = (e) => {
        e.preventDefault();
        const entry = m.el.querySelector("#tr-entry").value;
        const exit = m.el.querySelector("#tr-exit").value;
        const size = m.el.querySelector("#tr-size").value;
        const status = m.el.querySelector("#tr-status").value;
        const source = m.el.querySelector("#tr-source").value;
        const entryTs = m.el.querySelector("#tr-entry-ts").value;
        const exitTs = m.el.querySelector("#tr-exit-ts").value;

        updateOutcome(record.recordId, {
          userEntryPrice: entry === "" ? null : parseFloat(entry),
          userExitPrice: exit === "" ? null : parseFloat(exit),
          positionSize: size === "" ? null : parseFloat(size),
          entryTimestamp: entryTs === "" ? null : new Date(entryTs).getTime(),
          exitTimestamp: exitTs === "" ? null : new Date(exitTs).getTime(),
          status,
          outcomeSource: source,
        });
        W.ui.toast("Outcome saved", "ok");
        m.close();
        W.refresh();
      };
    }
  }

  function buildModalBody(record) {
    const s = record.weaverSnapshot || {};
    const v = s.unifiedVerdict || {};
    const ta = s.technicalAnalysis || {};
    const fa = s.fundamentalAssessment || {};
    const sa = s.securityAssessment || {};
    const sc = s.scenario || {};
    const ev = s.evidence || {};
    const d = record.userDecision || {};
    const o = record.outcome || {};

    const fmtNum = (n, digits = 2) =>
      typeof n === "number" ? n.toFixed(digits) : "—";
    const safe = W.fmt.escapeHTML;
    const fmtTs = (ts) =>
      typeof ts === "number" && ts > 0
        ? new Date(ts).toISOString().slice(0, 10)
        : "";

    return `
      <div class="tabs">
        <button class="tab active" data-tab="weaver">Weaver's Analysis</button>
        <button class="tab" data-tab="decision">Your Decision</button>
        <button class="tab" data-tab="outcome">Observed Outcome</button>
        <button class="tab" data-tab="methodology">Methodology</button>
      </div>

      <div data-tab-panel="weaver">
        <div class="kv-row"><span class="muted">Score</span><span>${fmtNum(v.score, 0)}</span></div>
        <div class="kv-row"><span class="muted">Confidence</span><span>${v.confidence == null ? "—" : (v.confidence * 100).toFixed(0) + "%"}</span></div>
        <div class="kv-row"><span class="muted">Evidence quality</span><span>${safe(v.evidenceQuality || "UNKNOWN")}</span></div>
        <div class="kv-row"><span class="muted">Technical score</span><span>${fmtNum(ta.score, 0)}</span></div>
        <div class="kv-row"><span class="muted">Fundamental score</span><span>${fmtNum(fa.score, 0)}</span></div>
        <div class="kv-row"><span class="muted">Security risk score</span><span>${fmtNum(sa.riskScore, 0)}</span></div>
        <div class="kv-row"><span class="muted">Scenario</span><span>${safe(sc.classification || "UNKNOWN")}</span></div>

        <h4 class="mt">Supporting evidence</h4>
        ${
          (ev.supporting || []).length
            ? ev.supporting
                .map(
                  (e) =>
                    `<div class="small">• ${safe(typeof e === "string" ? e : e.title || e.evidence || JSON.stringify(e))}</div>`,
                )
                .join("")
            : '<div class="muted small">None recorded</div>'
        }

        <h4 class="mt">Contradicting evidence</h4>
        ${
          (ev.contradicting || []).length
            ? ev.contradicting
                .map(
                  (e) =>
                    `<div class="small">• ${safe(typeof e === "string" ? e : e.title || e.evidence || JSON.stringify(e))}</div>`,
                )
                .join("")
            : '<div class="muted small">None recorded</div>'
        }

        <h4 class="mt">Missing evidence</h4>
        ${
          (ev.missing || []).length
            ? ev.missing
                .map(
                  (e) =>
                    `<div class="small">• ${safe(typeof e === "string" ? e : JSON.stringify(e))}</div>`,
                )
                .join("")
            : '<div class="muted small">None recorded</div>'
        }
      </div>

      <div data-tab-panel="decision" class="hidden">
        <form id="tr-decision-form">
          <label>Action
            <select id="tr-action">
              ${ACTIONS.map((a) => `<option value="${a}" ${d.action === a ? "selected" : ""}>${a}</option>`).join("")}
            </select>
          </label>
          <label>Notes
            <textarea id="tr-notes" rows="4">${safe(d.notes || "")}</textarea>
          </label>
          <button class="btn primary mt" type="submit">Save Decision</button>
        </form>
      </div>

      <div data-tab-panel="outcome" class="hidden">
        <form id="tr-outcome-form">
          <label>Status
            <select id="tr-status">
              ${OUTCOME_STATUS.map((sx) => `<option value="${sx}" ${o.status === sx ? "selected" : ""}>${sx}</option>`).join("")}
            </select>
          </label>
          <label>Entry price
            <input id="tr-entry" type="number" step="any" value="${o.userEntryPrice == null ? "" : o.userEntryPrice}">
          </label>
          <label>Exit price
            <input id="tr-exit" type="number" step="any" value="${o.userExitPrice == null ? "" : o.userExitPrice}">
          </label>
          <label>Position size
            <input id="tr-size" type="number" step="any" value="${o.positionSize == null ? "" : o.positionSize}">
          </label>
          <label>Entry date
            <input id="tr-entry-ts" type="date" value="${fmtTs(o.entryTimestamp)}">
          </label>
          <label>Exit date
            <input id="tr-exit-ts" type="date" value="${fmtTs(o.exitTimestamp)}">
          </label>
          <label>Outcome source
            <select id="tr-source">
              ${OUTCOME_SOURCE.map((sx) => `<option value="${sx}" ${o.outcomeSource === sx ? "selected" : ""}>${sx}</option>`).join("")}
            </select>
          </label>
          <div class="mt small muted">
            Calculated result:
            <b>${o.realizedResult == null ? "—" : o.realizedResult.toFixed(2)}</b>
            (${o.realizedResultPct == null ? "—" : o.realizedResultPct.toFixed(2) + "%"})
            · Duration:
            <b>${o.holdingDurationMs == null ? "—" : Math.round(o.holdingDurationMs / 86400000) + "d"}</b>
          </div>
          <button class="btn primary mt" type="submit">Save Outcome</button>
        </form>
      </div>

      <div data-tab-panel="methodology" class="hidden">
        <div class="kv-row"><span class="muted">Methodology version</span><span>${safe(s.methodologyVersion || "—")}</span></div>
        <div class="kv-row"><span class="muted">Scoring version</span><span>${safe(s.scoringVersion || "—")}</span></div>
        <div class="kv-row"><span class="muted">Evidence builder version</span><span>${safe(s.evidenceBuilderVersion || "—")}</span></div>
        <div class="kv-row"><span class="muted">Analysis timestamp</span><span>${new Date(s.analysisTimestamp).toLocaleString()}</span></div>
        <div class="kv-row"><span class="muted">Record created</span><span>${new Date(record.createdAt).toLocaleString()}</span></div>
        <p class="muted small mt">
          These values are immutable. They represent the exact methodology in effect
          when this record was created.
        </p>
      </div>
    `;
  }

  // ── Exports ────────────────────────────────────────────────
  return {
    render,
    createFromAnalysis,
    capture: createFromAnalysis,
    getAll,
    getById,
    updateDecision,
    updateOutcome,
    linkTransaction,
    deleteRecord,
    exportCSV,
    migrate,
    _stableHash: stableHash,
    _recomputeOutcome: recomputeOutcome,
    _LEGACY_KEYS: LEGACY_KEYS,
  };
})();

console.log("[TrackRecord] Module loaded.");
