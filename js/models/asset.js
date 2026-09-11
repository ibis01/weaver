// ===============================================================
//         Canonical Asset Identity Model
// ===============================================================

window.W = window.W || {};
W.asset = W.asset || {};

(function () {
  const CACHE_KEY = "asset_resolve_cache";
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // ── Cache helpers ─────────────────────────────────────────────
  function getCache() {
    return W.store.get(CACHE_KEY, {});
  }

  function setCache(cache) {
    W.store.set(CACHE_KEY, cache);
  }

  function pruneCache(cache) {
    const now = Date.now();
    const pruned = {};
    for (const [key, entry] of Object.entries(cache)) {
      if (entry && entry.cachedAt && now - entry.cachedAt < CACHE_TTL) {
        pruned[key] = entry;
      }
    }
    return pruned;
  }

  // ── Chain inference ───────────────────────────────────────────
  function inferChainId(coin) {
    if (!coin) return "unknown";
    if (coin.id === "bitcoin") return "bitcoin";
    if (coin.id === "ethereum") return "ethereum";
    if (coin.id === "solana") return "solana";
    if (coin.id === "binancecoin") return "bsc";
    if (coin.id === "matic-network" || coin.id === "polygon-ecosystem-token")
      return "polygon";
    if (coin.id === "avalanche-2") return "avalanche";
    if (coin.id === "arbitrum") return "arbitrum";
    if (coin.id === "optimism") return "optimism";
    // Default to ethereum for ERC-20s
    return "ethereum";
  }

  // ── Canonical resolution ──────────────────────────────────────
  /**
   * Resolve a user input (symbol, name, coingeckoId) to a canonical AssetId.
   * @param {string} input - Symbol, name, or Coingecko ID.
   * @returns {Promise<Object>} - { chainId, contractAddress, symbol, coingeckoId, name }
   */
  async function resolveAssetId(input) {
    if (!input || typeof input !== "string") {
      throw new Error("Invalid asset input");
    }

    const normalized = input.trim().toLowerCase();
    if (!normalized) throw new Error("Empty asset input");

    // 1. Check cache
    const cache = getCache();
    if (cache[normalized] && cache[normalized].assetId) {
      return cache[normalized].assetId;
    }

    // 2. If input already looks like a Coingecko ID, use it directly
    //    (heuristic: lowercase, hyphen-separated, no spaces)
    const looksLikeCoingeckoId =
      /^[a-z0-9-]+$/.test(normalized) && normalized.length > 2;

    // 3. Query Coingecko search
    try {
      const result = await W.api.search(normalized);
      const coins = (result && result.coins) || [];

      if (coins.length === 0) {
        // Fallback: return a synthetic AssetId using the input as symbol
        return fallbackAssetId(input);
      }

      // Prefer exact ID match, else first result
      let coin = coins.find((c) => c.id === normalized) || coins[0];

      const assetId = {
        chainId: inferChainId(coin),
        contractAddress: null, // not available from search; refined later if needed
        symbol: (coin.symbol || input).toUpperCase(),
        coingeckoId: coin.id,
        name: coin.name || input,
      };

      // 4. Cache the result
      cache[normalized] = {
        assetId,
        cachedAt: Date.now(),
      };
      setCache(pruneCache(cache));

      return assetId;
    } catch (e) {
      console.warn("[Asset] Resolve failed, using fallback:", e.message);
      return fallbackAssetId(input);
    }
  }

  // ── Fallback (never throws) ───────────────────────────────────
  function fallbackAssetId(input) {
    return {
      chainId: "unknown",
      contractAddress: null,
      symbol: String(input).toUpperCase(),
      coingeckoId: null,
      name: String(input),
    };
  }

  // ── Price lookup ──────────────────────────────────────────────
  async function getPrice(assetId) {
    if (!assetId) return 0;
    const key = assetId.coingeckoId || assetId.symbol;
    if (!key) return 0;
    try {
      const data = await W.api.markets(key);
      return (data[0] && data[0].current_price) || 0;
    } catch {
      return 0;
    }
  }

  // ── Exports ───────────────────────────────────────────────────
  W.asset = {
    resolveAssetId,
    resolve: resolveAssetId, // backward-compat alias
    getPrice,
    inferChainId,
  };

  console.log("[Asset] Identity module loaded.");
})();
