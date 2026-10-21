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
  const MODULE_VERSION = "wallet-history-v2";
  const CACHE_KEY = "sm.wallet-history.v2";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const CACHE_MAX_ENTRIES = 400;
  const FETCH_TIMEOUT_MS = 20000;
  const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
  const MAX_TRANSFERS_PER_QUERY = 2000;
  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const ATTRIBUTION = Object.freeze({
    DIRECT_ORIGINATOR: "DIRECT_ORIGINATOR",
    TRACED_ECONOMIC_RECIPIENT: "TRACED_ECONOMIC_RECIPIENT",
    INTERMEDIARY: "INTERMEDIARY",
    UNRESOLVED: "UNRESOLVED",
    ERROR: "ERROR",
  });

  // Common DEX Routers (Ethereum)
  const KNOWN_DEX_ROUTERS = new Set([
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2
    "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3
    "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", // Uniswap Universal
    "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", // SushiSwap
    "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch V5
    "0x1111111254fb6c44bac0bed2854e76f90643097d", // 1inch V4
  ]);

  // Common CEX Hot Wallets (Ethereum) - Used for funding analysis
  const KNOWN_CEX_WALLETS = new Set([
    "0x28c6c06298d514db089934071355e5743bf21d60", // Binance 14
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549", // Binance 15
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d", // Binance 16
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f", // Binance 17
    "0x9696f59e4d72e237be84ffd425dcad154bf96976", // Binance 18
    "0x4976a4a02f38326660d17bf34b431dc6e2eb2327", // Binance 19
    "0x742d35cc6634c0532925a3b844bc454e4438f44e", // Bitfinex
    "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", // Coinbase 1
    "0x503828976d22510aad0201ac7ec88293211d23da", // Coinbase 2
    "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740", // Coinbase 3
    "0x3cd751e6b0078be393132286c442345e5dc49699", // Coinbase 4
  ]);

  function newMap() {
    return Object.create(null);
  }

  function isValidEthAddress(addr) {
    return typeof addr === "string" && ETH_ADDRESS_RE.test(addr);
  }

  // ── Cache ─────────────────────────────────────────────
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

  // ── Transfer parsing & attribution ────────────────────
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
    let attribution = ATTRIBUTION.UNRESOLVED;

    if (toHash === w && fromHash !== w) {
      side = "in";
      if (fromHash === ZERO_ADDRESS) {
        attribution = ATTRIBUTION.UNRESOLVED; // Mint
      } else if (KNOWN_DEX_ROUTERS.has(fromHash)) {
        attribution = ATTRIBUTION.TRACED_ECONOMIC_RECIPIENT; // Bought via Router
      } else {
        attribution = ATTRIBUTION.INTERMEDIARY; // Received from another wallet
      }
    } else if (fromHash === w && toHash !== w) {
      side = "out";
      attribution = ATTRIBUTION.DIRECT_ORIGINATOR; // Initiated transfer/sell
    } else {
      return null;
    }

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
      attribution,
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

    const baseUrl =
      BLOCKSCOUT_API +
      "/addresses/" +
      wallet.toLowerCase() +
      "/token-transfers?token=" +
      token.toLowerCase();

    const MAX_PAGES = 40;
    const allItems = [];
    let url = baseUrl;
    let fetchFailed = false;

    for (let page = 0; page < MAX_PAGES && url; page++) {
      let data;
      try {
        data = await fetchJSON(url);
      } catch (e) {
        if (allItems.length === 0) {
          console.warn(
            "[WalletHistory] Fetch failed for",
            wallet.slice(0, 6) + "…" + wallet.slice(-4),
            e && e.message,
          );
          fetchFailed = true;
        }
        break;
      }
      const items = Array.isArray(data && data.items) ? data.items : [];
      if (items.length === 0) break;
      allItems.push(...items);
      if (allItems.length >= MAX_TRANSFERS_PER_QUERY) break;
      const next = data && data.next_page_params;
      if (!next || typeof next !== "object") break;
      const qs = new URLSearchParams();
      for (const k of Object.keys(next)) {
        const v = next[k];
        if (v === null || v === undefined) continue;
        qs.set(k, String(v));
      }
      url = baseUrl + "&" + qs.toString();
    }

    if (fetchFailed && allItems.length === 0) {
      try {
        setCached(wallet, token, []);
      } catch (_) {}
      return { trades: [], reason: "fetch-failed" };
    }

    const trades = [];
    for (const item of allItems.slice(0, MAX_TRANSFERS_PER_QUERY)) {
      const parsed = parseTransfer(item, wallet);
      if (parsed) trades.push(parsed);
    }

    trades.sort((a, b) => a.at - b.at);

    setCached(wallet, token, trades);

    return { trades, cached: false };
  }

  async function fetchFundingSources(chain, wallet) {
    if (chain !== "ethereum")
      return { fundingSources: [], reason: "unsupported-chain" };
    if (!isValidEthAddress(wallet))
      return { fundingSources: [], reason: "invalid-wallet" };

    const url = `${BLOCKSCOUT_API}/addresses/${wallet.toLowerCase()}/transactions`;

    try {
      const data = await fetchJSON(url);
      const items = Array.isArray(data.items) ? data.items : [];

      const sortedItems = items.slice().reverse();
      const fundingSources = [];

      for (const tx of sortedItems) {
        if (!tx || !tx.from || !tx.to) continue;
        const from = tx.from.hash.toLowerCase();
        const to = tx.to.hash.toLowerCase();

        if (to === wallet.toLowerCase() && from !== wallet.toLowerCase()) {
          if (KNOWN_CEX_WALLETS.has(from)) {
            fundingSources.push({ source: from, type: "cex" });
          } else if (from === ZERO_ADDRESS) {
            fundingSources.push({ source: from, type: "mint" });
          } else {
            fundingSources.push({ source: from, type: "wallet" });
          }

          if (fundingSources.length >= 2) break;
        }
      }

      return { fundingSources, cached: false };
    } catch (e) {
      console.warn("[WalletHistory] Funding source fetch failed:", e.message);
      return { fundingSources: [], reason: "fetch-failed" };
    }
  }

  function resetCache() {
    try {
      W.store?.delete?.(CACHE_KEY);
    } catch (_) {}
  }

  return Object.freeze({
    fetchTrades,
    fetchFundingSources,
    version: MODULE_VERSION,
    ATTRIBUTION,
    _internal: Object.freeze({
      parseTransfer,
      cacheKey,
      resetCache,
      CACHE_KEY,
      CACHE_TTL_MS,
      CACHE_MAX_ENTRIES,
      KNOWN_DEX_ROUTERS,
      KNOWN_CEX_WALLETS,
    }),
  });
})();

console.log(
  "[WalletHistory] Module loaded — Blockscout fetch, attribution logic.",
);
