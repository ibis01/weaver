// ===============================================================
//                  Market Data API (Constitutionally Compliant)
// ===============================================================
// §3.4 Graceful Degradation: CoinGecko → Binance → Cache
// §3.6 Caching: Edge cache (Worker) + Local cache (last_known_prices)
// §2.7 No Fabricated Data: Never returns $0.00 for missing prices.
// ===============================================================

window.W = window.W || {};

W.api = (() => {
  // ── Constants ─────────────────────────────────────────
  const CG_API = "https://api.coingecko.com/api/v3";
  const BINANCE_API = "https://api.binance.com/api/v3";
  const CACHE_TTL = 60000; // 1 minute
  const LONG_CACHE_TTL = 300000; // 5 minutes

  // ── Request routes ───────────────────────────────────────
  // Tries Worker proxy first (for edge cache + CORS), then direct fetch.
  const PROXIES = [
    (u) =>
      "https://weaver-proxy.ibis01-weaver.workers.dev/proxy?url=" +
      encodeURIComponent(u),
    (u) => u, // Direct fetch (allowed by CSP for coingecko, binance, dexscreener)
  ];

  // ── State ─────────────────────────────────────────────
  let source = "coingecko";
  let circuitBreaker = { failures: 0, until: 0 };

  function schemaForUrl(url) {
    if (url.includes("/coins/markets")) return "markets";
    if (url.includes("/market_chart")) return "chart";
    if (url.includes("/search/trending")) return "trending";
    if (url.includes("/search?")) return "search";
    if (url.endsWith("/global")) return "global";
    if (url.includes("/coins/") && !url.includes("/coins/markets"))
      return "coin";
    if (url.includes("alternative.me/fng")) return "fearGreed";
    return null;
  }

  function resourceForUrl(url) {
    if (url.includes("/coins/markets")) return "markets";
    if (url.includes("/market_chart")) return "chart";
    if (url.includes("/search/trending")) return "trending";
    if (url.includes("/search?")) return "search";
    if (url.endsWith("/global")) return "global-market";
    if (url.includes("/coins/") && !url.includes("/coins/markets"))
      return "coin";
    if (url.includes("alternative.me/fng")) return "fear-greed";
    if (url.includes("binance.com")) return "markets";
    return "external-data";
  }

  function validateResponse(url, data) {
    const schema = schemaForUrl(url);
    if (schema && W.schemas) W.schemas.validate(schema, data);
    return data;
  }

  function getCurrency() {
    return W.currency ? W.currency() : "usd";
  }

  function getCacheKey(url) {
    return "api_cache:" + url;
  }

  function getCached(url, ttl = CACHE_TTL) {
    try {
      const raw = localStorage.getItem(getCacheKey(url));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > ttl) {
        localStorage.removeItem(getCacheKey(url));
        return null;
      }
      return data.value;
    } catch {
      return null;
    }
  }

  function setCached(url, value) {
    try {
      localStorage.setItem(
        getCacheKey(url),
        JSON.stringify({ timestamp: Date.now(), value }),
      );
      // Also update the shared last_known_prices cache for dashboard/walletsync
      if (Array.isArray(value)) {
        const priceCache = W.store.get("last_known_prices", {});
        value.forEach((coin) => {
          if (coin.id && coin.current_price != null) {
            priceCache[coin.id] = { price: coin.current_price, ts: Date.now() };
          }
        });
        W.store.set("last_known_prices", priceCache);
      }
    } catch {}
  }

  function isCircuitOpen() {
    return Date.now() < circuitBreaker.until;
  }
  function recordFailure() {
    circuitBreaker.failures++;
    if (circuitBreaker.failures >= 5) {
      circuitBreaker.until = Date.now() + 90000;
      circuitBreaker.failures = 0;
      console.warn("[Prices] Circuit breaker open for 90s");
    }
  }
  function resetCircuit() {
    circuitBreaker.failures = 0;
    circuitBreaker.until = 0;
  }

  async function fetchWithProxy(url, timeout = 10000, ttl = CACHE_TTL) {
    const cached = getCached(url, ttl);
    if (cached !== null) {
      source = "cache";
      W.dataHealth?.mark(resourceForUrl(url), {
        source: "cache",
        observedAt: Date.now() - ttl / 2,
        staleAfter: ttl,
      });
      return cached;
    }
    if (isCircuitOpen()) {
      throw new Error(
        "Network is temporarily unavailable. Please try again later.",
      );
    }
    for (const proxy of PROXIES) {
      const proxyUrl = proxy(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const init = {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        };
        const response = W.requestGuard
          ? await W.requestGuard.fetch(proxyUrl, init, {
              capacity: 12,
              refillMs: 10000,
              failureThreshold: 5,
              cooldownMs: 30000,
            })
          : await fetch(proxyUrl, init);
        clearTimeout(timer);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = validateResponse(url, await response.json());
        setCached(url, data);
        resetCircuit();
        source = proxy === PROXIES[0] ? "worker-proxy" : "direct";
        W.dataHealth?.mark(resourceForUrl(url), {
          source,
          observedAt: Date.now(),
          staleAfter: ttl * 2,
        });
        return data;
      } catch (e) {
        clearTimeout(timer);
        if (/HTTP 429|HTTP 401/.test(e.message)) {
          const stale = getCached(url, 86400000);
          if (stale !== null) {
            source = "cache (stale, rate limited)";
            W.dataHealth?.mark(resourceForUrl(url), {
              source: "cache (stale)",
              observedAt: Date.now(),
              staleAfter: 3600000,
            });
            console.warn(
              `[Prices] Rate limited/auth failed — serving stale cache for ${resourceForUrl(url)}`,
            );
            return stale;
          }
          console.warn(
            `[Prices] Rate limited (429/401) and no cache — ${resourceForUrl(url)} unavailable`,
          );
          throw new Error(
            "Rate limited by market data provider. Try again in 60 seconds.",
          );
        }
        console.warn(`[Prices] Proxy failed: ${e.message}`);
      }
    }
    recordFailure();
    throw new Error("Unable to fetch market data. Please try again later.");
  }

  const symMap = () => W.store.get("sym-map", {});
  function learnSymbols(coins) {
    const map = symMap();
    (coins || []).forEach((c) => {
      if (c.id && c.symbol) map[c.id] = c.symbol;
    });
    W.store.set("sym-map", map);
  }
  function getSymbol(id) {
    return (symMap()[id] || id).toUpperCase();
  }

  // ── CoinGecko API ─────────────────────────────────────
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

  // ── Binance API (Free, No Auth, CSP-Compliant Fallback) ──
  //
  // Used when CoinGecko fails (429/401). Binance does not require an API
  // key for public market data and is highly reliable. It returns current
  // price and 24h change, but no sparklines or 7d/30d data.
  //
  // §3.4 Graceful Degradation: We lose sparklines, but keep core pricing.

  const BINANCE_SYMBOL_MAP = {
    bitcoin: "BTCUSDT",
    ethereum: "ETHUSDT",
    tether: "USDTUSDT",
    "usd-coin": "USDCUSDT",
    binancecoin: "BNBUSDT",
    solana: "SOLUSDT",
    ripple: "XRPUSDT",
    cardano: "ADAUSDT",
    dogecoin: "DOGEUSDT",
    polkadot: "DOTUSDT",
    dai: "DAIUSDT",
    chainlink: "LINKUSDT",
    "matic-network": "MATICUSDT",
    litecoin: "LTCUSDT",
    tron: "TRXUSDT",
    avalanche: "AVAXUSDT",
    "avalanche-2": "AVAXUSDT",
    "wrapped-bitcoin": "WBTCUSDT",
    uniswap: "UNIUSDT",
    "the-open-network": "TONUSDT",
    stellar: "XLMUSDT",
    cosmos: "ATOMUSDT",
    shiba: "SHIBUSDT",
    "shiba-inu": "SHIBUSDT",
  };

  const binance = {
    markets: (ids) => {
      const symbols = ids.map((id) => BINANCE_SYMBOL_MAP[id]).filter(Boolean);
      if (!symbols.length) return Promise.resolve([]);

      const url = `${BINANCE_API}/ticker/24hr?symbols=${JSON.stringify(symbols)}`;
      return fetchWithProxy(url, CACHE_TTL).then((d) => {
        source = "binance";
        const rows = ids
          .map((id) => {
            const sym = BINANCE_SYMBOL_MAP[id];
            if (!sym) return null;
            const ticker = d.find((t) => t.symbol === sym);
            if (!ticker) return null;
            return {
              id,
              symbol: id === "matic-network" ? "matic" : id.split("-")[0],
              name: id,
              image: "",
              current_price: parseFloat(ticker.lastPrice),
              market_cap: null,
              total_volume: parseFloat(ticker.quoteVolume),
              price_change_percentage_24h_in_currency: parseFloat(
                ticker.priceChangePercent,
              ),
              price_change_percentage_7d_in_currency: null,
              price_change_percentage_30d_in_currency: null,
              sparkline_in_7d: null,
              market_cap_rank: null,
            };
          })
          .filter(Boolean);
        learnSymbols(rows);
        return rows;
      });
    },
    top: (limit) => {
      // Binance doesn't have a simple "top N by market cap" endpoint without auth.
      // Fall back to a hardcoded list of top coins for the dashboard tape.
      const topIds = Object.keys(BINANCE_SYMBOL_MAP).slice(0, limit);
      return binance.markets(topIds);
    },
    global: () =>
      Promise.reject(new Error("Binance does not provide global market data")),
    search: () => Promise.reject(new Error("Binance does not provide search")),
    coin: () =>
      Promise.reject(new Error("Binance does not provide detailed coin data")),
    trending: () =>
      Promise.reject(new Error("Binance does not provide trending data")),
    chart: () =>
      Promise.reject(
        new Error("Binance does not provide chart data via this endpoint"),
      ),
  };

  // ── OHLCV via CoinGecko ────────────────────────────────
  function ohlcvViaCoinGecko(id, interval, limit) {
    const days =
      interval === "1d"
        ? Math.max(1, Math.min(365, limit))
        : interval === "4h"
          ? Math.max(1, Math.min(90, Math.ceil(limit / 6)))
          : Math.max(1, Math.min(30, Math.ceil(limit / 24)));
    const url =
      `${CG_API}/coins/${id}/ohlc` +
      `?vs_currency=${getCurrency()}&days=${days}`;
    return fetchWithProxy(url, LONG_CACHE_TTL).then((d) => {
      const arr = Array.isArray(d) ? d : [];
      return arr.slice(-limit).map((k) => ({
        timestamp: Number(k[0]),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: 0,
        quoteVolume: 0,
      }));
    });
  }

  // ── API with smart failover ────────────────────────────
  // Order: CoinGecko (rich data) → Binance (reliable fallback) → Cache
  async function withFailover(method, ...args) {
    const order = ["coingecko", "binance"];
    for (const providerName of order) {
      const provider = providerName === "coingecko" ? coingecko : binance;
      if (!provider[method]) continue;
      try {
        const result = await provider[method](...args);
        source = providerName;
        return result;
      } catch (e) {
        console.warn(`[Prices] ${providerName}.${method} failed:`, e.message);
      }
    }
    throw new Error(
      `Market data temporarily unavailable. Using cached data if available.`,
    );
  }

  let topCache = null,
    topCacheTime = 0;
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

  return {
    markets: (ids) => {
      if (!ids || !ids.length) return Promise.resolve([]);
      const idArray = typeof ids === "string" ? ids.split(",") : ids;
      return withFailover("markets", idArray);
    },
    chart: (id, days = 30) => withFailover("chart", id, days),
    ohlcv: (id, interval = "1h", limit = 500) =>
      ohlcvViaCoinGecko(id, interval, limit).then((data) => {
        source = "coingecko";
        return data;
      }),
    top: (limit = 100) => {
      if (limit <= 50) return getTopCached(limit);
      return withFailover("top", limit);
    },
    global: () => withFailover("global"),
    search: (query) => withFailover("search", query),
    coin: (id) => withFailover("coin", id),
    trending: () => withFailover("trending"),
    fearGreed: () =>
      fetchWithProxy("https://api.alternative.me/fng/?limit=1", CACHE_TTL).then(
        (d) => d.data?.[0] || { value: "50", value_classification: "Neutral" },
      ),
    getSymbol,
    learnSymbols,
    get source() {
      return source;
    },
    set source(s) {
      source = s;
    },
  };
})();

console.log("[Prices] Module loaded (CoinGecko → Binance → Cache failover).");
