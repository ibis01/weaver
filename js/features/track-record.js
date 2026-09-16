// ===============================================================
//         Weaver Track Record v2.1 – auditable history
// ===============================================================
// Historical fidelity: preserve exactly what Weaver knew at capture
// time. User edits are limited to explicit fields and are revisioned.
// Historical views never fetch current market data.

window.W = window.W || {};

W.trackRecord = (() => {
  const STORAGE_KEY = "track_records";
  const SCHEMA_VERSION = "track-record-v2.1";
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
    "UNKNOWN",
    "REPORTED_GAIN",
    "REPORTED_LOSS",
    "REPORTED_FLAT",
  ]);
  const MUTABLE_FIELDS = new Set([
    "userDecision.action",
    "userDecision.notes",
    "userDecision.decisionTimestamp",
    "userDecision.linkedTransactionId",
    "outcome.status",
    "outcome.observedPriceAtOutcome",
    "outcome.outcomeTimestamp",
    "outcome.userEntryPrice",
    "outcome.userExitPrice",
    "outcome.positionSize",
    "outcome.resultCurrency",
    "outcome.outcomeSource",
    "outcome.notes",
  ]);
  const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

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
    const start = timeMs(decisionTimestamp);
    const end = timeMs(outcome.outcomeTimestamp);
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
      typeof record.id !== "string" ||
      !["track-record-v1", SCHEMA_VERSION].includes(record.schemaVersion) ||
      !record.createdAt
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
      status: OUTCOME_STATUS.has(legacyStatus) ? legacyStatus : "UNSET",
      observedPriceAtOutcome: safeFiniteNumber(
        rawOutcome.observedPriceAtOutcome,
        false,
      ),
      outcomeTimestamp: rawOutcome.outcomeTimestamp ?? null,
      userEntryPrice: safeFiniteNumber(rawOutcome.userEntryPrice, false),
      userExitPrice: safeFiniteNumber(rawOutcome.userExitPrice, false),
      positionSize: safeFiniteNumber(rawOutcome.positionSize, false),
      realizedResult: safeFiniteNumber(rawOutcome.realizedResult),
      realizedResultPct: safeFiniteNumber(rawOutcome.realizedResultPct),
      resultCurrency:
        typeof rawOutcome.resultCurrency === "string"
          ? rawOutcome.resultCurrency
          : null,
      outcomeSource:
        typeof rawOutcome.outcomeSource === "string"
          ? rawOutcome.outcomeSource
          : "UNKNOWN",
      notes: typeof rawOutcome.notes === "string" ? rawOutcome.notes : "",
      holdingDurationMs: safeFiniteNumber(rawOutcome.holdingDurationMs, false),
    };
    return {
      id: record.id,
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
      weaverSnapshot: snapshot,
      userDecision: {
        action: USER_ACTIONS.has(decision.action) ? decision.action : "UNSET",
        notes: typeof decision.notes === "string" ? decision.notes : "",
        decisionTimestamp: decision.decisionTimestamp ?? null,
        linkedTransactionId: decision.linkedTransactionId ?? null,
      },
      outcome,
      revisions: Array.isArray(record.revisions)
        ? deepClone(record.revisions)
        : [],
    };
  }

  function load() {
    try {
      const raw = W.store?.get?.(STORAGE_KEY, []);
      return Array.isArray(raw) ? raw.map(normalizeRecord).filter(Boolean) : [];
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
      createdAt: new Date().toISOString(),
      asset: analysis.asset,
      assetId,
      weaverSnapshot: deepClone(analysis),
      userDecision: {
        action: "UNSET",
        notes: "",
        decisionTimestamp: null,
        linkedTransactionId: null,
      },
      outcome: {
        status: "UNSET",
        observedPriceAtOutcome: null,
        outcomeTimestamp: null,
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
    const result = save([record, ...load()]);
    if (!result.ok) throw new Error(result.error);
    return deepClone(record);
  }

  function createFromAnalysis(analysis, assetId) {
    try {
      return {
        ok: true,
        record: capture({ ...analysis, assetId }, { assetId }),
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
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
      path === "outcome.outcomeSource" ||
      path === "outcome.notes"
    )
      return value === null || typeof value === "string";
    if (path === "userDecision.linkedTransactionId")
      return value === null || typeof value === "string";
    if (
      path === "userDecision.decisionTimestamp" ||
      path === "outcome.outcomeTimestamp"
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

  // Strict field-path API. Every change requires a human-readable revision reason.
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
    ];
    const rows = load().map((record) => {
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
      ]
        .map(csvCell)
        .join(",");
    });
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
    const current = all();
    view.innerHTML = `<div class="card"><div class="flex-between"><h3>Track Record</h3><button class="btn tiny" data-action="export">Export CSV</button></div><p class="muted small">Historical Weaver analyses are immutable. Decisions and outcomes are stored separately; this view does not fetch current market data.</p></div><div id="track-record-list">${current.length ? current.map((record) => `<article class="card track-record-entry" data-record-id="${escape(record.id)}"><h4>Weaver's Analysis — ${escape(record.assetId.symbol)}</h4><p class="small muted">${escape(record.weaverSnapshot.explanation || "No explanation captured.")}</p><p class="small">Scenario: ${escape(record.weaverSnapshot.scenario || record.weaverSnapshot.verdict || "Unknown")} · Confidence: ${record.weaverSnapshot.confidence === null || record.weaverSnapshot.confidence === undefined ? "not stated" : escape(record.weaverSnapshot.confidence + "%")}</p><h4>Your Decision</h4><select data-field="userDecision.action"><option value="UNSET" ${record.userDecision.action === "UNSET" ? "selected" : ""}>Not recorded</option><option value="WATCH">Watch</option><option value="CONSIDER">Consider</option><option value="ENTERED">Entered decision</option><option value="NOT_ENTERED">Did not enter</option><option value="HOLD">Held / waited</option></select><select data-field="userDecision.linkedTransactionId"><option value="">No linked transaction</option>${transactionOptions(record.userDecision.linkedTransactionId)}</select><textarea class="input mt" data-field="userDecision.notes" rows="2">${escape(record.userDecision.notes)}</textarea><h4>Outcome</h4><select data-field="outcome.status"><option value="UNSET">Not reported</option><option value="REPORTED_GAIN" ${record.outcome.status === "REPORTED_GAIN" ? "selected" : ""}>Reported gain</option><option value="REPORTED_LOSS" ${record.outcome.status === "REPORTED_LOSS" ? "selected" : ""}>Reported loss</option><option value="REPORTED_FLAT" ${record.outcome.status === "REPORTED_FLAT" ? "selected" : ""}>Reported flat</option><option value="UNKNOWN" ${record.outcome.status === "UNKNOWN" ? "selected" : ""}>Unknown</option></select><div class="grid-2"><input class="input" data-field="outcome.userEntryPrice" type="number" min="0" step="any" value="${record.outcome.userEntryPrice ?? ""}" placeholder="Entry price"><input class="input" data-field="outcome.userExitPrice" type="number" min="0" step="any" value="${record.outcome.userExitPrice ?? ""}" placeholder="Exit price"><input class="input" data-field="outcome.positionSize" type="number" min="0" step="any" value="${record.outcome.positionSize ?? ""}" placeholder="Position size"><input class="input" data-field="outcome.resultCurrency" value="${escape(record.outcome.resultCurrency || "")}" placeholder="Currency"></div><input class="input mt" data-field="outcome.outcomeSource" value="${escape(record.outcome.outcomeSource || "")}" placeholder="Outcome source (e.g. user-reported)"><input class="input mt" data-field="revisionReason" placeholder="Reason for update (required)"><button class="btn primary tiny mt" data-action="save">Save update</button><button class="btn danger tiny mt" data-action="delete">Delete record</button></article>`).join("") : '<p class="muted">No historical analyses captured yet.</p>'}</div>`;
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

  return {
    SCHEMA_VERSION,
    MUTABLE_FIELDS,
    all,
    get,
    capture,
    createFromAnalysis,
    update,
    remove,
    calculateOutcome,
    normalizeRecord,
    buildCSV,
    exportCSV,
    render,
  };
})();

console.log("[TrackRecord] Module loaded (track-record-v2.1).");
