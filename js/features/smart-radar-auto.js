// js/features/smart-radar-auto.js
//
// Bounded auto-scan for the Smart Money Radar. Maintains a
// user-controlled watchlist of ETH tokens, scans exactly one per
// cycle, and caches the results for later consumption by the
// events pipeline.
//
// DESIGN NOTES:
//   - ONE token per cycle, hard rule. N wallets × M tokens on a
//     refresh cycle would exhaust Blockscout's free tier in
//     minutes. One token, one cycle, one HTTP burst.
//   - Cycle is 10 minutes by default. Cooldown is enforced across
//     reloads via persisted lastRunAt.
//   - Auto-scan is OFF by default. User must opt in via the toggle.
//   - The scheduler runs regardless of route but only scans when
//     the tab is visible. Hidden tabs do not burn rate limit.
//   - Results are cached for 24h so the dashboard and events
//     pipeline can read them without re-scanning.
//   - Never throws. Every failure logs and the cycle advances.

window.W = window.W || {};
W.smartRadar = W.smartRadar || {};

W.smartRadar.auto = (() => {
  "use strict";

  const MODULE_VERSION = "smart-radar-auto-v1";

  const WATCHLIST_KEY = "sm.radar-watchlist.v1";
  const SIGNALS_KEY   = "sm.radar-signals.v1";
  const STATE_KEY     = "sm.radar-auto-state.v1";

  const CYCLE_MS      = 10 * 60 * 1000;
  const TICK_MS       = 60 * 1000;
  const SIGNAL_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_WATCHLIST = 20;
  const MAX_SIGNALS   = 100;

  let timer = null;
  let scanning = false;

  function isValidEthAddress(a) {
    return typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a);
  }

  function safeGet(key, fallback) {
    try {
      const v = W.store && W.store.get ? W.store.get(key, fallback) : fallback;
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      console.warn("[SmartRadar.auto] read failed:", key, e && e.message);
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      if (W.store && W.store.set) W.store.set(key, value);
      return true;
    } catch (e) {
      console.warn("[SmartRadar.auto] write failed:", key, e && e.message);
      return false;
    }
  }

  // ── Watchlist ────────────────────────────────────
  function listWatchlist() {
    const raw = safeGet(WATCHLIST_KEY, []);
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const e of raw) {
      if (!e || typeof e !== "object") continue;
      if (typeof e.id !== "string" || !e.id) continue;
      if (!isValidEthAddress(e.tokenAddress)) continue;
      out.push({
        id: e.id,
        symbol: typeof e.symbol === "string" ? e.symbol : e.id,
        name: typeof e.name === "string" ? e.name : "",
        tokenAddress: e.tokenAddress.toLowerCase(),
        addedAt: Number.isFinite(e.addedAt) ? e.addedAt : Date.now(),
      });
    }
    return out;
  }

  function saveWatchlist(list) {
    const clean = [];
    const seen = Object.create(null);
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || typeof e !== "object") continue;
      if (typeof e.id !== "string" || !e.id) continue;
      if (!isValidEthAddress(e.tokenAddress)) continue;
      if (seen[e.id]) continue;
      if (clean.length >= MAX_WATCHLIST) break;
      seen[e.id] = 1;
      clean.push({
        id: e.id,
        symbol: typeof e.symbol === "string" ? e.symbol : e.id,
        name: typeof e.name === "string" ? e.name : "",
        tokenAddress: e.tokenAddress.toLowerCase(),
        addedAt: Number.isFinite(e.addedAt) ? e.addedAt : Date.now(),
      });
    }
    safeSet(WATCHLIST_KEY, clean);
    return clean;
  }

  async function addToWatchlist(coinInput) {
    if (!coinInput || typeof coinInput.id !== "string" || !coinInput.id) {
      return { ok: false, reason: "invalid-coin" };
    }
    let detail;
    try {
      detail = await W.api.coin(coinInput.id);
    } catch (e) {
      return { ok: false, reason: "coin-detail-failed", message: e && e.message };
    }
    const contract =
      detail && detail.platforms && typeof detail.platforms === "object"
        ? detail.platforms.ethereum
        : null;
    if (!isValidEthAddress(contract)) {
      return { ok: false, reason: "no-ethereum-contract" };
    }
    const existing = listWatchlist();
    if (existing.some((x) => x.id === coinInput.id)) {
      return { ok: false, reason: "already-in-watchlist" };
    }
    if (existing.length >= MAX_WATCHLIST) {
      return { ok: false, reason: "watchlist-full" };
    }
    existing.push({
      id: coinInput.id,
      symbol: detail.symbol || coinInput.symbol || coinInput.id,
      name: detail.name || "",
      tokenAddress: String(contract).toLowerCase(),
      addedAt: Date.now(),
    });
    saveWatchlist(existing);
    return { ok: true };
  }

  function removeFromWatchlist(id) {
    if (typeof id !== "string" || !id) return { ok: false, reason: "invalid-id" };
    const before = listWatchlist();
    const after = before.filter((x) => x.id !== id);
    if (after.length === before.length) {
      return { ok: false, reason: "not-found" };
    }
    saveWatchlist(after);
    return { ok: true };
  }

  // ── State ────────────────────────────────────────
  function getState() {
    const s = safeGet(STATE_KEY, null);
    if (!s || typeof s !== "object") {
      return { enabled: false, lastRunAt: 0, cursor: 0 };
    }
    return {
      enabled: s.enabled === true,
      lastRunAt: Number.isFinite(s.lastRunAt) ? s.lastRunAt : 0,
      cursor: Number.isFinite(s.cursor) && s.cursor >= 0 ? s.cursor : 0,
    };
  }

  function setState(patch) {
    const next = {
      enabled: getState().enabled,
      lastRunAt: getState().lastRunAt,
      cursor: getState().cursor,
    };
    if (patch && typeof patch === "object") {
      if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
      if (Number.isFinite(patch.lastRunAt)) next.lastRunAt = patch.lastRunAt;
      if (Number.isFinite(patch.cursor) && patch.cursor >= 0) {
        next.cursor = patch.cursor;
      }
    }
    safeSet(STATE_KEY, next);
    return next;
  }

  function isEnabled() { return getState().enabled === true; }

  function toggle(force) {
    const next = typeof force === "boolean" ? force : !isEnabled();
    setState({ enabled: next });
    return next;
  }

  // ── Signal cache ─────────────────────────────────
  function listSignals() {
    const raw = safeGet(SIGNALS_KEY, []);
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    const clean = [];
    for (const e of raw) {
      if (!e || typeof e !== "object") continue;
      if (!Number.isFinite(e.at)) continue;
      if (now - e.at > SIGNAL_TTL_MS) continue;
      clean.push(e);
    }
    clean.sort((a, b) => b.at - a.at);
    return clean;
  }

  function recordSignal(result) {
    if (!result || typeof result !== "object") return;
    const entry = {
      at: Date.now(),
      ok: result.ok === true,
      reason: typeof result.reason === "string" ? result.reason : null,
      tokenAddress:
        typeof result.tokenAddress === "string" ? result.tokenAddress : null,
      symbol:
        result.coin && typeof result.coin.symbol === "string"
          ? result.coin.symbol
          : null,
      signal: result.signal || null,
      convergence: result.convergence
        ? {
            convergence: result.convergence.convergence === true,
            independentWalletCount: result.convergence.independentWalletCount,
            reason: result.convergence.reason,
          }
        : null,
      momentum: result.momentum
        ? { momentumState: result.momentum.momentumState }
        : null,
    };
    const existing = listSignals();
    existing.unshift(entry);
    safeSet(SIGNALS_KEY, existing.slice(0, MAX_SIGNALS));
  }

  function clearSignals() {
    safeSet(SIGNALS_KEY, []);
  }

  // ── Scheduler ────────────────────────────────────
  function isVisible() {
    try {
      return (
        typeof document === "undefined" ||
        document.visibilityState !== "hidden"
      );
    } catch (_) {
      return true;
    }
  }

  async function runCycle() {
    if (scanning) return { skipped: "in-progress" };
    if (!isEnabled()) return { skipped: "disabled" };
    if (!isVisible()) return { skipped: "hidden" };

    const state = getState();
    const now = Date.now();
    if (state.lastRunAt && now - state.lastRunAt < CYCLE_MS) {
      return {
        skipped: "cooldown",
        remainingMs: CYCLE_MS - (now - state.lastRunAt),
      };
    }

    const watchlist = listWatchlist();
    if (!watchlist.length) return { skipped: "empty-watchlist" };

    const idx =
      ((state.cursor % watchlist.length) + watchlist.length) %
      watchlist.length;
    const token = watchlist[idx];

    scanning = true;
    let result;
    try {
      if (
        !W.smartRadar ||
        !W.smartRadar._internal ||
        typeof W.smartRadar._internal.runPipeline !== "function"
      ) {
        result = { ok: false, reason: "smart-radar-unavailable" };
      } else {
        result = await W.smartRadar._internal.runPipeline({
          id: token.id,
          symbol: token.symbol,
        });
      }
    } catch (e) {
      result = {
        ok: false,
        reason: "unexpected-error",
        message: e && e.message,
      };
    } finally {
      scanning = false;
    }

    recordSignal(result);
    setState({
      lastRunAt: Date.now(),
      cursor: (idx + 1) % Math.max(1, watchlist.length),
    });

    // Best-effort render into the current #/smart view if mounted.
    try {
      const view = document.getElementById("view");
      if (
        view &&
        view.dataset &&
        view.dataset.route === "smart" &&
        W.smartRadar._internal &&
        typeof W.smartRadar._internal.renderResult === "function"
      ) {
        const body = view.querySelector("#sm-radar-body");
        if (body) W.smartRadar._internal.renderResult(result, body);
      }
    } catch (_) {
      /* non-fatal */
    }

    return { ran: true, token: token.id, result };
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      runCycle().catch((e) => {
        console.warn("[SmartRadar.auto] cycle failed:", e && e.message);
      });
    }, TICK_MS);
    setTimeout(() => {
      runCycle().catch((e) => {
        console.warn("[SmartRadar.auto] initial cycle failed:", e && e.message);
      });
    }, 2000);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // ── UI ───────────────────────────────────────────
  function esc(v) {
    if (typeof W.miscEsc === "function") return W.miscEsc(v);
    if (v == null) return "";
    return String(v).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  function renderAutoCard(container) {
    if (!container) return;
    const state = getState();
    const watchlist = listWatchlist();
    const now = Date.now();
    const nextIn = state.lastRunAt
      ? Math.max(0, CYCLE_MS - (now - state.lastRunAt))
      : 0;
    const nextText = !state.enabled
      ? "—"
      : nextIn > 0
        ? Math.ceil(nextIn / 60000) + "m"
        : "now";

    const listHtml = watchlist.length
      ? watchlist
          .map(
            (t) => `
          <div class="kv-row">
            <span><b>${esc(t.symbol)}</b> <span class="muted small">${esc(t.name || "")}</span></span>
            <span>
              <button class="btn tiny" data-radar-remove="${esc(t.id)}" type="button">Remove</button>
            </span>
          </div>
        `,
          )
          .join("")
      : '<p class="muted small">No tokens in the auto-scan watchlist yet.</p>';

    container.innerHTML = `
      <div class="card" id="sm-radar-auto-card">
        <div class="flex-between mb-8">
          <h3>⏱️ Auto-scan watchlist</h3>
          <label class="small m-0">
            <input type="checkbox" id="sm-radar-auto-toggle" ${state.enabled ? "checked" : ""} class="w-auto">
            Enabled
          </label>
        </div>
        <p class="muted small">
          Scans one token per 10-minute cycle, only while the tab is
          visible. Scheduler rotates through the watchlist. Off by
          default; the toggle is persisted.
        </p>
        <div class="qa mt">
          <button class="btn tiny" id="sm-radar-add" type="button">+ Add picked token</button>
          <button class="btn tiny" id="sm-radar-scan-now" type="button">▶ Scan now</button>
          <span class="muted small" data-radar-next>Next: ${esc(nextText)}</span>
        </div>
        <div id="sm-radar-watchlist" class="mt">${listHtml}</div>
      </div>
    `;

    const toggleEl = container.querySelector("#sm-radar-auto-toggle");
    if (toggleEl) {
      toggleEl.onchange = () => {
        toggle(toggleEl.checked);
        renderAutoCard(container);
      };
    }

    const addBtn = container.querySelector("#sm-radar-add");
    if (addBtn) {
      addBtn.onclick = async () => {
        const view = document.getElementById("view");
        const pickerHost = view && view.querySelector("#sm-picker");
        const id = pickerHost && pickerHost.dataset && pickerHost.dataset.pickedId;
        const symbol =
          (pickerHost && pickerHost.dataset && pickerHost.dataset.pickedSymbol) ||
          "";
        if (!id) {
          W.ui && W.ui.toast && W.ui.toast("Pick a token first", "warn");
          return;
        }
        addBtn.disabled = true;
        const r = await addToWatchlist({ id, symbol });
        addBtn.disabled = false;
        if (r.ok) {
          W.ui && W.ui.toast && W.ui.toast("Added to auto-scan watchlist", "ok");
        } else {
          const msg =
            {
              "already-in-watchlist": "Already in the watchlist",
              "watchlist-full": "Watchlist full (max " + MAX_WATCHLIST + ")",
              "no-ethereum-contract":
                "Token has no Ethereum contract (ETH-only)",
              "coin-detail-failed": "Could not fetch token details",
            }[r.reason] || r.reason;
          W.ui && W.ui.toast && W.ui.toast(msg, "warn");
        }
        renderAutoCard(container);
      };
    }

    const scanBtn = container.querySelector("#sm-radar-scan-now");
    if (scanBtn) {
      scanBtn.onclick = async () => {
        scanBtn.disabled = true;
        try {
          // Force the cycle to run even if the cooldown has not
          // expired: user explicitly requested it.
          setState({ lastRunAt: 0 });
          await runCycle();
        } finally {
          scanBtn.disabled = false;
          renderAutoCard(container);
        }
      };
    }

    container.querySelectorAll("[data-radar-remove]").forEach((btn) => {
      btn.onclick = () => {
        removeFromWatchlist(btn.dataset.radarRemove);
        renderAutoCard(container);
      };
    });
  }

  // ── Auto-mount the card on #/smart ──────────────
  // Inserts the auto-card immediately after the existing radar
  // card (#sm-radar-card), only when the current route is #/smart.
  // Idempotent: does not re-insert if already present.
  function ensureMounted() {
    try {
      const view = document.getElementById("view");
      if (!view || !view.dataset || view.dataset.route !== "smart") return;
      const radarCard = view.querySelector("#sm-radar-card");
      if (!radarCard) return;
      if (view.querySelector("#sm-radar-auto-card")) return;

      const container = document.createElement("div");
      container.id = "sm-radar-auto-mount";
      radarCard.parentNode.insertBefore(container, radarCard.nextSibling);
      renderAutoCard(container);
    } catch (e) {
      console.warn("[SmartRadar.auto] ensureMounted failed:", e && e.message);
    }
  }

  if (typeof window !== "undefined") {
    // Mount on every route change, on load, and as a safety net
    // (route dispatches that do not fire hashchange).
    try {
      window.addEventListener("hashchange", () => setTimeout(ensureMounted, 100));
    } catch (_) {}
    try {
      setInterval(ensureMounted, 2000);
    } catch (_) {}
    const kick = () => {
      setTimeout(ensureMounted, 300);
      start();
    };
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", kick);
      } else {
        kick();
      }
    }
  }

  return Object.freeze({
    version: MODULE_VERSION,
    listWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    listSignals,
    clearSignals,
    isEnabled,
    toggle,
    getState,
    runCycle,
    start,
    stop,
    renderAutoCard,
    _internal: Object.freeze({
      WATCHLIST_KEY,
      SIGNALS_KEY,
      STATE_KEY,
      CYCLE_MS,
      TICK_MS,
      SIGNAL_TTL_MS,
      MAX_WATCHLIST,
      MAX_SIGNALS,
      recordSignal,
      ensureMounted,
    }),
  });
})();

console.log(
  "[SmartRadar.auto] Module loaded — bounded auto-scan, one token per cycle.",
);
