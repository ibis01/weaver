// ══════════════════════════════════════════════════════════════════
// js/features/alerts.js – Price Alerts (v2, security-hardened, single file)
// ═══════════════════════════════════════════════════════════════════

window.W = window.W || {};

W.alerts = (() => {
  "use strict";

  // ── Constants ─────────────────────────────────────────
  const KEY = "alerts_v2";
  const LEGACY_KEY = "alerts";
  const BANNER_DISMISSED_KEY = "alerts.migration.banner.dismissed.v1";
  const MIGRATION_DONE_KEY = "alerts.migration.done.v1";
  const EXPORTER_TAG = "weaver.alerts";

  const MAX_ALERTS = 200;
  const MAX_NAME_LENGTH = 64;
  const MAX_SYMBOL_LENGTH = 16;
  const MAX_IMG_URL_LENGTH = 2048;
  const MAX_VAL = 1e15;
  const NOTIFY_COOLDOWN_MS = 60000;
  const LOCK_NAME = "weaver.alerts.check";
  const TEST_THROTTLE_MS = 5000;
  const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

  // Danger keys rejected anywhere in an imported JSON tree.
  // JSON.parse() preserves __proto__ as an own property; it does not
  // pollute by itself, but downstream merges can. We reject the whole
  // file rather than trying to strip, because a file containing these
  // is either malformed or hostile.
  const DANGER_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);

  // ── Prototype-safe map ────────────────────────────────
  function newMap() {
    return Object.create(null);
  }

  // ── Safe storage ──────────────────────────────────────
  function safeGet(key, fallback) {
    try {
      const raw = W.store.get(key, null);
      if (raw === null || raw === undefined) return fallback;
      return raw;
    } catch (e) {
      console.warn("[Alerts] Storage read failed:", e && e.message);
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      W.store.set(key, value);
      return true;
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "unknown";
      if (/quota/i.test(msg)) {
        W.ui.toast(
          "Storage full — delete some alerts to continue",
          "warn",
          6000,
        );
      } else if (/security/i.test(msg)) {
        W.ui.toast(
          "Browser storage disabled — alerts won't persist",
          "warn",
          6000,
        );
      } else {
        console.warn("[Alerts] Storage write failed:", msg);
      }
      return false;
    }
  }

  function safeDelete(key) {
    try {
      if (W.store && typeof W.store.delete === "function") {
        W.store.delete(key);
        return true;
      }
      W.store.set(key, null);
      return true;
    } catch (e) {
      console.warn("[Alerts] Storage delete failed:", e && e.message);
      return false;
    }
  }

  // ── Attribute-safe escaping ───────────────────────────
  function esc(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (!/[&<>"']/.test(s)) return s;
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ── Image URL allowlist ───────────────────────────────
  const IMG_PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#2b2d42"/></svg>',
    );

  function safeImageUrl(u) {
    if (typeof u !== "string" || !u || u.length > MAX_IMG_URL_LENGTH) {
      return IMG_PLACEHOLDER;
    }
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:") return IMG_PLACEHOLDER;
      return parsed.toString();
    } catch {
      return IMG_PLACEHOLDER;
    }
  }

  // ── ID generator ──────────────────────────────────────
  function cryptoRandomId() {
    const c = window.crypto || window.msCrypto;
    if (!c || typeof c.getRandomValues !== "function") {
      return (
        "a" + Math.random().toString(36).slice(2, 14) + Date.now().toString(36)
      );
    }
    const bytes = new Uint8Array(12);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ── Schema validation ─────────────────────────────────
  function isValidAlert(a) {
    if (!a || typeof a !== "object") return false;
    if (typeof a.id !== "string" || !/^[a-z0-9]{8,32}$/i.test(a.id))
      return false;
    if (typeof a.coinId !== "string" || !a.coinId) return false;
    if (typeof a.symbol !== "string" || a.symbol.length > MAX_SYMBOL_LENGTH)
      return false;
    if (typeof a.name !== "string" || a.name.length > MAX_NAME_LENGTH)
      return false;
    if (
      typeof a.cond !== "string" ||
      !["above", "below", "move24", "volume"].includes(a.cond)
    ) {
      return false;
    }
    if (
      typeof a.val !== "number" ||
      !Number.isFinite(a.val) ||
      a.val <= 0 ||
      a.val > MAX_VAL
    ) {
      return false;
    }
    if (typeof a.triggered !== "boolean") return false;
    if (typeof a.created !== "number" || !Number.isFinite(a.created))
      return false;
    if (a.img !== undefined && typeof a.img !== "string") return false;
    if (a.notifiedAt !== undefined && typeof a.notifiedAt !== "number")
      return false;
    return true;
  }

  function sanitizeAlert(a) {
    const out = newMap();
    out.id = String(a.id).slice(0, 32);
    out.coinId = String(a.coinId).slice(0, 128);
    out.symbol = String(a.symbol).slice(0, MAX_SYMBOL_LENGTH).toUpperCase();
    out.name = String(a.name).slice(0, MAX_NAME_LENGTH);
    out.img = typeof a.img === "string" ? safeImageUrl(a.img) : IMG_PLACEHOLDER;
    out.cond = a.cond;
    out.val = Math.min(Number(a.val), MAX_VAL);
    out.triggered = !!a.triggered;
    out.created = Number(a.created);
    if (typeof a.notifiedAt === "number") out.notifiedAt = Number(a.notifiedAt);
    return out;
  }

  // ── Data access ───────────────────────────────────────
  function list() {
    const raw = safeGet(KEY, []);
    if (!Array.isArray(raw)) return [];
    const valid = [];
    for (const a of raw) {
      if (valid.length >= MAX_ALERTS) break;
      if (isValidAlert(a)) valid.push(sanitizeAlert(a));
    }
    return valid;
  }

  function save(alerts) {
    if (!Array.isArray(alerts)) return false;
    const capped = alerts.slice(0, MAX_ALERTS).map(sanitizeAlert);
    const ok = safeSet(KEY, capped);
    if (ok) updateBadge();
    return ok;
  }

  // ── Format helpers ────────────────────────────────────
  function condText(a) {
    switch (a.cond) {
      case "above":
        return `price above ${W.fmt.price(a.val)}`;
      case "below":
        return `price below ${W.fmt.price(a.val)}`;
      case "move24":
        return `24h move exceeds ±${a.val}%`;
      case "volume":
        return `volume spike (±${a.val}% move)`;
      default:
        return "";
    }
  }

  function updateBadge() {
    const badge = document.getElementById("alert-badge");
    if (!badge) return;
    const count = list().filter((a) => !a.triggered).length;
    badge.textContent = count || "";
    badge.style.display = count ? "inline-block" : "none";
  }

  // ═══════════════════════════════════════════════════════
  // CORE: RENDER
  // ═══════════════════════════════════════════════════════
  async function render(view) {
    if (!view) return;
    view.innerHTML = `
      <div class="card">
        <h3>🚨 Create Alert</h3>
        <form id="a-form" class="alert-form">
          <div id="a-picker" class="grid-full"></div>
          <label>Condition
            <select name="cond">
              <option value="above">Price goes above</option>
              <option value="below">Price goes below</option>
              <option value="move24">24h % movement exceeds</option>
              <option value="volume">Volume spike (big 24h move)</option>
            </select>
          </label>
          <label>Value
            <input type="number" step="any" name="val" required min="0.000001" max="${MAX_VAL}" placeholder="e.g. 70000 or 10">
          </label>
          <button class="btn primary" type="submit">Create Alert</button>
        </form>
      </div>
      <div class="card">
        <h3>Active Alerts</h3>
        <div id="a-list"></div>
      </div>
    `;

    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#a-picker"), (p) => {
        if (p && typeof p.id === "string" && typeof p.symbol === "string") {
          picked = {
            id: p.id.slice(0, 128),
            symbol: p.symbol.slice(0, MAX_SYMBOL_LENGTH),
            name:
              typeof p.name === "string"
                ? p.name.slice(0, MAX_NAME_LENGTH)
                : p.symbol,
            img: safeImageUrl(p.img),
          };
        } else {
          picked = null;
        }
      });
    } else {
      console.warn("[Alerts] coinPicker not available");
    }

    view.querySelector("#a-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (!picked) return W.ui.toast("Pick a coin first", "warn");

      const val = parseFloat(f.val.value);
      if (!Number.isFinite(val) || val <= 0) {
        return W.ui.toast("Enter a valid positive number", "warn");
      }
      if (val > MAX_VAL) {
        return W.ui.toast(`Value must be ≤ ${MAX_VAL}`, "warn");
      }

      const alerts = list();
      if (alerts.length >= MAX_ALERTS) {
        return W.ui.toast(`Alert limit reached (${MAX_ALERTS})`, "warn");
      }

      alerts.push({
        id: cryptoRandomId(),
        coinId: picked.id,
        symbol: picked.symbol.toUpperCase(),
        name: picked.name,
        img: picked.img,
        cond: f.cond.value,
        val,
        triggered: false,
        created: Date.now(),
      });
      save(alerts);
      W.ui.toast("Alert created 🚨", "ok");
      render(view);
    };

    drawList(view);
    updateBadge();
  }

  function drawList(view) {
    const el = view.querySelector("#a-list");
    const alerts = list();

    if (!alerts.length) {
      el.innerHTML = W.ui.empty(
        "🚨",
        "No alerts yet",
        "Create one above — Weaver watches the market for you",
      );
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");

    const thead = document.createElement("thead");
    thead.innerHTML =
      "<tr><th>Coin</th><th>Condition</th><th>Status</th><th></th></tr>";
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (const a of alerts) {
      const tr = document.createElement("tr");

      const tdCoin = document.createElement("td");
      tdCoin.className = "coin-cell";
      const img = document.createElement("img");
      img.src = a.img;
      img.alt = a.name;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      const nameB = document.createElement("b");
      nameB.textContent = a.name;
      tdCoin.appendChild(img);
      tdCoin.appendChild(nameB);

      const tdCond = document.createElement("td");
      tdCond.textContent = condText(a);

      const tdStatus = document.createElement("td");
      const tag = document.createElement("span");
      tag.className = a.triggered ? "tag triggered" : "tag live";
      tag.textContent = a.triggered ? "Triggered" : "Watching";
      tdStatus.appendChild(tag);

      const tdActions = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn";
      delBtn.type = "button";
      delBtn.setAttribute("aria-label", `Delete alert for ${a.name}`);
      delBtn.textContent = "🗑️";
      delBtn.onclick = () => confirmDelete(view, a);
      tdActions.appendChild(delBtn);

      tr.appendChild(tdCoin);
      tr.appendChild(tdCond);
      tr.appendChild(tdStatus);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    el.innerHTML = "";
    el.appendChild(wrap);
  }

  function confirmDelete(view, alert) {
    const label = `${alert.name} — ${condText(alert)}`;
    W.ui.confirm(`Delete "${label}"?`, () => {
      const remaining = list().filter((x) => x.id !== alert.id);
      save(remaining);
      drawList(view);
      updateBadge();
    });
  }

  // ═══════════════════════════════════════════════════════
  // CORE: CHECK
  // ═══════════════════════════════════════════════════════
  async function withCheckLock(fn) {
    if (navigator.locks && typeof navigator.locks.request === "function") {
      return navigator.locks.request(LOCK_NAME, fn);
    }
    return fn();
  }

  async function check() {
    updateBadge();

    return withCheckLock(async () => {
      const alerts = list();
      const active = alerts.filter((a) => !a.triggered);
      if (!active.length) return;

      const ids = [...new Set(active.map((a) => a.coinId))].join(",");
      let markets;
      try {
        markets = await W.api.markets(ids);
      } catch (e) {
        console.warn("[Alerts] Check error:", e && e.message);
        return;
      }
      if (!Array.isArray(markets)) return;

      const current = list();
      const currentById = newMap();
      for (const a of current) currentById[a.id] = a;

      const now = Date.now();
      let dirty = false;

      for (const a of alerts) {
        if (a.triggered) continue;
        const live = currentById[a.id];
        if (!live || live.triggered) continue;

        const m = markets.find((c) => c && c.id === a.coinId);
        if (!m) continue;
        const price = Number(m.current_price);
        const p24 = Number(m.price_change_percentage_24h_in_currency);
        if (!Number.isFinite(price)) continue;

        let hit = false;
        if (a.cond === "above" && price >= a.val) hit = true;
        if (a.cond === "below" && price <= a.val) hit = true;
        if (
          (a.cond === "move24" || a.cond === "volume") &&
          Number.isFinite(p24) &&
          Math.abs(p24) >= a.val
        ) {
          hit = true;
        }
        if (!hit) continue;

        if (live.notifiedAt && now - live.notifiedAt < NOTIFY_COOLDOWN_MS) {
          continue;
        }

        live.triggered = true;
        live.notifiedAt = now;
        dirty = true;

        const nameSafe = String(a.name).slice(0, MAX_NAME_LENGTH);
        const condSafe = condText(a);
        const msgText = `${nameSafe} — ${condSafe} (now ${W.fmt.price(price)})`;
        W.ui.toast(`🚨 ${msgText}`, "warn", 6000);

        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Weaver Alert", {
              body: msgText,
              icon: "assets/logo.png",
              tag: "alert:" + a.id,
            });
          } catch (e) {
            console.warn("[Alerts] Notification failed:", e && e.message);
          }
        }
        if (W.tg && typeof W.tg.notify === "function") {
          W.tg.notify(
            "alert:" + a.id,
            `🚨 <b>${esc(nameSafe)}</b> — ${esc(condSafe)}`,
          );
        }
      }

      if (dirty) {
        const merged = list().map((x) => {
          const live = currentById[x.id];
          return live && live.triggered ? live : x;
        });
        save(merged);
        updateBadge();
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // CORE: NOTIFICATION PERMISSION
  // ═══════════════════════════════════════════════════════
  async function requestNotificationPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch (e) {
      console.warn("[Alerts] Permission request failed:", e && e.message);
      return "denied";
    }
  }

  // ═══════════════════════════════════════════════════════
  // MIGRATION: v1 → v2
  // ═══════════════════════════════════════════════════════
  function checkV1Shape(a) {
    if (!a || typeof a !== "object") return { ok: false, reason: "not-object" };
    if (typeof a.id !== "string" || !a.id.trim())
      return { ok: false, reason: "missing-id" };
    if (typeof a.coinId !== "string" || !a.coinId.trim())
      return { ok: false, reason: "missing-coinId" };
    if (typeof a.symbol !== "string" || !a.symbol.trim())
      return { ok: false, reason: "missing-symbol" };
    if (typeof a.name !== "string" || !a.name.trim())
      return { ok: false, reason: "missing-name" };
    if (
      typeof a.cond !== "string" ||
      !["above", "below", "move24", "volume"].includes(a.cond)
    ) {
      return { ok: false, reason: "bad-cond" };
    }
    if (typeof a.val !== "number" || !Number.isFinite(a.val) || a.val <= 0) {
      return { ok: false, reason: "bad-val" };
    }
    if (typeof a.triggered !== "boolean")
      return { ok: false, reason: "bad-triggered" };
    if (typeof a.created !== "number" || !Number.isFinite(a.created)) {
      return { ok: false, reason: "bad-created" };
    }
    return { ok: true };
  }

  function getLegacyRaw() {
    return safeGet(LEGACY_KEY, null);
  }

  function hasV1() {
    const raw = getLegacyRaw();
    return Array.isArray(raw) && raw.length > 0;
  }

  function migrationPreview() {
    const raw = getLegacyRaw();
    if (!Array.isArray(raw)) {
      return {
        v1Present: raw !== null && raw !== undefined,
        rawIsArray: false,
        total: 0,
        validCount: 0,
        invalidCount: 0,
        valid: [],
        reasonBreakdown: newMap(),
      };
    }

    const valid = [];
    const reasonBreakdown = newMap();
    let invalidCount = 0;

    for (const entry of raw) {
      const check = checkV1Shape(entry);
      if (check.ok) {
        try {
          const cleaned = sanitizeAlert(entry);
          if (isValidAlert(cleaned)) {
            valid.push(cleaned);
            continue;
          }
        } catch {
          /* fall through */
        }
        reasonBreakdown["fails-v2-validation"] =
          (reasonBreakdown["fails-v2-validation"] || 0) + 1;
        invalidCount++;
        continue;
      }
      reasonBreakdown[check.reason] = (reasonBreakdown[check.reason] || 0) + 1;
      invalidCount++;
    }

    return {
      v1Present: true,
      rawIsArray: true,
      total: raw.length,
      validCount: valid.length,
      invalidCount,
      valid,
      reasonBreakdown,
    };
  }

  function migrationApply({ clearV1 = true } = {}) {
    const p = migrationPreview();
    if (!p.v1Present || !p.rawIsArray) {
      return { ok: false, reason: "no-v1-data", migrated: 0, skipped: 0 };
    }

    const existing = list();
    const seen = newMap();
    for (const a of existing) seen[a.id] = 1;

    const merged = existing.slice();
    let migrated = 0;
    let skipped = 0;

    for (const a of p.valid) {
      if (merged.length >= MAX_ALERTS) {
        skipped += p.valid.length - migrated;
        break;
      }
      if (seen[a.id]) {
        skipped++;
        continue;
      }
      seen[a.id] = 1;
      merged.push(a);
      migrated++;
    }

    const wrote = save(merged);
    if (!wrote)
      return { ok: false, reason: "save-failed", migrated: 0, skipped: 0 };

    if (clearV1) safeDelete(LEGACY_KEY);
    safeSet(MIGRATION_DONE_KEY, Date.now());
    updateBadge();

    return {
      ok: true,
      migrated,
      skipped,
      invalidCount: p.invalidCount,
      totalV1: p.total,
    };
  }

  function migrationDiscard() {
    const ok = safeDelete(LEGACY_KEY);
    if (ok) safeSet(MIGRATION_DONE_KEY, Date.now());
    return { ok };
  }

  // ── Export legacy data as JSON ────────────────────────
  function migrationExport() {
    const raw = getLegacyRaw();
    if (!Array.isArray(raw)) {
      return { ok: false, reason: "no-v1-data" };
    }

    const annotated = raw.map((entry, i) => {
      const shape = checkV1Shape(entry);
      let v2Result = null;
      if (shape.ok) {
        try {
          const cleaned = sanitizeAlert(entry);
          v2Result = isValidAlert(cleaned) ? "valid" : "fails-v2";
        } catch {
          v2Result = "fails-v2";
        }
      }
      return {
        index: i,
        v1ShapeOk: shape.ok,
        v1Reason: shape.ok ? null : shape.reason,
        v2Verdict: v2Result,
        raw: entry,
      };
    });

    const summary = migrationPreview();

    const payload = {
      exporter: EXPORTER_TAG,
      exportedAt: new Date().toISOString(),
      sourceKey: LEGACY_KEY,
      summary: {
        total: summary.total,
        valid: summary.validCount,
        invalid: summary.invalidCount,
        reasons: { ...summary.reasonBreakdown },
      },
      records: annotated,
    };

    let json;
    try {
      json = JSON.stringify(payload, null, 2);
    } catch (e) {
      return { ok: false, reason: "serialize-failed", message: e && e.message };
    }

    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace(/Z$/, "");
    const filename = `weaver-alerts-backup-${stamp}.json`;

    let url;
    try {
      const blob = new Blob([json], { type: "application/json" });
      url = URL.createObjectURL(blob);
    } catch (e) {
      return { ok: false, reason: "blob-failed", message: e && e.message };
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    try {
      a.click();
    } catch (e) {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { ok: false, reason: "download-failed", message: e && e.message };
    }
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    return { ok: true, filename, size: json.length, records: raw.length };
  }

  // ═══════════════════════════════════════════════════════
  // MIGRATION: importFromFile (device transfer path)
  // ═══════════════════════════════════════════════════════

  // Recursively scan a parsed JSON tree for forbidden keys. Depth
  // cap prevents a malicious file from burning the main thread with
  // a deeply nested object.
  function hasDangerKeys(obj, depth = 0) {
    if (depth > 32) return true;
    if (obj === null || typeof obj !== "object") return false;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (hasDangerKeys(item, depth + 1)) return true;
      }
      return false;
    }
    for (const key of Object.keys(obj)) {
      if (DANGER_KEYS.includes(key)) return true;
      if (hasDangerKeys(obj[key], depth + 1)) return true;
    }
    return false;
  }

  // Top-level envelope check. The file must be a JSON object with
  // the exporter tag and a records array. We ignore the file's own
  // summary block entirely and recompute counts from records.
  function validateExportEnvelope(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, reason: "not-an-object" };
    }
    if (payload.exporter !== EXPORTER_TAG) {
      return { ok: false, reason: "wrong-exporter" };
    }
    if (!Array.isArray(payload.records)) {
      return { ok: false, reason: "no-records-array" };
    }
    if (payload.records.length > MAX_ALERTS * 4) {
      return { ok: false, reason: "records-too-many" };
    }
    return { ok: true };
  }

  // Read a File as text with a hard size cap checked BEFORE reading.
  // FileReader.readAsText loads the entire file into memory; a large
  // file freezes the tab. file.size is synchronous and cheap.
  function readFileAsText(file, maxBytes) {
    return new Promise((resolve) => {
      if (!file || typeof file.size !== "number") {
        return resolve({ ok: false, reason: "not-a-file" });
      }
      if (file.size <= 0) {
        return resolve({ ok: false, reason: "empty-file" });
      }
      if (file.size > maxBytes) {
        return resolve({
          ok: false,
          reason: "file-too-large",
          size: file.size,
          max: maxBytes,
        });
      }
      const name = typeof file.name === "string" ? file.name : "";
      const looksJson =
        /\.json$/i.test(name) ||
        (typeof file.type === "string" &&
          file.type.toLowerCase() === "application/json");
      if (!looksJson) {
        return resolve({ ok: false, reason: "not-json-extension" });
      }

      const reader = new FileReader();
      reader.onerror = () => resolve({ ok: false, reason: "read-error" });
      reader.onload = (e) => {
        const text = e && e.target ? e.target.result : null;
        if (typeof text !== "string") {
          return resolve({ ok: false, reason: "read-null" });
        }
        resolve({ ok: true, text });
      };
      try {
        reader.readAsText(file);
      } catch (e) {
        resolve({ ok: false, reason: "read-throw", message: e && e.message });
      }
    });
  }

  // Parse, validate, and shape-check a file's text content. Every
  // failure path returns a named reason rather than throwing, so the
  // caller can surface a precise message.
  function parseImportPayload(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: "invalid-json", message: e && e.message };
    }

    if (hasDangerKeys(parsed)) {
      return { ok: false, reason: "dangerous-keys" };
    }

    const env = validateExportEnvelope(parsed);
    if (!env.ok) return env;

    const accepted = [];
    const rejected = [];
    const reasonBreakdown = newMap();

    for (const record of parsed.records) {
      // Exported record shape: { index, v1ShapeOk, v1Reason,
      // v2Verdict, raw }. We only care about `raw` — the original
      // alert data the user backed up. Envelope metadata is
      // regenerated on import.
      const candidate =
        record && typeof record === "object" ? record.raw : null;

      const shape = checkV1Shape(candidate);
      if (!shape.ok) {
        rejected.push({ reason: shape.reason });
        reasonBreakdown[shape.reason] =
          (reasonBreakdown[shape.reason] || 0) + 1;
        continue;
      }
      let cleaned;
      try {
        cleaned = sanitizeAlert(candidate);
      } catch {
        rejected.push({ reason: "sanitize-threw" });
        reasonBreakdown["sanitize-threw"] =
          (reasonBreakdown["sanitize-threw"] || 0) + 1;
        continue;
      }
      if (!isValidAlert(cleaned)) {
        rejected.push({ reason: "fails-v2-validation" });
        reasonBreakdown["fails-v2-validation"] =
          (reasonBreakdown["fails-v2-validation"] || 0) + 1;
        continue;
      }
      accepted.push(cleaned);
    }

    return {
      ok: true,
      accepted,
      rejected,
      reasonBreakdown,
      totalInFile: parsed.records.length,
      exportedAt:
        typeof parsed.exportedAt === "string" ? parsed.exportedAt : null,
    };
  }

  // Merge validated records into the live store. Existing alerts win
  // on id collision — we never overwrite a live record with an
  // imported one, because the live record is the one the user is
  // currently relying on.
  function mergeImportedRecords(accepted) {
    const existing = list();
    const seen = newMap();
    for (const a of existing) seen[a.id] = 1;

    const merged = existing.slice();
    let imported = 0;
    let skipped = 0;

    for (const a of accepted) {
      if (merged.length >= MAX_ALERTS) {
        skipped += accepted.length - imported;
        break;
      }
      if (seen[a.id]) {
        skipped++;
        continue;
      }
      seen[a.id] = 1;
      merged.push(a);
      imported++;
    }

    const wrote = save(merged);
    if (!wrote) return { ok: false, reason: "save-failed" };
    return { ok: true, imported, skipped, total: merged.length };
  }

  // Public: importFromFile. Accepts a File object (from <input
  // type="file"> or drag-drop). Never throws; every failure path is
  // a named reason.
  async function importFromFile(
    file,
    { maxBytes = MAX_IMPORT_FILE_BYTES } = {},
  ) {
    const read = await readFileAsText(file, maxBytes);
    if (!read.ok) return read;

    const parsed = parseImportPayload(read.text);
    if (!parsed.ok) return parsed;

    if (!parsed.accepted.length) {
      return {
        ok: false,
        reason: "no-valid-records",
        totalInFile: parsed.totalInFile,
        rejected: parsed.rejected.length,
        reasonBreakdown: { ...parsed.reasonBreakdown },
      };
    }

    const merged = mergeImportedRecords(parsed.accepted);
    if (!merged.ok) return merged;

    updateBadge();

    return {
      ok: true,
      imported: merged.imported,
      skipped: merged.skipped,
      totalAlerts: merged.total,
      totalInFile: parsed.totalInFile,
      rejectedCount: parsed.rejected.length,
      reasonBreakdown: { ...parsed.reasonBreakdown },
      exportedAt: parsed.exportedAt,
    };
  }

  // ═══════════════════════════════════════════════════════
  // SETTINGS CARD — notification permission UX
  // ═══════════════════════════════════════════════════════
  let lastTestAt = 0;

  function getPermissionState() {
    if (!("Notification" in window)) {
      return { key: "unsupported", label: "Not supported", icon: "❌" };
    }
    switch (Notification.permission) {
      case "granted":
        return { key: "granted", label: "Enabled", icon: "🔔" };
      case "denied":
        return { key: "denied", label: "Blocked by browser", icon: "🔕" };
      default:
        return { key: "default", label: "Not yet enabled", icon: "⚪" };
    }
  }

  function domEl(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text !== undefined) node.textContent = opts.text;
    if (opts.attrs) {
      for (const [k, v] of Object.entries(opts.attrs)) {
        node.setAttribute(k, v);
      }
    }
    return node;
  }

  function kvRow(labelText, valueNode) {
    const wrap = domEl("div", { className: "kv-row" });
    wrap.appendChild(domEl("span", { className: "muted", text: labelText }));
    const v = domEl("span");
    v.appendChild(valueNode);
    wrap.appendChild(v);
    return wrap;
  }

  function renderNotificationSettings() {
    const card = domEl("div", { className: "card" });
    card.appendChild(domEl("h3", { text: "🔔 Browser notifications" }));

    const body = domEl("div");
    card.appendChild(body);

    function refresh() {
      body.innerHTML = "";

      const state = getPermissionState();
      body.appendChild(
        kvRow("Status", domEl("b", { text: `${state.icon} ${state.label}` })),
      );

      const blurb = domEl("p", {
        className: "muted small",
        text:
          state.key === "unsupported"
            ? "This browser does not expose the Notification API. Alerts will still fire as in-app toasts."
            : state.key === "granted"
              ? "Notifications are active. Alerts will appear even when the tab is in the background."
              : state.key === "denied"
                ? "The browser has blocked notifications for this site. To re-enable, open your browser's site settings (usually the padlock icon in the address bar) and reset the notification permission, then reload."
                : "Enable browser notifications to be alerted even when Weaver is not the active tab.",
      });
      body.appendChild(blurb);

      const actions = domEl("div", { className: "qa mt" });

      if (state.key === "default") {
        const enableBtn = domEl("button", {
          className: "btn primary",
          text: "🔔 Enable notifications",
        });
        enableBtn.type = "button";
        enableBtn.onclick = async () => {
          enableBtn.disabled = true;
          enableBtn.textContent = "Requesting…";
          try {
            await requestNotificationPermission();
          } catch (e) {
            console.warn("[Alerts] Request failed:", e && e.message);
          }
          refresh();
        };
        actions.appendChild(enableBtn);
      }

      if (state.key === "granted") {
        const testBtn = domEl("button", {
          className: "btn tiny",
          text: "Send test notification",
        });
        testBtn.type = "button";
        testBtn.onclick = () => {
          const now = Date.now();
          if (now - lastTestAt < TEST_THROTTLE_MS) {
            W.ui.toast("Please wait before testing again", "info");
            return;
          }
          lastTestAt = now;
          try {
            new Notification("Weaver Alert", {
              body: "This is a test. Alerts will look like this.",
              icon: "assets/logo.png",
              tag: "weaver-test",
            });
          } catch (e) {
            console.warn("[Alerts] Test notification failed:", e && e.message);
            W.ui.toast("Test notification failed", "warn");
          }
        };
        actions.appendChild(testBtn);
        actions.appendChild(
          domEl("span", {
            className: "muted small",
            text: "To disable, use your browser's site settings.",
          }),
        );
      }

      if (state.key === "denied" || state.key === "unsupported") {
        actions.appendChild(
          domEl("span", {
            className: "muted small",
            text:
              state.key === "denied"
                ? "Permission was denied earlier. Reset it via the address-bar site settings."
                : "In-app toasts will still fire when conditions are met.",
          }),
        );
      }

      body.appendChild(actions);
    }

    refresh();
    return card;
  }

  function mountNotificationSettings(container) {
    if (!container || typeof container.appendChild !== "function") {
      console.warn("[Alerts] mount target invalid.");
      return null;
    }
    container.innerHTML = "";
    const card = renderNotificationSettings();
    container.appendChild(card);
    return card;
  }

  // ═══════════════════════════════════════════════════════
  // MIGRATION CARD — user-facing UI for v1 → v2
  // ═══════════════════════════════════════════════════════
  function reasonLabel(reason) {
    switch (reason) {
      case "not-object":
        return "record is not an object";
      case "missing-id":
        return "missing id";
      case "missing-coinId":
        return "missing coin reference";
      case "missing-symbol":
        return "missing symbol";
      case "missing-name":
        return "missing name";
      case "bad-cond":
        return "unknown condition type";
      case "bad-val":
        return "invalid numeric value";
      case "bad-triggered":
        return "invalid triggered flag";
      case "bad-created":
        return "invalid creation timestamp";
      case "fails-v2-validation":
        return "fails current schema validation";
      default:
        return reason;
    }
  }

  function mountMigrationCard(container) {
    if (!container) return null;
    container.innerHTML = "";

    const card = domEl("div", { className: "card" });
    card.appendChild(domEl("h3", { text: "📦 Legacy alert data found" }));

    const p = migrationPreview();

    if (!p.v1Present || !p.rawIsArray) {
      card.appendChild(
        domEl("p", {
          className: "muted small",
          text: "No legacy alert data was found on this device.",
        }),
      );
      container.appendChild(card);
      return card;
    }

    card.appendChild(
      domEl("p", {
        className: "small",
        text: `${p.total} legacy alert${p.total === 1 ? "" : "s"} found. ${p.validCount} can be imported safely; ${p.invalidCount} will be discarded.`,
      }),
    );

    if (p.invalidCount > 0) {
      const details = domEl("div", { className: "mt" });
      details.appendChild(
        domEl("div", {
          className: "muted small",
          text: "Reasons for discard:",
        }),
      );
      const ul = domEl("ul", { className: "tx-list" });
      for (const [reason, count] of Object.entries(p.reasonBreakdown)) {
        ul.appendChild(
          domEl("li", { text: `${count} × ${reasonLabel(reason)}` }),
        );
      }
      details.appendChild(ul);
      card.appendChild(details);
    }

    const actions = domEl("div", { className: "qa mt" });

    if (p.validCount > 0) {
      const importBtn = domEl("button", {
        className: "btn primary",
        text: `Import ${p.validCount} alert${p.validCount === 1 ? "" : "s"}`,
      });
      importBtn.type = "button";
      importBtn.onclick = () => {
        W.ui.confirm(
          `Import ${p.validCount} legacy alert${p.validCount === 1 ? "" : "s"}? The legacy data will be cleared afterwards.`,
          () => {
            const r = migrationApply({ clearV1: true });
            if (r.ok) {
              W.ui.toast(
                `Imported ${r.migrated} alert${r.migrated === 1 ? "" : "s"}` +
                  (r.skipped ? `, skipped ${r.skipped}` : ""),
                "ok",
              );
            } else {
              W.ui.toast(`Import failed: ${r.reason}`, "warn");
            }
            container.innerHTML = "";
          },
        );
      };
      actions.appendChild(importBtn);
    }

    const backupBtn = domEl("button", {
      className: "btn tiny",
      text: "⬇ Back up (.json)",
    });
    backupBtn.type = "button";
    backupBtn.onclick = () => {
      const r = migrationExport();
      if (r.ok) {
        W.ui.toast(`Backup saved: ${r.filename}`, "ok", 5000);
      } else {
        W.ui.toast(`Backup failed: ${r.reason}`, "warn");
      }
    };
    actions.appendChild(backupBtn);

    const discardBtn = domEl("button", {
      className: "btn tiny",
      text: "Discard without importing",
    });
    discardBtn.type = "button";
    discardBtn.onclick = () => {
      W.ui.confirm(
        "Discard all legacy alert data without importing? This cannot be undone.",
        () => {
          const r = migrationDiscard();
          W.ui.toast(
            r.ok ? "Legacy data discarded" : "Discard failed",
            r.ok ? "ok" : "warn",
          );
          container.innerHTML = "";
        },
      );
    };
    actions.appendChild(discardBtn);

    card.appendChild(actions);
    container.appendChild(card);
    return card;
  }

  // ═══════════════════════════════════════════════════════
  // IMPORT CARD — file picker for .json backups
  // ═══════════════════════════════════════════════════════
  function reasonLabelImport(reason) {
    switch (reason) {
      case "not-a-file":
        return "not a file";
      case "empty-file":
        return "file is empty";
      case "file-too-large":
        return "file exceeds size limit";
      case "not-json-extension":
        return "file is not .json";
      case "read-error":
        return "browser could not read the file";
      case "read-null":
        return "file contents were empty";
      case "read-throw":
        return "browser threw while reading";
      case "invalid-json":
        return "file is not valid JSON";
      case "dangerous-keys":
        return "file contains forbidden keys";
      case "not-an-object":
        return "file root is not an object";
      case "wrong-exporter":
        return "file was not created by Weaver";
      case "no-records-array":
        return "file has no records array";
      case "records-too-many":
        return "file has an implausible number of records";
      case "no-valid-records":
        return "no records passed validation";
      case "save-failed":
        return "could not write to storage";
      case "sanitize-threw":
        return "record failed sanitization";
      case "fails-v2-validation":
        return "record fails current schema";
      default:
        return reason;
    }
  }

  function mountImportCard(container) {
    if (!container) return null;
    container.innerHTML = "";

    const card = domEl("div", { className: "card" });
    card.appendChild(domEl("h3", { text: "📥 Import alert backup" }));
    card.appendChild(
      domEl("p", {
        className: "muted small",
        text: `Restore alerts from a .json backup created by Weaver. Max file size ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)} MB. Imported alerts are validated against the current schema; anything that fails is skipped and reported.`,
      }),
    );

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.className = "input";
    input.id = "a-import-file";

    const actions = domEl("div", { className: "qa mt" });
    const importBtn = domEl("button", {
      className: "btn primary",
      text: "📥 Import",
    });
    importBtn.type = "button";
    importBtn.disabled = true;

    const resultBox = domEl("div", { className: "mt" });

    input.onchange = () => {
      importBtn.disabled = !(input.files && input.files[0]);
      resultBox.innerHTML = "";
    };

    importBtn.onclick = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      importBtn.disabled = true;
      importBtn.textContent = "Importing…";
      resultBox.innerHTML = "";

      const r = await importFromFile(file);

      importBtn.textContent = "📥 Import";
      importBtn.disabled = false;

      if (r.ok) {
        const line = domEl("div", { className: "ai-brief" });
        line.textContent =
          `Imported ${r.imported} alert${r.imported === 1 ? "" : "s"}` +
          (r.skipped ? `, skipped ${r.skipped}` : "") +
          (r.rejectedCount ? `, rejected ${r.rejectedCount}` : "") +
          ".";
        resultBox.appendChild(line);

        if (r.rejectedCount > 0) {
          const ul = domEl("ul", { className: "tx-list mt" });
          for (const [reason, count] of Object.entries(r.reasonBreakdown)) {
            ul.appendChild(
              domEl("li", {
                text: `${count} × ${reasonLabelImport(reason)}`,
              }),
            );
          }
          resultBox.appendChild(ul);
        }
        W.ui.toast(
          `Imported ${r.imported} alert${r.imported === 1 ? "" : "s"}`,
          "ok",
        );
        input.value = "";
        importBtn.disabled = true;
      } else {
        const line = domEl("div", { className: "ai-brief" });
        line.style.borderColor = "var(--down)";
        const sizeNote =
          r.size && r.max
            ? ` (${Math.round(r.size / 1024)} KB > ${Math.round(r.max / 1024)} KB)`
            : "";
        line.textContent = `Import failed: ${reasonLabelImport(r.reason)}${sizeNote}`;
        resultBox.appendChild(line);

        if (r.reasonBreakdown) {
          const ul = domEl("ul", { className: "tx-list mt" });
          for (const [reason, count] of Object.entries(r.reasonBreakdown)) {
            ul.appendChild(
              domEl("li", {
                text: `${count} × ${reasonLabelImport(reason)}`,
              }),
            );
          }
          resultBox.appendChild(ul);
        }
      }
    };

    actions.appendChild(importBtn);

    card.appendChild(input);
    card.appendChild(actions);
    card.appendChild(resultBox);
    container.appendChild(card);
    return card;
  }

  // ═══════════════════════════════════════════════════════
  // MIGRATION BANNER — one-time prompt
  // ═══════════════════════════════════════════════════════
  function bannerShouldShow() {
    if (!hasV1()) return false;
    const dismissed = safeGet(BANNER_DISMISSED_KEY, false);
    if (dismissed) return false;
    const done = safeGet(MIGRATION_DONE_KEY, null);
    if (done) return false;
    return true;
  }

  function dismissBanner() {
    safeSet(BANNER_DISMISSED_KEY, Date.now());
  }

  function renderBanner({ onReview } = {}) {
    if (!bannerShouldShow()) return null;

    const p = migrationPreview();
    const bar = domEl("div", {
      className: "banner banner-info alert-migration-banner",
    });
    bar.setAttribute("role", "status");

    const msg = domEl("div", { className: "banner-msg" });
    msg.appendChild(
      domEl("b", {
        text: `📦 ${p.total} legacy alert${p.total === 1 ? "" : "s"} can be migrated`,
      }),
    );
    msg.appendChild(
      domEl("span", {
        className: "muted small",
        text:
          p.invalidCount > 0
            ? ` ${p.validCount} safe to import · ${p.invalidCount} will be discarded.`
            : " All records pass validation.",
      }),
    );
    bar.appendChild(msg);

    const actions = domEl("div", { className: "banner-actions" });

    if (p.validCount > 0) {
      const reviewBtn = domEl("button", {
        className: "btn tiny primary",
        text: "Review",
      });
      reviewBtn.type = "button";
      reviewBtn.onclick = () => {
        if (typeof onReview === "function") onReview();
        else W.ui.toast("Open Settings → Alerts to review migration", "info");
      };
      actions.appendChild(reviewBtn);
    }

    const backupBtn = domEl("button", {
      className: "btn tiny",
      text: "⬇ Back up",
    });
    backupBtn.type = "button";
    backupBtn.onclick = () => {
      const r = migrationExport();
      if (r.ok) W.ui.toast(`Backup saved: ${r.filename}`, "ok", 5000);
      else W.ui.toast(`Backup failed: ${r.reason}`, "warn");
    };
    actions.appendChild(backupBtn);

    const dismissBtn = domEl("button", {
      className: "icon-btn",
      text: "×",
    });
    dismissBtn.type = "button";
    dismissBtn.setAttribute("aria-label", "Dismiss this notice");
    dismissBtn.onclick = () => {
      dismissBanner();
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    };
    actions.appendChild(dismissBtn);

    bar.appendChild(actions);
    return bar;
  }

  function mountBanner(container, opts) {
    if (!container || typeof container.appendChild !== "function") return null;
    const existing = container.querySelector(".alert-migration-banner");
    if (existing) return existing;
    const banner = renderBanner(opts);
    if (banner) container.appendChild(banner);
    return banner;
  }

  function autoMountBanner(opts) {
    const selectors = [
      "#app-banners",
      "#banners",
      ".app-banners",
      "#main-content",
      "main",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const mounted = mountBanner(el, opts);
        if (mounted) return mounted;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════
  const api = {
    // Core
    render,
    check,
    list,
    save,
    updateBadge,
    requestNotificationPermission,

    // Migration
    migration: {
      preview: migrationPreview,
      apply: migrationApply,
      discard: migrationDiscard,
      export: migrationExport,
      importFromFile,
      hasV1,
      mountCard: mountMigrationCard,
      mountImportCard,
    },

    // Settings
    settings: {
      renderNotificationSettings,
      mountNotificationSettings,
      getPermissionState,
    },

    // Banner
    banner: {
      shouldShow: bannerShouldShow,
      render: renderBanner,
      mount: mountBanner,
      autoMount: autoMountBanner,
      dismiss: dismissBanner,
    },

    // Test surface
    _internal: {
      esc,
      safeImageUrl,
      isValidAlert,
      sanitizeAlert,
      condText,
      cryptoRandomId,
      checkV1Shape,
      hasDangerKeys,
      validateExportEnvelope,
      parseImportPayload,
      mergeImportedRecords,
      reasonLabelImport,
      IMG_PLACEHOLDER,
      MAX_ALERTS,
      MAX_VAL,
      MAX_IMPORT_FILE_BYTES,
      NOTIFY_COOLDOWN_MS,
      TEST_THROTTLE_MS,
      LEGACY_KEY,
      NEW_KEY: KEY,
      BANNER_DISMISSED_KEY,
      MIGRATION_DONE_KEY,
      EXPORTER_TAG,
      DANGER_KEYS,
      reasonLabel,
    },
  };

  setTimeout(() => {
    try {
      autoMountBanner();
    } catch (e) {
      console.warn("[Alerts] Banner auto-mount failed:", e && e.message);
    }
  }, 0);

  return api;
})();

console.log(
  "[Alerts] Module loaded v2 (single-file) — core, migration, settings, import, banner.",
);
