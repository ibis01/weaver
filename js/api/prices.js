// ===============================================================
//                  Market Data API (Constitutionally Compliant)
// ===============================================================
// §3.4 Graceful Degradation: Binance → CoinCap → CoinPaprika → Cache
// §3.6 Caching: Edge cache (Worker) + Local cache (last_known_prices)
// §2.7 No Fabricated Data: Never returns $0.00 for missing prices.
//
// CoinGecko has been fully removed. Reasons:
//   - Requires a key on datacenter egress (Cloudflare Worker IP pool).
//     Anonymous requests get 429; keyed requests got 401 (bad key).
//   - Binance provides the same data, no key, no per-IP throttle of
//     that severity, and is already in the Worker's allowlist.
// CoinCap and CoinPaprika remain as fallbacks for IDs Binance does
// not list (mostly long-tail / non-Binance tokens).
//
// v4 changelog:
//   - CoinCap removed entirely (api.coincap.io no longer resolves).
//   - Provider order: CoinLore (primary) → CoinBase (secondary) →
//     CoinPaprika (tertiary, chart/search/trending only).
//   - CoinPaprika circuit breaker: HTTP 402 blocks the provider for
//     1 hour. The 60 req/h anonymous limit is enforced per shared
//     Cloudflare egress IP, so it trips constantly.
//   - LONG_CACHE_TTL raised to 30 minutes for chart/coin/global data
//     to reduce CoinPaprika call volume.
// ===============================================================

window.W = window.W || {};

W.api = (() => {
  const COINPAPRIKA_API = "https://api.coinpaprika.com/v1";
  const COINLORE_API = "https://api.coinlore.net/api";
  const COINBASE_API = "https://api.coinbase.com/v2";
  const CACHE_TTL = 60000; // 1 minute for live prices
  const LONG_CACHE_TTL = 1800000; // 30 minutes for chart/coin/global
  const TICKERS_TTL = 120000; // 2 minutes for /tickers snapshots

  const PROXIES = [
    (u) =>
      "https://weaver-proxy.ibis01-weaver.workers.dev/proxy?url=" +
      encodeURIComponent(u),
    (u) => u,
  ];

  // ── ID tables ────────────────────────────────────────
  const ID_TO_SYMBOL = {
    bitcoin: "BTC",
    ethereum: "ETH",
    binancecoin: "BNB",
    solana: "SOL",
    "usd-coin": "USDC",
    tether: "USDT",
    dai: "DAI",
    chainlink: "LINK",
    ripple: "XRP",
    cardano: "ADA",
    dogecoin: "DOGE",
    "shiba-inu": "SHIB",
    litecoin: "LTC",
    "bitcoin-cash": "BCH",
    tron: "TRX",
    stellar: "XLM",
    uniswap: "UNI",
    aave: "AAVE",
    "avalanche-2": "AVAX",
    polkadot: "DOT",
    matic: "MATIC",
    arbitrum: "ARB",
    optimism: "OP",
    cosmos: "ATOM",
    near: "NEAR",
    filecoin: "FIL",
    aptos: "APT",
  };

  const SYMBOL_TO_ID = {};
  for (const [id, sym] of Object.entries(ID_TO_SYMBOL)) SYMBOL_TO_ID[sym] = id;

  const ID_TO_PAPRIKA = {
    bitcoin: "btc-bitcoin",
    ethereum: "eth-ethereum",
    binancecoin: "bnb-binance-coin",
    solana: "sol-solana",
    "usd-coin": "usdc-usd-coin",
    tether: "usdt-tether",
    dai: "dai-dai",
    chainlink: "link-chainlink",
    ripple: "xrp-xrp",
    cardano: "ada-cardano",
    dogecoin: "doge-dogecoin",
    "shiba-inu": "shib-shiba-inu",
    litecoin: "ltc-litecoin",
    "bitcoin-cash": "bch-bitcoin-cash",
    tron: "trx-tron",
    stellar: "xlm-stellar",
    uniswap: "uni-uniswap",
    aave: "aave-new",
    "avalanche-2": "avax-avalanche",
    polkadot: "dot-polkadot",
    matic: "matic-polygon",
    arbitrum: "arb-arbitrum",
    optimism: "op-optimism",
    cosmos: "atom-cosmos",
    near: "near-near-protocol",
    filecoin: "fil-filecoin",
    aptos: "apt-aptos",
  };

  const COINBASE_PAIRS = {
    bitcoin: "BTC-USD",
    ethereum: "ETH-USD",
    binancecoin: "BNB-USD",
    solana: "SOL-USD",
    "usd-coin": "USDC-USD",
    dai: "DAI-USD",
    chainlink: "LINK-USD",
    ripple: "XRP-USD",
    cardano: "ADA-USD",
    dogecoin: "DOGE-USD",
    litecoin: "LTC-USD",
    "bitcoin-cash": "BCH-USD",
    stellar: "XLM-USD",
    uniswap: "UNI-USD",
    aave: "AAVE-USD",
    polkadot: "DOT-USD",
    cosmos: "ATOM-USD",
    filecoin: "FIL-USD",
    "avalanche-2": "AVAX-USD",
    matic: "MATIC-USD",
  };

  // ── Provider circuit breaker ─────────────────────────
  // When a provider returns HTTP 402 (CoinPaprika's quota-exhausted
  // signal), mark it blocked for 1 hour so subsequent calls skip it
  // immediately instead of burning the request guard.
  const providerBlockedUntil = {};
  function isProviderBlocked(name) {
    return (
      providerBlockedUntil[name] && Date.now() < providerBlockedUntil[name]
    );
  }
  function markProviderBlocked(name, ms) {
    providerBlockedUntil[name] = Date.now() + ms;
  }

  let source = "coinlore";
  let circuitBreaker = { failures: 0, until: 0 };

  function schemaForUrl(url) {
    if (url.includes("coinpaprika.com")) return null;
    if (url.includes("coinlore.net")) return null;
    if (url.includes("coinbase.com")) return null;
    if (url.includes("alternative.me/fng")) return "fearGreed";
    return null;
  }

  function resourceForUrl(url) {
    if (url.includes("coinpaprika.com") || url.includes("coinlore.net")) {
      if (url.includes("/ohlcv/") || url.includes("/chart/")) return "chart";
      if (url.includes("/global")) return "global-market";
      if (url.includes("/search")) return "search";
      if (url.includes("/tickers")) return "markets";
      if (url.includes("/coins/")) return "coin";
    }
    if (url.includes("coinbase.com")) return "markets";
    if (url.includes("alternative.me/fng")) return "fear-greed";
    return "external-data";
  }

  function validateResponse(url, data) {
    const schema = schemaForUrl(url);
    if (schema && W.schemas) W.schemas.validate(schema, data);
    return data;
  }

  function getCurrency() {
    return "usd";
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
      if (Array.isArray(value)) {
        const priceCache = W.store.get("last_known_prices", {});
        value.forEach((coin) => {
          if (coin.id && coin.current_price != null) {
            priceCache[coin.id] = { price: coin.current_price, ts: Date.now() };
          }
        });
        W.store.set("last_known_prices", priceCache);
      }
    } catch {
      // localStorage can overflow on large responses (CoinPaprika
      // /tickers is ~1 MB). Silently skip caching in that case — the
      // in-memory response is still returned to the caller.
    }
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
    if (isCircuitOpen())
      throw new Error(
        "Network is temporarily unavailable. Please try again later.",
      );

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
        // 402 is CoinPaprika's "anonymous tier exhausted" response on
        // some endpoints. Treat it like a rate limit and either serve
        // stale cache or propagate so the failover chain moves on.
        if (/HTTP 429|HTTP 401|HTTP 402|HTTP 403|HTTP 530/.test(e.message)) {
          const stale = getCached(url, 86400000);
          if (stale !== null) {
            source = "cache (stale, provider refused)";
            W.dataHealth?.mark(resourceForUrl(url), {
              source: "cache (stale)",
              observedAt: Date.now(),
              staleAfter: 3600000,
            });
            console.warn(
              `[Prices] Provider refused (${e.message}) — serving stale cache for ${resourceForUrl(url)}`,
            );
            return stale;
          }
          throw new Error(
            "Rate limited or blocked by market data provider. Try again in 60 seconds.",
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

  // ── CoinLore (PRIMARY) ──────────────────────────────
  // One batched call to /tickers/ returns the top 100 by market cap,
  // which is a superset of every ID in ID_TO_SYMBOL.
  const coinlore = {
    markets: async (ids) => {
      const wanted = (ids || []).filter((id) => ID_TO_SYMBOL[id]);
      if (!wanted.length) return [];
      const url = `${COINLORE_API}/tickers/?start=0&limit=100`;
      const data = await fetchWithProxy(url, CACHE_TTL, TICKERS_TTL);
      const bySymbol = {};
      (data.data || []).forEach((t) => {
        if (t && t.symbol) bySymbol[String(t.symbol).toUpperCase()] = t;
      });
      const rows = wanted
        .map((id) => {
          const t = bySymbol[ID_TO_SYMBOL[id]];
          if (!t) return null;
          return {
            id,
            symbol: String(t.symbol).toLowerCase(),
            name: t.name,
            image: "",
            current_price: parseFloat(t.price_usd),
            market_cap: parseFloat(t.market_cap_usd),
            total_volume: parseFloat(t.volume24) || null,
            price_change_percentage_24h_in_currency: parseFloat(
              t.percent_change_24h,
            ),
            price_change_percentage_7d_in_currency: parseFloat(
              t.percent_change_7d,
            ),
            price_change_percentage_30d_in_currency: null,
            sparkline_in_7d: null,
            market_cap_rank: parseInt(t.rank, 10) || null,
          };
        })
        .filter(Boolean);
      learnSymbols(rows);
      return rows;
    },
    top: async (limit) => {
      const url = `${COINLORE_API}/tickers/?start=0&limit=${Math.min(limit, 100)}`;
      const data = await fetchWithProxy(url, CACHE_TTL, TICKERS_TTL);
      return (data.data || []).map((t) => ({
        id: SYMBOL_TO_ID[String(t.symbol).toUpperCase()] || t.nameid,
        symbol: String(t.symbol).toLowerCase(),
        name: t.name,
        image: "",
        current_price: parseFloat(t.price_usd),
        market_cap: parseFloat(t.market_cap_usd),
        total_volume: parseFloat(t.volume24) || null,
        price_change_percentage_24h_in_currency: parseFloat(
          t.percent_change_24h,
        ),
        price_change_percentage_7d_in_currency: parseFloat(t.percent_change_7d),
        price_change_percentage_30d_in_currency: null,
        sparkline_in_7d: null,
        market_cap_rank: parseInt(t.rank, 10) || null,
      }));
    },
    global: () =>
      fetchWithProxy(`${COINLORE_API}/global/`, LONG_CACHE_TTL).then((d) => {
        const g = Array.isArray(d) ? d[0] : d;
        return {
          data: {
            total_market_cap: { usd: parseFloat(g.total_mcap) },
            total_volume: { usd: parseFloat(g.total_volume) },
            market_cap_percentage: { btc: parseFloat(g.btc_d) },
            market_cap_change_percentage_24h_usd:
              parseFloat(g.mcap_change) || 0,
          },
        };
      }),
    chart: () =>
      Promise.reject(new Error("CoinLore: chart endpoint not wired")),
    ohlcv: () => Promise.reject(new Error("CoinLore: OHLCV not wired")),
    search: () => Promise.reject(new Error("CoinLore: no search endpoint")),
    coin: () => Promise.reject(new Error("CoinLore: no coin-detail endpoint")),
    trending: () => Promise.reject(new Error("CoinLore: no trending endpoint")),
  };

  // ── Coinbase (SECONDARY) ────────────────────────────
  // No batch endpoint, so one request per coin. Only used for IDs
  // CoinLore didn't resolve (usually zero, since all our IDs sit in
  // the top 100 by market cap).
  const coinbase = {
    markets: async (ids) => {
      const wanted = (ids || []).filter((id) => COINBASE_PAIRS[id]);
      if (!wanted.length) return [];
      const rows = await Promise.all(
        wanted.map(async (id) => {
          try {
            const url = `${COINBASE_API}/prices/${COINBASE_PAIRS[id]}/spot`;
            const data = await fetchWithProxy(url, CACHE_TTL);
            const price = parseFloat(data?.data?.amount);
            if (!Number.isFinite(price)) return null;
            return {
              id,
              symbol: ID_TO_SYMBOL[id].toLowerCase(),
              name: id,
              image: "",
              current_price: price,
              market_cap: null,
              total_volume: null,
              price_change_percentage_24h_in_currency: null,
              price_change_percentage_7d_in_currency: null,
              price_change_percentage_30d_in_currency: null,
              sparkline_in_7d: null,
              market_cap_rank: null,
            };
          } catch {
            return null;
          }
        }),
      );
      const clean = rows.filter(Boolean);
      learnSymbols(clean);
      return clean;
    },
    top: () => Promise.reject(new Error("Coinbase: no top-list endpoint")),
    global: () => Promise.reject(new Error("Coinbase: no global endpoint")),
    chart: () => Promise.reject(new Error("Coinbase: chart not wired")),
    ohlcv: () => Promise.reject(new Error("Coinbase: OHLCV not wired")),
    search: () => Promise.reject(new Error("Coinbase: no search endpoint")),
    coin: () => Promise.reject(new Error("Coinbase: no coin-detail endpoint")),
    trending: () => Promise.reject(new Error("Coinbase: no trending endpoint")),
  };

  // ── CoinPaprika (TERTIARY + chart/search/trending) ──
  // IP-blocked at 60 req/hour from Cloudflare egress, with a 1-hour
  // block once tripped. Usable only for infrequent calls. The circuit
  // breaker below skips it entirely for 1h after the first 402.
  const coinpaprika = {
    markets: async (ids) => {
      const wanted = (ids || []).filter((id) => ID_TO_SYMBOL[id]);
      if (!wanted.length) return [];
      const url = `${COINPAPRIKA_API}/tickers?quotes=USD&limit=500`;
      const data = await fetchWithProxy(url, CACHE_TTL, TICKERS_TTL);
      const bySymbol = {};
      (data || []).forEach((t) => {
        if (t && t.symbol && t.quotes && t.quotes.USD) {
          bySymbol[String(t.symbol).toUpperCase()] = t;
        }
      });
      const rows = wanted
        .map((id) => {
          const t = bySymbol[ID_TO_SYMBOL[id]];
          if (!t) return null;
          const q = t.quotes.USD;
          return {
            id,
            symbol: String(t.symbol).toLowerCase(),
            name: t.name,
            image: "",
            current_price: q.price,
            market_cap: q.market_cap,
            total_volume: q.volume_24h,
            price_change_percentage_24h_in_currency: q.percent_change_24h,
            price_change_percentage_7d_in_currency: q.percent_change_7d,
            price_change_percentage_30d_in_currency: q.percent_change_30d,
            sparkline_in_7d: null,
            market_cap_rank: t.rank,
          };
        })
        .filter(Boolean);
      learnSymbols(rows);
      return rows;
    },
    top: async (limit) => {
      const url = `${COINPAPRIKA_API}/tickers?quotes=USD&limit=${limit}`;
      const data = await fetchWithProxy(url, CACHE_TTL, TICKERS_TTL);
      return (data || []).map((t) => {
        const q = t.quotes?.USD || {};
        const id = SYMBOL_TO_ID[String(t.symbol).toUpperCase()] || t.id;
        return {
          id,
          symbol: String(t.symbol).toLowerCase(),
          name: t.name,
          image: "",
          current_price: q.price,
          market_cap: q.market_cap,
          total_volume: q.volume_24h,
          price_change_percentage_24h_in_currency: q.percent_change_24h,
          price_change_percentage_7d_in_currency: q.percent_change_7d,
          price_change_percentage_30d_in_currency: q.percent_change_30d,
          sparkline_in_7d: null,
          market_cap_rank: t.rank,
        };
      });
    },
    chart: async (id, days = 30) => {
      const pid = ID_TO_PAPRIKA[id];
      if (!pid) throw new Error(`CoinPaprika: no slug for ${id}`);
      const end = new Date();
      const start = new Date(end.getTime() - days * 86400000);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const url = `${COINPAPRIKA_API}/coins/${pid}/ohlcv/historical?start=${fmt(start)}&end=${fmt(end)}`;
      const data = await fetchWithProxy(url, LONG_CACHE_TTL);
      return (data || []).map((k) => [
        new Date(k.time_open).getTime(),
        Number(k.close),
      ]);
    },
    ohlcv: async (id, _interval = "1h", limit = 500) => {
      const pid = ID_TO_PAPRIKA[id];
      if (!pid) throw new Error(`CoinPaprika: no slug for ${id}`);
      const end = new Date();
      const start = new Date(end.getTime() - Math.max(limit, 30) * 86400000);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const url = `${COINPAPRIKA_API}/coins/${pid}/ohlcv/historical?start=${fmt(start)}&end=${fmt(end)}`;
      const data = await fetchWithProxy(url, LONG_CACHE_TTL);
      return (data || []).slice(-limit).map((k) => ({
        timestamp: new Date(k.time_open).getTime(),
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume: Number(k.volume),
        quoteVolume: Number(k.volume),
      }));
    },
    global: () =>
      fetchWithProxy(`${COINPAPRIKA_API}/global`, LONG_CACHE_TTL).then((d) => ({
        data: {
          total_market_cap: { usd: d.market_cap_usd },
          total_volume: { usd: d.volume_24h_usd },
          market_cap_percentage: { btc: d.bitcoin_dominance_percentage },
          market_cap_change_percentage_24h_usd: d.market_cap_change_24h,
        },
      })),
    search: (query) =>
      fetchWithProxy(
        `${COINPAPRIKA_API}/search?q=${encodeURIComponent(query)}&c=currencies&limit=10`,
        CACHE_TTL,
      ).then((d) => ({
        coins: (d.currencies || []).map((c) => ({
          id: SYMBOL_TO_ID[String(c.symbol).toUpperCase()] || c.id,
          symbol: c.symbol,
          name: c.name,
          market_cap_rank: c.rank,
        })),
      })),
    coin: (id) => {
      const pid = ID_TO_PAPRIKA[id];
      if (!pid)
        return Promise.reject(new Error(`CoinPaprika: no slug for ${id}`));
      return fetchWithProxy(`${COINPAPRIKA_API}/coins/${pid}`, LONG_CACHE_TTL);
    },
    trending: async () => {
      const url = `${COINPAPRIKA_API}/tickers?quotes=USD&limit=250`;
      const data = await fetchWithProxy(url, CACHE_TTL, TICKERS_TTL);
      const sorted = (data || [])
        .filter(
          (t) =>
            t.quotes?.USD && Number.isFinite(t.quotes.USD.percent_change_24h),
        )
        .sort(
          (a, b) =>
            Math.abs(b.quotes.USD.percent_change_24h) -
            Math.abs(a.quotes.USD.percent_change_24h),
        )
        .slice(0, 10);
      return {
        coins: sorted.map((t) => {
          const id = SYMBOL_TO_ID[String(t.symbol).toUpperCase()] || t.id;
          return {
            item: {
              id,
              symbol: String(t.symbol).toLowerCase(),
              name: t.name,
              market_cap_rank: t.rank,
            },
          };
        }),
      };
    },
  };

  const providers = { coinlore, coinbase, coinpaprika };
  const ORDER = ["coinlore", "coinbase", "coinpaprika"];

  // ── Smart failover ──────────────────────────────────
  // markets(): accumulate partial results across providers so an ID
  // CoinLore doesn't list still gets priced via CoinBase/CoinPaprika.
  // everything else: first success wins.
  async function withFailover(method, ...args) {
    if (method === "markets") {
      const ids = Array.isArray(args[0])
        ? args[0]
        : String(args[0] || "").split(",");
      const result = {};
      const missing = new Set(ids.filter(Boolean));
      for (const name of ORDER) {
        if (!missing.size) break;
        const provider = providers[name];
        if (!provider?.markets) continue;
        if (isProviderBlocked(name)) {
          console.warn(`[Prices] ${name} skipped (circuit open)`);
          continue;
        }
        try {
          const partial = await provider.markets([...missing]);
          for (const row of partial || []) {
            if (row?.id && !result[row.id]) {
              result[row.id] = row;
              missing.delete(row.id);
            }
          }
          if (Object.keys(result).length) source = name;
        } catch (e) {
          if (/HTTP 402/.test(e.message)) {
            markProviderBlocked(name, 3600000);
            console.warn(`[Prices] ${name} blocked for 1h (HTTP 402)`);
          }
          console.warn(`[Prices] ${name}.markets failed:`, e.message);
        }
      }
      if (!Object.keys(result).length) {
        throw new Error("Market data temporarily unavailable.");
      }
      return Object.values(result);
    }

    // Single-shot methods. CoinLore first for top/global, CoinPaprika
    // for chart/ohlcv/search/coin/trending (CoinLore doesn't offer them).
    const order =
      method === "top" || method === "global"
        ? ["coinlore", "coinpaprika"]
        : ["coinpaprika"];

    for (const name of order) {
      const provider = providers[name];
      if (!provider?.[method]) continue;
      if (isProviderBlocked(name)) {
        console.warn(`[Prices] ${name}.${method} skipped (circuit open)`);
        continue;
      }
      try {
        const result = await provider[method](...args);
        source = name;
        return result;
      } catch (e) {
        if (/HTTP 402/.test(e.message)) {
          markProviderBlocked(name, 3600000);
          console.warn(`[Prices] ${name} blocked for 1h (HTTP 402)`);
        }
        console.warn(`[Prices] ${name}.${method} failed:`, e.message);
      }
    }
    throw new Error(
      "Market data temporarily unavailable. Using cached data if available.",
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
      return withFailover(
        "markets",
        typeof ids === "string" ? ids.split(",") : ids,
      );
    },
    chart: (id, days = 30) => withFailover("chart", id, days),
    ohlcv: (id, interval = "1h", limit = 500) =>
      withFailover("ohlcv", id, interval, limit),
    top: (limit = 100) =>
      limit <= 50 ? getTopCached(limit) : withFailover("top", limit),
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

console.log(
  "[Prices] Module loaded (CoinLore → CoinBase → CoinPaprika → Cache; circuit breaker active).",
);
