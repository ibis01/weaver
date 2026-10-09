// SKIP_CACHE_MARK: shorten timeout + cache failures
// js/intelligence/smart-money/wallet-history.js
//
// Fetch and cache per-wallet, per-token transfer history from
// Blockscout. Ethereum only for v1. Returns a timestamped trade
// list suitable for cost-basis reconstruction and early-entry
// scoring.
//
// DESIGN NOTES:
//   - Direct browser fetch to eth.blockscout.com. No Worker
//     involvement. Same approach W.smart already uses for holder
//     and token-transfer reads.
//   - Client cache, 24h TTL, keyed by (wallet, token). Public
//     on-chain data — not vault-routed.
//   - Never throws. Every public entry point returns a result
//     object with a `reason` field on failure.
//   - Prototype-safe. All maps are Object.create(null).
//   - Returns trades oldest-first. Consumers that want
//     newest-first reverse the array themselves.
//   - Independent of js/features/smart.js. This module loads
//     before W.smart is defined; it must never depend on it.

window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.walletHistory = (() => {
  const BLOCKSCOUT_API = "https://eth.blockscout.com/api/v2";
  const MODULE_VERSION = "wallet-history-v1";
  const CACHE_KEY = "sm.wallet-history.v1";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const CACHE_MAX_ENTRIES = 400;
  const FETCH_TIMEOUT_MS = 5000;
  const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
  const MAX_TRANSFERS_PER_QUERY = 2000;
  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

  function newMap() {
    return Object.create(null);
  }

  function isValidEthAddress(addr) {
    return typeof addr === "string" && ETH_ADDRESS_RE.test(addr);
  }

  // ── Cache ─────────────────────────────────────────────
  // One localStorage key holds an object keyed by
  // `${wallet}:${token}`. Entries expire after 24h; the cache is
  // capped and evicts the oldest observation when it grows.

  function loadCache() {
    try {
      const raw = W.store?.get?.(CACHE_KEY, null);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return newMap();
      }
      const out = newMap();
      const now = Date.now();
      for (const k of Object.keys(raw)) {
        const entry = raw[k];
        if (!entry || typeof entry !== "object") continue;
        if (!Number.isFinite(entry.observedAt)) continue;
        if (now - entry.observedAt > CACHE_TTL_MS) continue;
        if (!Array.isArray(entry.trades)) continue;
        out[k] = entry;
      }
      return out;
    } catch (e) {
      console.warn("[WalletHistory] Cache read failed:", e && e.message);
      return newMap();
    }
  }

  function saveCache(cache) {
    try {
      const keys = Object.keys(cache);
      if (keys.length > CACHE_MAX_ENTRIES) {
        keys
          .sort((a, b) => cache[a].observedAt - cache[b].observedAt)
          .slice(0, keys.length - CACHE_MAX_ENTRIES)
          .forEach((k) => {
            delete cache[k];
          });
      }
      W.store?.set?.(CACHE_KEY, cache);
      return true;
    } catch (e) {
      console.warn("[WalletHistory] Cache write failed:", e && e.message);
      return false;
    }
  }

  function cacheKey(wallet, token) {
    return wallet.toLowerCase() + ":" + token.toLowerCase();
  }

  function getCached(wallet, token) {
    const cache = loadCache();
    const entry = cache[cacheKey(wallet, token)];
    if (!entry) return null;
    return entry.trades;
  }

  function setCached(wallet, token, trades) {
    const cache = loadCache();
    cache[cacheKey(wallet, token)] = {
      observedAt: Date.now(),
      trades,
    };
    saveCache(cache);
  }

  // ── Fetch with hardening ──────────────────────────────
  // URL allowlist, timeout, size cap, advisory schema check,
  // dataHealth mark. Mirrors the shape of W.smart.fetchJSON but
  // lives independently so this module does not require W.smart
  // to be loaded.

  async function fetchJSON(url, timeoutMs = FETCH_TIMEOUT_MS) {
    if (typeof url !== "string" || !url.startsWith(BLOCKSCOUT_API + "/")) {
      throw new Error("Invalid Blockscout URL");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      const init = {
        signal: controller.signal,
        credentials: "omit",
        mode: "cors",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { Accept: "application/json" },
      };
      response = W.requestGuard
        ? await W.requestGuard.fetch(url, init, {
            capacity: 8,
            refillMs: 10000,
            failureThreshold: 4,
            cooldownMs: 30000,
          })
        : await fetch(url, init);
    } catch (e) {
      clearTimeout(timer);
      const reason = e && e.name === "AbortError" ? "timed out" : e?.message;
      throw new Error(`Blockscout request failed: ${reason}`);
    }
    clearTimeout(timer);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new Error("Response exceeds size cap");
    }

    let text;
    try {
      text = await response.text();
    } catch (_) {
      throw new Error("Failed to read response body");
    }
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("Response exceeds size cap");
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("Blockscout returned non-JSON");
    }

    if (W.schemas) {
      try {
        W.schemas.validate("blockscoutCollection", data);
      } catch (e) {
        console.warn("[WalletHistory] Schema advisory:", e && e.message);
      }
    }

    W.dataHealth?.mark("on-chain", {
      source: "blockscout",
      observedAt: Date.now(),
      staleAfter: CACHE_TTL_MS,
    });

    return data;
  }

  // ── Transfer parsing ──────────────────────────────────
  // Blockscout token-transfer record shape:
  //   { timestamp, from:{hash}, to:{hash},
  //     total:{value, decimals}, transaction_hash }
  //
  // Parses one record into a canonical trade:
  //   { side: "in"|"out", amount, at, txHash }
  //
  // Returns null on malformed input. Never invents a value.

  function parseTransfer(record, wallet) {
    if (!record || typeof record !== "object") return null;

    const fromHash =
      record.from && typeof record.from.hash === "string"
        ? record.from.hash.toLowerCase()
        : null;
    const toHash =
      record.to && typeof record.to.hash === "string"
        ? record.to.hash.toLowerCase()
        : null;
    if (!fromHash && !toHash) return null;
    if (fromHash === toHash) return null;

    const w = wallet.toLowerCase();
    let side = null;
    if (toHash === w && fromHash !== w) side = "in";
    else if (fromHash === w && toHash !== w) side = "out";
    else return null;

    const total = record.total;
    let raw = null;
    let decimals = 18;
    if (total && typeof total === "object") {
      if (typeof total.value === "string" || typeof total.value === "number") {
        raw = String(total.value);
      }
      const d = Number(total.decimals);
      if (Number.isFinite(d) && d >= 0 && d <= 36) decimals = d;
    }
    if (!raw) return null;

    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    const amount = n / Math.pow(10, decimals);
    if (!Number.isFinite(amount) || amount < 0) return null;

    const ts = new Date(record.timestamp || 0).getTime();
    if (!Number.isFinite(ts)) return null;

    return {
      side,
      amount,
      at: ts,
      txHash:
        typeof record.transaction_hash === "string"
          ? record.transaction_hash
          : null,
    };
  }

  // ── Public API ────────────────────────────────────────

  async function fetchTrades(chain, wallet, token) {
    if (chain !== "ethereum") {
      // v1 is ETH-only. Non-ETH chains are refused honestly
      // rather than silently routed to a host the client cannot
      // reach from the current allowlist.
      return { trades: [], reason: "unsupported-chain" };
    }
    if (!isValidEthAddress(wallet)) {
      return { trades: [], reason: "invalid-wallet" };
    }
    if (!isValidEthAddress(token)) {
      return { trades: [], reason: "invalid-token" };
    }

    const cached = getCached(wallet, token);
    if (cached) {
      return { trades: cached, cached: true };
    }

    const url =
      BLOCKSCOUT_API +
      "/addresses/" +
      wallet.toLowerCase() +
      "/token-transfers?token=" +
      token.toLowerCase();

    let data;
    try {
      data = await fetchJSON(url);
    } catch (e) {
      console.warn(
        "[WalletHistory] Fetch failed for",
        wallet.slice(0, 6) + "…" + wallet.slice(-4),
        e && e.message,
      );
      // Cache the failure for the standard TTL. Without this, mega-wallets
      // (exchange hot wallets, burn addresses) time out every cycle and
      // consume the entire wallet-history budget without producing data.
      // Retried after the TTL expires.
      try { setCached(wallet, token, []); } catch (_) {}
      return { trades: [], reason: "fetch-failed" };
    }

    const items = Array.isArray(data && data.items) ? data.items : [];
    const capped = items.slice(0, MAX_TRANSFERS_PER_QUERY);

    const trades = [];
    for (const item of capped) {
      const parsed = parseTransfer(item, wallet);
      if (parsed) trades.push(parsed);
    }

    // Blockscout returns newest-first. Sort oldest-first so
    // cost-basis reconstruction walks forward in time.
    trades.sort((a, b) => a.at - b.at);

    setCached(wallet, token, trades);

    return { trades, cached: false };
  }

  function resetCache() {
    try {
      W.store?.delete?.(CACHE_KEY);
    } catch (_) {}
  }

  return Object.freeze({
    fetchTrades,
    version: MODULE_VERSION,
    _internal: Object.freeze({
      parseTransfer,
      cacheKey,
      resetCache,
      CACHE_KEY,
      CACHE_TTL_MS,
      CACHE_MAX_ENTRIES,
    }),
  });
})();

console.log(
  "[WalletHistory] Module loaded — Blockscout token-transfer fetch, 24h cache.",
);
