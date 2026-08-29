// ===============================================================
//         Asset Identity Model
// ===============================================================
//
// Purpose: Canonical asset identity across chains, tokens, and native coins.
// Resolves user-provided symbols/names to full AssetId using Coingecko.
//
// ===============================================================

window.W = window.W || {};
W.asset = W.asset || {};

(function () {
  // ── AssetId structure ────────────────────────────────────────
  // {
  //   chainId: 'ethereum' | 'solana' | 'bitcoin' | ...,
  //   contractAddress: string | null,  // null for native coins
  //   symbol: string,                 // display symbol
  //   coingeckoId: string | null,     // primary key for price lookup
  // }

  // ── Local cache for resolved assets ─────────────────────────
  const RESOLVE_CACHE_KEY = "asset_resolve_cache";
  function getCache() {
    return W.store.get(RESOLVE_CACHE_KEY, {});
  }
  function setCache(cache) {
    W.store.set(RESOLVE_CACHE_KEY, cache);
  }

  // ── Resolve a user input (symbol, name, partial) to AssetId ──
  async function resolve(input) {
    if (!input || typeof input !== "string") {
      throw new Error("Invalid input");
    }

    const cache = getCache();
    const normalized = input.trim().toLowerCase();
    // Check cache first
    if (cache[normalized]) {
      return cache[normalized];
    }

    // Query Coingecko search
    try {
      const result = await W.api.search(normalized);
      if (!result || !result.coins || result.coins.length === 0) {
        throw new Error(`No asset found for "${input}"`);
      }

      // Take the first result that matches closely
      const coin = result.coins[0];
      const assetId = {
        chainId: inferChainId(coin), // heuristic
        contractAddress: null, // we don't have it from search; will be set later if needed
        symbol: coin.symbol.toUpperCase(),
        coingeckoId: coin.id,
        name: coin.name,
      };

      // Cache it
      cache[normalized] = assetId;
      setCache(cache);

      return assetId;
    } catch (e) {
      console.warn("[Asset] Resolve failed:", e.message);
      // Fallback: create a minimal AssetId using the input as symbol
      return {
        chainId: "unknown",
        contractAddress: null,
        symbol: input.toUpperCase(),
        coingeckoId: null,
        name: input,
      };
    }
  }

  // ── Heuristic: infer chain from coin data ────────────────────
  function inferChainId(coin) {
    // This is simplistic; in production we'd use the platforms field
    if (coin.id === "bitcoin") return "bitcoin";
    if (coin.id === "ethereum") return "ethereum";
    if (coin.id === "solana") return "solana";
    if (coin.id === "binancecoin") return "bsc";
    // For tokens, we need more info; default to 'ethereum' for now
    return "ethereum";
  }

  // ── Get price for an AssetId ──────────────────────────────────
  async function getPrice(assetId) {
    if (assetId.coingeckoId) {
      const data = await W.api.markets(assetId.coingeckoId);
      return data[0]?.current_price || 0;
    }
    // Fallback: try symbol
    const data = await W.api.markets(assetId.symbol);
    return data[0]?.current_price || 0;
  }

  // ── Exports ────────────────────────────────────────────────────
  W.asset = {
    resolve,
    getPrice,
    inferChainId,
  };

  console.log("[Asset] Identity module loaded.");
})();
