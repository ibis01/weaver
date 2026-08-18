// ===============================================================
//                  Market Data API
// ===============================================================

window.W = window.W || {};

W.api = (() => {
  // ── Constants ─────────────────────────────────────────
  const CG_API = "https://api.coingecko.com/api/v3";
  const BINANCE_API = "https://api.binance.com/api/v3";
  const CACHE_TTL = 60000; // 1 minute
  const LONG_CACHE_TTL = 300000; // 5 minutes

  // ── Proxy chain for CORS bypass ─────────────────────────
  const PROXIES = [
    // Use your local proxy first (must be running on port 3001)
    (u) => "http://localhost:3001/proxy?url=" + encodeURIComponent(u),
    // Direct (will fail due to CORS, but kept as fallback)
    (u) => u,
    // Public proxies
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  ];

  // ── State ──────────────────────────────────────────────
  let source = "coingecko";
  let circuitBreaker = { failures: 0, until: 0 };

  // ── Helpers ────────────────────────────────────────────
  function getCurrency() {
    return W.currency ? W.currency() : "usd";
  }

  function getCacheKey(url) {
    return "api_cache:" + url;
  }

  function getCached(url, ttl = CACHE_TTL) {
    try {
      const raw = sessionStorage.getItem(getCacheKey(url));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > ttl) {
        sessionStorage.removeItem(getCacheKey(url));
        return null;
      }
      return data.value;
    } catch (e) {
      return null;
    }
  }

  function setCached(url, value) {
    try {
      sessionStorage.setItem(
        getCacheKey(url),
        JSON.stringify({
          timestamp: Date.now(),
          value: value,
        }),
      );
    } catch (e) {
      // sessionStorage full or unavailable
    }
  }

  function isCircuitOpen() {
    return Date.now() < circuitBreaker.until;
  }

  function recordFailure() {
    circuitBreaker.failures++;
    if (circuitBreaker.failures >= 5) {
      circuitBreaker.until = Date.now() + 90000; // 90 seconds
      circuitBreaker.failures = 0;
      console.warn("[Prices] Circuit breaker open for 90s");
    }
  }

  function resetCircuit() {
    circuitBreaker.failures = 0;
    circuitBreaker.until = 0;
  }

  // ── Fetch with proxy fallback ─────────────────────────
  async function fetchWithProxy(url, timeout = 10000, ttl = CACHE_TTL) {
    // Check cache first
    const cached = getCached(url, ttl);
    if (cached !== null) {
      source = "cache";
      return cached;
    }

    // Check circuit breaker
    if (isCircuitOpen()) {
      throw new Error("Circuit breaker open (network issues)");
    }

    let lastError = null;
    for (const proxy of PROXIES) {
      const proxyUrl = proxy(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(proxyUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Weaver/1.0 (Crypto Portfolio Tracker)",
            Accept: "application/json",
          },
        });
        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setCached(url, data);
        resetCircuit();
        source =
          proxy === PROXIES[0]
            ? "proxy"
            : proxy === PROXIES[1]
              ? "direct"
              : "public-proxy";
        return data;
      } catch (e) {
        lastError = e;
        clearTimeout(timer);
        console.warn(
          `[Prices] Proxy ${proxyUrl.substring(0, 60)}... failed:`,
          e.message,
        );
      }
    }

    recordFailure();
    throw lastError || new Error("All proxies failed");
  }

  // ── Symbol mapping cache ──────────────────────────────
  const symMap = () => W.store.get("sym-map", {});

  function learnSymbols(coins) {
    const map = symMap();
    (coins || []).forEach((c) => {
      if (c.id && c.symbol) map[c.id] = c.symbol;
    });
    try {
      W.store.set("sym-map", map);
    } catch (e) {}
  }

  function getSymbol(id) {
    return (symMap()[id] || id).toUpperCase();
  }

  // ── CoinGecko API ──────────────────────────────────────
  const coingecko = {
    markets: (ids) =>
      fetchWithProxy(
        `${CG_API}/coins/markets?vs_currency=${getCurrency()}&ids=${ids.join(",")}&price_change_percentage=24h,7d,30d&sparkline=true`,
        CACHE_TTL,
      ).then((d) => {
        learnSymbols(d);
        source = "coingecko";
        return d;
      }),

    chart: (id, days) =>
      fetchWithProxy(
        `${CG_API}/coins/${id}/market_chart?vs_currency=${getCurrency()}&days=${days}`,
        LONG_CACHE_TTL,
      ).then((d) => d.prices || []),

    top: (limit) =>
      fetchWithProxy(
        `${CG_API}/coins/markets?vs_currency=${getCurrency()}&order=market_cap_desc&per_page=${limit}&page=1&price_change_percentage=24h,7d,30d&sparkline=true`,
        CACHE_TTL,
      ).then((d) => {
        learnSymbols(d);
        source = "coingecko";
        return d;
      }),

    global: () =>
      fetchWithProxy(`${CG_API}/global`, LONG_CACHE_TTL).then((d) => d),

    search: (query) =>
      fetchWithProxy(
        `${CG_API}/search?query=${encodeURIComponent(query)}`,
        CACHE_TTL,
      ).then((d) => d),

    coin: (id) =>
      fetchWithProxy(
        `${CG_API}/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
        LONG_CACHE_TTL,
      ).then((d) => d),

    trending: () =>
      fetchWithProxy(`${CG_API}/search/trending`, CACHE_TTL).then((d) => d),
  };

  // ── Binance API (fallback) ────────────────────────────
  const binance = {
    markets: (ids) => {
      const symbols = ids.map((id) => getSymbol(id) + "USDT");
      return fetchWithProxy(
        `${BINANCE_API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
        CACHE_TTL,
      ).then((d) => {
        const arr = Array.isArray(d) ? d : [];
        source = "binance";
        return arr.map((item) => ({
          id: item.symbol.replace("USDT", "").toLowerCase(),
          symbol: item.symbol.replace("USDT", "").toLowerCase(),
          name: item.symbol.replace("USDT", ""),
          image: "",
          current_price: parseFloat(item.lastPrice),
          market_cap: null,
          total_volume: parseFloat(item.quoteVolume),
          price_change_percentage_24h_in_currency: parseFloat(
            item.priceChangePercent,
          ),
          price_change_percentage_7d_in_currency: null,
          price_change_percentage_30d_in_currency: null,
          sparkline_in_7d: null,
          market_cap_rank: null,
        }));
      });
    },

    chart: (id, days) => {
      const symbol = getSymbol(id) + "USDT";
      return fetchWithProxy(
        `${BINANCE_API}/klines?symbol=${symbol}&interval=1d&limit=${days}`,
        LONG_CACHE_TTL,
      ).then((d) => {
        const arr = Array.isArray(d) ? d : [];
        return arr.map((k) => [k[0], parseFloat(k[4])]);
      });
    },
  };

  // ── API with smart failover ────────────────────────────
  async function withFailover(method, ...args) {
    const order = method === "top" ? ["coingecko"] : ["coingecko", "binance"];

    for (const providerName of order) {
      const provider = providerName === "coingecko" ? coingecko : binance;
      if (!provider[method]) continue;

      try {
        const result = await provider[method](...args);
        source = providerName;
        return result;
      } catch (e) {
        console.warn(`[Prices] ${providerName}.${method} failed:`, e.message);
        // Continue to next provider
      }
    }

    throw new Error(`All providers failed for ${method}`);
  }

  // ── Top cache (fallback for top data) ─────────────────
  let topCache = null;
  let topCacheTime = 0;

  async function getTopCached(limit) {
    const now = Date.now();
    if (topCache && now - topCacheTime < 3600000) {
      source = "topcache";
      return topCache.slice(0, limit);
    }

    try {
      const data = await withFailover("top", 100);
      topCache = data;
      topCacheTime = now;
      return data.slice(0, limit);
    } catch (e) {
      if (topCache) {
        source = "topcache (stale)";
        return topCache.slice(0, limit);
      }
      throw e;
    }
  }

  // ── Public API ──────────────────────────────────────────
  return {
    // Core methods
    markets: (ids) => {
      if (!ids || !ids.length) return Promise.resolve([]);
      const idArray = typeof ids === "string" ? ids.split(",") : ids;
      return withFailover("markets", idArray);
    },

    chart: (id, days = 30) => withFailover("chart", id, days),

    top: (limit = 100) => {
      if (limit <= 50) {
        // Use cached top data for small requests
        return getTopCached(limit);
      }
      return withFailover("top", limit);
    },

    global: () => withFailover("global"),

    search: (query) => withFailover("search", query),

    coin: (id) => withFailover("coin", id),

    trending: () => withFailover("trending"),

    // Fear & Greed (special endpoint)
    fearGreed: () =>
      fetchWithProxy("https://api.alternative.me/fng/?limit=1", CACHE_TTL).then(
        (d) => d.data?.[0] || { value: "50", value_classification: "Neutral" },
      ),

    // Symbol utilities
    getSymbol,
    learnSymbols,

    // Source tracking
    get source() {
      return source;
    },
    set source(s) {
      source = s;
    },
  };
})();

console.log("[Prices] Module loaded.");
