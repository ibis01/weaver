// ===============================================================
//         Decision Journal Module 
// ===============================================================

window.W = window.W || {};
W.journal = W.journal || {};

(function () {
  "use strict";

  // ── Constants ─────────────────────────────────────────
  const JOURNAL_KEY = "decision_journal_v2";
  const LEGACY_KEY = "decision_journal";

  const MAX_DECISIONS = 500;
  const MAX_ASSET_LEN = 32;
  const MAX_REASONING_LEN = 2000;
  const MAX_HORIZON_LEN = 64;
  const MAX_ID_LEN = 32;
  const MAX_THESIS_ID_LEN = 128;
  const MAX_AMOUNT = 1e15;
  const MAX_PRICE = 1e15;

  const VALID_ACTIONS = ["Buy", "Sell", "Hold"];

  const DANGER_KEYS = ["__proto__", "constructor", "prototype"];

  // ── Prototype-safe map factory ────────────────────────
  function newMap() {
    return Object.create(null);
  }

  // ── Attribute-safe escaping ───────────────────────────
  // Escapes all five HTML-significant characters. Safe for both
  // text and quoted-attribute contexts. Do NOT use
  // W.fmt.escapeHTML for attribute values — the standard
  // implementation does not escape quotes.
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

  function safeStr(v, maxLen) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return maxLen ? s.slice(0, maxLen) : s;
  }

  function safeNum(v, fallback = null) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  // ── Danger-key scan ───────────────────────────────────
  function hasDangerKeys(obj, depth = 0) {
    if (depth > 16) return true;
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

  // ── Safe storage ──────────────────────────────────────
  function safeStoreGet(key, fallback) {
    try {
      if (!W.store || typeof W.store.get !== "function") return fallback;
      const raw = W.store.get(key, null);
      if (raw === null || raw === undefined) return fallback;
      return raw;
    } catch (e) {
      console.warn("[Journal] Storage read failed:", e && e.message);
      return fallback;
    }
  }

  function safeStoreSet(key, value) {
    try {
      if (!W.store || typeof W.store.set !== "function") return false;
      W.store.set(key, value);
      return true;
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "unknown";
      if (/quota/i.test(msg)) {
        W.ui.toast(
          "Storage full — delete some decisions to continue",
          "warn",
          6000,
        );
      } else {
        console.warn("[Journal] Storage write failed:", msg);
      }
      return false;
    }
  }

  // ── ID generation ─────────────────────────────────────
  function generateId() {
    const c = window.crypto || window.msCrypto;
    if (c && typeof c.getRandomValues === "function") {
      const bytes = new Uint8Array(10);
      c.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback: not cryptographically strong, but IDs are local keys.
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  // ── Record validation ─────────────────────────────────
  // Every decision read from storage passes through this. Records
  // that fail are dropped, not repaired — a "repair" is where
  // tampered data slips through.
  function isValidDecision(d) {
    if (!d || typeof d !== "object") return false;
    if (hasDangerKeys(d)) return false;
    if (typeof d.id !== "string" || !d.id || d.id.length > MAX_ID_LEN) {
      return false;
    }
    if (typeof d.asset !== "string" || !d.asset) return false;
    if (!VALID_ACTIONS.includes(d.action)) return false;
    if (typeof d.amount !== "number" || !Number.isFinite(d.amount))
      return false;
    if (typeof d.price !== "number" || !Number.isFinite(d.price)) return false;
    if (d.thesisId !== null && typeof d.thesisId !== "string") return false;
    if (typeof d.reasoning !== "string") return false;
    if (d.confidence !== null && typeof d.confidence !== "number") return false;
    if (typeof d.horizon !== "string") return false;
    if (typeof d.timestamp !== "string" || !d.timestamp) return false;
    return true;
  }

  // Rebuild each decision into a null-prototype object with every
  // field coerced and capped. Attacker-controlled keys are stripped.
  function sanitizeDecision(d) {
    const out = newMap();
    out.id = safeStr(d.id, MAX_ID_LEN);
    out.asset = safeStr(d.asset, MAX_ASSET_LEN).toUpperCase();
    out.action = VALID_ACTIONS.includes(d.action) ? d.action : "Hold";
    out.amount = Math.max(0, Math.min(MAX_AMOUNT, safeNum(d.amount, 0)));
    out.price = Math.max(0, Math.min(MAX_PRICE, safeNum(d.price, 0)));
    out.thesisId = d.thesisId ? safeStr(d.thesisId, MAX_THESIS_ID_LEN) : null;
    out.reasoning = safeStr(d.reasoning, MAX_REASONING_LEN);
    out.confidence =
      d.confidence === null
        ? null
        : Math.max(0, Math.min(1, safeNum(d.confidence, null)));
    out.horizon = safeStr(d.horizon, MAX_HORIZON_LEN) || "Short-term";
    out.timestamp = safeStr(d.timestamp, 32);
    return out;
  }

  // ── Load decisions ────────────────────────────────────
  // Read, validate, sanitize. Anything malformed is dropped.
  function loadDecisions() {
    const raw = safeStoreGet(JOURNAL_KEY, []);
    if (!Array.isArray(raw)) return [];
    const valid = [];
    for (const d of raw) {
      if (valid.length >= MAX_DECISIONS) break;
      if (isValidDecision(d)) valid.push(sanitizeDecision(d));
    }
    return valid;
  }

  // One-time silent migration from the v1 key. v1 records were
  // unvalidated, so anything that fails validation is discarded.
  function migrateFromV1() {
    if (safeStoreGet(JOURNAL_KEY, null) !== null) return; // already migrated
    const legacy = safeStoreGet(LEGACY_KEY, null);
    if (!Array.isArray(legacy) || !legacy.length) return;
    const valid = [];
    for (const d of legacy) {
      if (valid.length >= MAX_DECISIONS) break;
      if (isValidDecision(d)) valid.push(sanitizeDecision(d));
    }
    safeStoreSet(JOURNAL_KEY, valid);
  }

  let decisions = (migrateFromV1(), loadDecisions());

  function save() {
    const capped = decisions.slice(0, MAX_DECISIONS).map(sanitizeDecision);
    const ok = safeStoreSet(JOURNAL_KEY, capped);
    if (ok) decisions = capped;
    return ok;
  }

  function all() {
    return decisions;
  }

  // ── Confidence parsing ────────────────────────────────
  // Empty / invalid → null. Valid numeric in [0,1] → number.
  function parseConfidenceInput(raw) {
    if (raw === "" || raw === null || raw === undefined) return null;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < 0 || parsed > 1) return null;
    return parsed;
  }

  // ── Create ────────────────────────────────────────────
  function create(data) {
    if (!data || typeof data !== "object") return null;

    if (decisions.length >= MAX_DECISIONS) {
      W.ui.toast(
        `Decision limit reached (${MAX_DECISIONS}). Delete some first.`,
        "warn",
      );
      return null;
    }

    const asset = safeStr(data.asset, MAX_ASSET_LEN).trim().toUpperCase();
    if (!asset) {
      W.ui.toast("Asset is required", "warn");
      return null;
    }

    const action = VALID_ACTIONS.includes(data.action) ? data.action : "Hold";

    const rawAmount = parseFloat(data.amount);
    const amount =
      Number.isFinite(rawAmount) && rawAmount >= 0
        ? Math.min(rawAmount, MAX_AMOUNT)
        : 0;

    const rawPrice = parseFloat(data.price);
    const price =
      Number.isFinite(rawPrice) && rawPrice >= 0
        ? Math.min(rawPrice, MAX_PRICE)
        : 0;

    const reasoning = safeStr(data.reasoning, MAX_REASONING_LEN).trim();
    if (!reasoning) {
      W.ui.toast("Reasoning is required", "warn");
      return null;
    }

    const decision = newMap();
    decision.id = generateId();
    decision.asset = asset;
    decision.action = action;
    decision.amount = amount;
    decision.price = price;
    decision.thesisId = data.thesisId
      ? safeStr(data.thesisId, MAX_THESIS_ID_LEN)
      : null;
    decision.reasoning = reasoning;
    decision.confidence = parseConfidenceInput(data.confidence);
    decision.horizon =
      safeStr(data.horizon, MAX_HORIZON_LEN).trim() || "Short-term";
    decision.timestamp = new Date().toISOString();

    decisions.unshift(decision);
    if (!save()) {
      // Roll back the in-memory insert if the write failed.
      decisions = decisions.filter((d) => d.id !== decision.id);
      return null;
    }
    return decision;
  }

  function remove(id) {
    if (typeof id !== "string" || !id) return false;
    const before = decisions.length;
    decisions = decisions.filter((d) => d.id !== id);
    if (decisions.length === before) return false;
    save();
    return true;
  }

  // ── Render ────────────────────────────────────────────
  // Track render sequence so a stale market fetch cannot overwrite
  // a newer render's badges.
  let renderSeq = 0;

  async function render(view) {
    if (!view) return;
    const mySeq = ++renderSeq;

    const activeTheses = W.theses
      ? W.theses.all().filter((t) => t.status === "active")
      : [];

    view.innerHTML = `
      <div class="card">
        <h3>📓 Decision Journal</h3>
        <p class="text-muted small-text">Record WHY you are making a trade. A transaction records WHAT happened; this records WHY.</p>
        <button class="btn primary" id="btn-new-decision">+ Log Decision</button>
      </div>

      <div id="decision-list" class="mt-16">
        ${decisions.length === 0 ? '<p class="text-muted">No decisions logged yet.</p>' : ""}
        ${decisions.map((d) => renderDecisionCard(d, activeTheses)).join("")}
      </div>

      <div id="decision-form-container" class="card hidden mt-16">
        <h4>Log New Decision</h4>
        <form id="decision-form" class="form-grid">
          <input type="text" id="d-asset" placeholder="Asset (e.g. BTC)" required maxlength="${MAX_ASSET_LEN}" class="input">
          <select id="d-action" class="input">
            <option value="Buy">Buy</option>
            <option value="Sell">Sell</option>
            <option value="Hold">Hold / DCA</option>
          </select>
          <input type="number" id="d-amount" placeholder="Amount" step="any" min="0" class="input">
          <input type="number" id="d-price" placeholder="Execution Price" step="any" min="0" class="input">
          <select id="d-thesis" class="input">
            <option value="">-- Link to Thesis (Optional) --</option>
            ${activeTheses
              .map(
                (t) =>
                  `<option value="${esc(t.id)}">${esc(safeStr(t.asset, 32))}: ${esc(safeStr(t.statement, 60))}</option>`,
              )
              .join("")}
          </select>
          <input type="number" id="d-confidence" placeholder="Confidence (0.0 to 1.0, optional)" step="0.1" min="0" max="1" class="input">
          <input type="text" id="d-horizon" placeholder="Time Horizon (e.g. 2 weeks)" maxlength="${MAX_HORIZON_LEN}" class="input">
          <textarea id="d-reasoning" placeholder="Why are you making this decision? What is the context?" required maxlength="${MAX_REASONING_LEN}" class="input col-span-full" rows="3"></textarea>
          <div class="flex-center gap-16 mt-16 col-span-full">
            <button type="submit" class="btn primary">Save Decision</button>
            <button type="button" class="btn ghost" id="btn-cancel-decision">Cancel</button>
          </div>
        </form>
      </div>
    `;

    view.querySelector("#btn-new-decision").onclick = () => {
      view.querySelector("#decision-form-container").classList.remove("hidden");
    };
    view.querySelector("#btn-cancel-decision").onclick = () => {
      view.querySelector("#decision-form-container").classList.add("hidden");
    };

    view.querySelector("#decision-form").onsubmit = async (e) => {
      e.preventDefault();
      const created = create({
        asset: view.querySelector("#d-asset").value,
        action: view.querySelector("#d-action").value,
        amount: view.querySelector("#d-amount").value,
        price: view.querySelector("#d-price").value,
        thesisId: view.querySelector("#d-thesis").value || null,
        confidence: view.querySelector("#d-confidence").value,
        horizon: view.querySelector("#d-horizon").value,
        reasoning: view.querySelector("#d-reasoning").value,
      });
      if (created) {
        await render(view);
        W.ui.toast("Decision logged", "ok");
      }
    };

    view.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.onclick = () => {
        if (remove(btn.dataset.id)) {
          render(view);
          W.ui.toast("Decision deleted", "ok");
        }
      };
    });

    // ── Decision Replay: pass 1 (synchronous) ────────────
    if (W.decisionReplay && decisions.length > 0 && mySeq === renderSeq) {
      decisions.forEach((d) => {
        const outcome = W.decisionReplay.evaluate(d, { price: null });
        const container = view.querySelector(
          `.replay-container[data-decision-id="${cssEscape(d.id)}"]`,
        );
        if (container) {
          container.innerHTML = W.decisionReplay.renderBadge(outcome);
        }
      });
    }

    // ── Decision Replay: pass 2 (async, sequenced) ──────
    const uniqueAssets = [
      ...new Set(decisions.map((d) => d.asset && d.asset.toLowerCase())),
    ].filter(Boolean);

    if (W.decisionReplay && uniqueAssets.length > 0 && W.api && W.api.markets) {
      try {
        const markets = await W.api.markets(uniqueAssets.join(","));
        // Abort if a newer render started while we were waiting.
        if (mySeq !== renderSeq) return;

        const priceMap = newMap();
        if (Array.isArray(markets)) {
          for (const m of markets) {
            if (!m || typeof m !== "object") continue;
            const id = typeof m.id === "string" ? m.id.toLowerCase() : null;
            const price = Number(m.current_price);
            if (id && Number.isFinite(price)) priceMap[id] = price;
          }
        }

        decisions.forEach((d) => {
          const key = d.asset ? d.asset.toLowerCase() : null;
          const currentPrice = key ? priceMap[key] : null;
          if (currentPrice === null || currentPrice === undefined) return;

          const outcome = W.decisionReplay.evaluate(d, {
            price: currentPrice,
          });
          const container = view.querySelector(
            `.replay-container[data-decision-id="${cssEscape(d.id)}"]`,
          );
          if (container) {
            container.innerHTML = W.decisionReplay.renderBadge(outcome);
          }
        });
      } catch (e) {
        console.warn(
          "[Journal] Replay market data unavailable:",
          e && e.message,
        );
      }
    }
  }

  // ── Decision card renderer ────────────────────────────
  function renderDecisionCard(d, activeTheses) {
    const linkedThesis = activeTheses.find((t) => t.id === d.thesisId);

    const actionColor =
      d.action === "Buy"
        ? "text-up"
        : d.action === "Sell"
          ? "text-down"
          : "text-muted";

    const confidenceLine =
      d.confidence !== null && d.confidence !== undefined
        ? `<span><b>Confidence:</b> ${(d.confidence * 100).toFixed(0)}%</span>`
        : `<span class="italic"><b>Confidence:</b> not stated</span>`;

    const linkedThesisLine = linkedThesis
      ? `<span><b>Linked Thesis:</b> ${W.fmt.escapeHTML(safeStr(linkedThesis.statement, 40))}…</span>`
      : "";

    // Every value that flows into an attribute uses `esc`, which
    // escapes quotes. Values in text nodes use esc as well so the
    // same function is exercised everywhere and no review step
    // has to distinguish context.
    return `
      <div class="card">
        <div class="flex-between mb-8">
          <div>
            <span class="${esc(actionColor)} font-bold text-2xl">${esc(d.action.toUpperCase())}</span>
            <b>${esc(d.asset)}</b>
            <span class="replay-container" data-decision-id="${esc(d.id)}"></span>
            <span class="text-muted small-text"> @ ${W.fmt.price(d.price)}</span>
          </div>
          <span class="text-muted small-text">${W.fmt.relativeTime(d.timestamp)}</span>
        </div>
        <p class="small-text"><b>Reasoning:</b> ${esc(d.reasoning)}</p>
        <div class="flex-between mt-8 small-text text-muted">
          ${confidenceLine}
          <span><b>Horizon:</b> ${esc(d.horizon)}</span>
          ${linkedThesisLine}
        </div>
        <div class="mt-8 text-center">
          <button class="btn tiny danger" data-action="delete" data-id="${esc(d.id)}">Delete</button>
        </div>
      </div>
    `;
  }

  // ── CSS.escape fallback for querySelector ─────────────
  // `document.querySelector` with an attribute selector requires
  // the value to be CSS-escaped. Modern browsers ship
  // CSS.escape; the fallback handles the theoretical case where
  // it is missing.
  function cssEscape(s) {
    if (typeof s !== "string") return "";
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(s);
    }
    return s.replace(/["\\]/g, "\\$&");
  }

  W.journal = { all, create, remove, render };
})();

console.log(
  "[Journal] Decision module loaded v2 — validated, bounded, attribute-safe.",
);
