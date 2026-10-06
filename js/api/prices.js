// ===============================================================
//                  Market Data API
// ===============================================================

window.W = window.W || {};

W.api = (() => {
  const COINPAPRIKA_API = "https://api.coinpaprika.com/v1";
  const COINLORE_API = "https://api.coinlore.net/api";
  const COINBASE_API = "https://api.coinbase.com/v2";
  const BINANCE_API = "https://api.binance.com/api/v3";
  const KRAKEN_API = "https://api.kraken.com/0/public";
  const COINBASE_EXCHANGE_API = "https://api.exchange.coinbase.com";
  const BYBIT_API = "https://api.bybit.com/v5/market";

  const CACHE_TTL = 60000;
  const LONG_CACHE_TTL = 1800000;
  const TICKERS_TTL = 120000;

  const CACHE_MAX_ENTRIES = 200;
  const CACHE_MAX_BYTES = 2 * 1024 * 1024;
  const SYM_MAP_MAX = 500;

  const PROXIES = [
    (u) =>
      "https://weaver-proxy.ibis01-weaver.workers.dev/proxy?url=" +
      encodeURIComponent(u),
    (u) => u,
  ];

  // Hosts that must bypass the Worker and go direct from the browser.
  //
  // CoinPaprika's free tier is 20,000 req/month PER IP. The Worker's
  // shared Cloudflare egress IP pool exhausts that quota for every
  // Weaver user at once. Each user's own browser IP has its own fresh
  // 20,000/month, so direct routing eliminates the shared-bucket
  // failure mode entirely.
  //
  // CoinPaprika sends permissive CORS headers, so the browser can call
  // it directly without a relay. This list is intentionally minimal;
  // only add hosts verified to send Access-Control-Allow-Origin.
  const DIRECT_ONLY_DOMAINS = new Set([
    "api.binance.com",
    "api.coinpaprika.com",
  ]);

  // ── Token logo URLs ─────────────────────────────────────────
  const LOGO_MAP = Object.freeze({
    bitcoin: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
    ethereum:
      "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
    tether: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
    "usd-coin": "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
    binancecoin:
      "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
    solana: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
    ripple:
      "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png",
    cardano: "https://assets.coingecko.com/coins/images/975/small/cardano.png",
    dogecoin: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png",
    "shiba-inu":
      "https://assets.coingecko.com/coins/images/11939/small/shiba.png",
    litecoin: "https://assets.coingecko.com/coins/images/2/small/litecoin.png",
    "bitcoin-cash":
      "https://assets.coingecko.com/coins/images/780/small/bitcoin-cash-circle.png",
    tron: "https://assets.coingecko.com/coins/images/1094/small/tron-logo.png",
    stellar:
      "https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png",
    uniswap:
      "https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png",
    aave: "https://assets.coingecko.com/coins/images/12645/small/AAVE.png",
    dai: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png",
    polkadot:
      "https://assets.coingecko.com/coins/images/12171/small/polkadot.png",
    matic: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",
    "avalanche-2":
      "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
    arbitrum: "https://assets.coingecko.com/coins/images/16547/small/arb.jpg",
    optimism:
      "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",
    cosmos:
      "https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png",
    near: "https://assets.coingecko.com/coins/images/10365/small/near.jpg",
    filecoin:
      "https://assets.coingecko.com/coins/images/12817/small/filecoin.png",
    aptos:
      "https://assets.coingecko.com/coins/images/26455/small/aptos_round.png",
  });

  function logoFor(id) {
    return LOGO_MAP[id] || "";
  }

  // ── ID tables ────────────────────────────────────────
  const ID_TO_SYMBOL = Object.freeze({
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
  });

  const SYMBOL_TO_ID = Object.create(null);
  for (const id of Object.keys(ID_TO_SYMBOL)) {
    SYMBOL_TO_ID[ID_TO_SYMBOL[id]] = id;
  }
  Object.freeze(SYMBOL_TO_ID);

  const ID_TO_PAPRIKA = Object.freeze({
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
  });

  const COINBASE_PAIRS = Object.freeze({
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
  });

  // ── Binance pair mapping ────────────────────────────
  // Binance serves spot pairs as SYMBOL+USDT. USDT itself has no
  // USDTUSDT pair, so it is excluded. Anything not resolvable to a
  // valid pair (lowercase symbol, unknown id) is rejected and the
  // failover chain moves on to CoinPaprika.
  //
  // NOTE: Binance is fetched DIRECTLY from the browser, never
  // through the Worker. Binance rejects Cloudflare Worker egress
  // IPs with 403. The browser's own IP is not affected, and
  // Binance sends permissive CORS headers for its public endpoints.
  // The direct path is PROXIES[1]; the Worker path (PROXIES[0])
  // will 403 at the Worker's host allowlist, and fetchWithProxy
  // falls through to the direct path.
  const BINANCE_EXCLUDED = new Set(["USDT"]);
  const BINANCE_INTERVAL_MAP = Object.freeze({
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "6h": "6h",
    "12h": "12h",
    "1d": "1d",
    "3d": "3d",
    "1w": "1w",
  });

  function binancePairFor(id) {
    if (!id) return null;
    const key = String(id).toLowerCase();
    let symbol = ID_TO_SYMBOL[key];
    if (!symbol) symbol = key.toUpperCase();
    if (!symbol || !/^[A-Z0-9]{2,12}$/.test(symbol)) return null;
    if (BINANCE_EXCLUDED.has(symbol)) return null;
    return symbol + "USDT";
  }

  function binanceIntervalFor(interval) {
    if (!interval) return "1h";
    return BINANCE_INTERVAL_MAP[String(interval)] || "1h";
  }

  // ── Null-preserving numeric coercion ─────────────────
  function _coerceNumber(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Global-response normalizer ───────────────────────
  function _normalizeGlobal(raw) {
    const now = Date.now();

    let src = raw;
    if (Array.isArray(src)) src = src[0] || {};

    if (
      src &&
      typeof src === "object" &&
      src.data &&
      typeof src.data === "object"
    ) {
      src = src.data;
    }
    if (!src || typeof src !== "object") src = {};

    const pickFirst = (...vals) => {
      for (const v of vals) {
        const n = _coerceNumber(v);
        if (n !== null) return n;
      }
      return null;
    };

    const totalMcap = pickFirst(
      src.total_market_cap?.usd,
      src.total_mcap,
      src.market_cap_usd,
      src.totalMarketCap,
    );

    const totalVolume = pickFirst(
      src.total_volume?.usd,
      src.total_volume,
      src.volume_24h_usd,
      src.totalVolume,
    );

    const btcDominance = pickFirst(
      src.market_cap_percentage?.btc,
      src.btc_d,
      src.bitcoin_dominance_percentage,
      src.btcDominance,
    );

    const mcapChange24h = pickFirst(
      src.market_cap_change_percentage_24h_usd,
      src.mcap_change,
      src.market_cap_change_24h,
    );

    const activeCryptos = pickFirst(
      src.active_cryptocurrencies,
      src.cryptocurrencies,
      src.coins,
    );

    const marketPairs = pickFirst(
      src.markets,
      src.active_market_pairs,
      src.exchanges,
    );

    return {
      data: {
        active_cryptocurrencies: activeCryptos,
        markets: marketPairs,
        total_market_cap: { usd: totalMcap },
        total_volume: { usd: totalVolume },
        market_cap_percentage: { btc: btcDominance },
        market_cap_change_percentage_24h_usd: mcap24hOrZero(mcapChange24h),
        updated_at: now,
      },
    };
  }

  function mcap24hOrZero(v) {
    return Number.isFinite(v) ? v : 0;
  }

  // ── Provider circuit breaker ─────────────────────────
  const providerBlockedUntil = Object.create(null);
  function isProviderBlocked(name) {
    return (
      providerBlockedUntil[name] && Date.now() < providerBlockedUntil[name]
    );
  }
  function markProviderBlocked(name, ms) {
    const jitter = ms * (0.8 + Math.random() * 0.4);
    providerBlockedUntil[name] = Date.now() + jitter;
  }

  // ── In-flight request deduplication ──────────────────
  const inflight = new Map();
  function _dedupeRequest(key, fn) {
    if (inflight.has(key)) return inflight.get(key);
    const promise = fn().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  }

  let source = "coinlore";
  let circuitBreaker = { failures: 0, until: 0 };

  function schemaForUrl(url) {
    if (url.includes("coinpaprika.com")) return null;
    if (url.includes("coinlore.net")) return null;
    if (url.includes("coinbase.com")) return null;
    if (url.includes("binance.com")) return null;
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
    if (url.includes("binance.com")) {
      if (url.includes("/klines")) return "chart";
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

  function getCacheKey(url) {
    return "api_cache:" + url;
  }

  // ── Bounded LRU cache ────────────────────────────────
  const _cacheIndex = Object.create(null);

  function _loadIndex() {
    try {
      const raw = localStorage.getItem("api_cache_index");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const k of Object.keys(parsed)) _cacheIndex[k] = parsed[k];
      }
    } catch {}
  }
  function _saveIndex() {
    try {
      localStorage.setItem("api_cache_index", JSON.stringify(_cacheIndex));
    } catch {}
  }
  _loadIndex();

  function _evictIfNeeded() {
    const keys = Object.keys(_cacheIndex);
    let totalBytes = 0;
    const entries = keys.map((k) => ({
      key: k,
      at: _cacheIndex[k]?.at || 0,
      size: _cacheIndex[k]?.size || 0,
    }));
    for (const e of entries) totalBytes += e.size;

    if (entries.length <= CACHE_MAX_ENTRIES && totalBytes <= CACHE_MAX_BYTES) {
      return;
    }

    entries.sort((a, b) => a.at - b.at);
    let i = 0;
    while (
      i < entries.length &&
      (entries.length - i > CACHE_MAX_ENTRIES || totalBytes > CACHE_MAX_BYTES)
    ) {
      const victim = entries[i++];
      try {
        localStorage.removeItem(getCacheKey(victim.key));
      } catch {}
      delete _cacheIndex[victim.key];
      totalBytes -= victim.size;
    }
    _saveIndex();
  }

  function getCached(url, ttl = CACHE_TTL) {
    try {
      const key = url;
      const raw = localStorage.getItem(getCacheKey(url));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > ttl) {
        localStorage.removeItem(getCacheKey(url));
        delete _cacheIndex[key];
        return null;
      }
      if (_cacheIndex[key]) _cacheIndex[key].at = Date.now();
      return data.value;
    } catch {
      return null;
    }
  }

  function setCached(url, value) {
    try {
      const serialized = JSON.stringify({ timestamp: Date.now(), value });
      const size = serialized.length;
      localStorage.setItem(getCacheKey(url), serialized);
      _cacheIndex[url] = { at: Date.now(), size };
      _evictIfNeeded();

      if (Array.isArray(value)) {
        const priceCache = W.store.get("last_known_prices", {});
        value.forEach((coin) => {
          if (coin.id && coin.current_price != null) {
            priceCache[coin.id] = {
              price: coin.current_price,
              ts: Date.now(),
            };
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
      const base = 90000;
      const jitter = base * (0.8 + Math.random() * 0.4);
      circuitBreaker.until = Date.now() + jitter;
      circuitBreaker.failures = 0;
      console.warn("[Prices] Circuit breaker open for ~90s");
    }
  }
  function resetCircuit() {
    circuitBreaker.failures = 0;
    circuitBreaker.until = 0;
  }

  // Test-only: clear provider blocks and the circuit breaker so a
  // fresh test file starts from a known state. Not for production use.
  function resetProviderBlocks() {
    for (const k of Object.keys(providerBlockedUntil))
      delete providerBlockedUntil[k];
    resetCircuit();
  }

  // ── fetchWithProxy — proxy walk with refusal fallthrough ────
  //
  // Two proxies in the list:
  //   [0] Worker relay (host-allowlisted on the Worker side)
  //   [1] Direct browser fetch (no proxy)
  //
  // A refusal status (429/401/402/403/530) from one proxy is NOT
  // terminal. The next proxy is tried. Only after all proxies have
  // been tried does the function consult the stale cache and, if
  // that too is empty, throw.
  //
  // This matters for Binance specifically: the Worker refuses
  // api.binance.com at its host allowlist (403), while Binance
  // itself would refuse a Worker-originated request (403). Neither
  // is correct; the browser can reach Binance directly. The
  // PROXIES[1] path is the one that succeeds.
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

    let lastRefusal = null;
    let anyFailure = null;

    // Skip the Worker for hosts whose free-tier quota is per-IP.
    // Sending them through the Worker would exhaust the shared pool.
    let activeProxies = PROXIES;
    try {
      const parsed = new URL(url);
      if (DIRECT_ONLY_DOMAINS.has(parsed.hostname)) {
        // Prefer direct (per-IP quota, avoids shared Worker pool) but
        // keep the Worker as a fallback path. Direct-only was too
        // strict: when Binance region-blocks a user IP and CoinPaprika
        // rate-limits a user IP, the Worker's Cloudflare egress is a
        // working second attempt instead of a dead end.
        activeProxies = [PROXIES[1], PROXIES[0]];
      }
    } catch {
      /* malformed URL — leave the default proxy chain in place */
    }

    for (const proxy of activeProxies) {
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
        const refused = /HTTP 429|HTTP 401|HTTP 402|HTTP 403|HTTP 530/.test(
          e.message,
        );
        if (refused) {
          lastRefusal = e;
          console.warn(
            `[Prices] Proxy refused ${resourceForUrl(url)} (${e.message}); trying next proxy`,
          );
          continue;
        }
        anyFailure = e;
        console.warn(`[Prices] Proxy failed: ${e.message}`);
      }
    }

    if (lastRefusal || anyFailure) {
      const stale = getCached(url, 86400000);
      if (stale !== null) {
        source = "cache (stale, provider refused)";
        W.dataHealth?.mark(resourceForUrl(url), {
          source: "cache (stale)",
          observedAt: Date.now(),
          staleAfter: 3600000,
        });
        console.warn(
          `[Prices] All proxies failed (${(lastRefusal || anyFailure).message}) — serving stale cache for ${resourceForUrl(url)}`,
        );
        return stale;
      }
      throw new Error(
        "Rate limited or blocked by market data provider. Try again in 60 seconds.",
      );
    }

    recordFailure();
    throw new Error("Unable to fetch market data. Please try again later.");
  }

  // ── Symbol map (bounded) ─────────────────────────────
  function learnSymbols(coins) {
    try {
      const map = W.store.get("sym-map", {}) || {};
      (coins || []).forEach((c) => {
        if (c && c.id && c.symbol) map[c.id] = c.symbol;
      });
      const keys = Object.keys(map);
      if (keys.length > SYM_MAP_MAX) {
        const trimmed = {};
        for (const k of keys.slice(-SYM_MAP_MAX)) trimmed[k] = map[k];
        W.store.set("sym-map", trimmed);
      } else {
        W.store.set("sym-map", map);
      }
    } catch {}
  }
  function getSymbol(id) {
    try {
      const map = W.store.get("sym-map", {}) || {};
      return (map[id] || id).toUpperCase();
    } catch {
      return String(id).toUpperCase();
    }
  }

  // ── CoinLore (PRIMARY for tickers) ──────────────────
  const coinlore = {
    markets: async (ids) => {
      const wanted = (ids || []).filter((id) => ID_TO_SYMBOL[id]);
      if (!wanted.length) return [];
      const url = `${COINLORE_API}/tickers/?start=0&limit=100`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, CACHE_TTL, TICKERS_TTL),
      );
      const bySymbol = Object.create(null);
      (data.data || []).forEach((t) => {
        if (t && t.symbol) bySymbol[String(t.symbol).toUpperCase()] = t;
      });
      const rows = wanted
        .map((id) => {
          const t = bySymbol[ID_TO_SYMBOL[id]];
          if (!t) return null;
          const price = _coerceNumber(t.price_usd);
          if (price === null) return null;
          return {
            id,
            symbol: String(t.symbol).toLowerCase(),
            name: t.name,
            image: logoFor(id),
            current_price: price,
            market_cap: _coerceNumber(t.market_cap_usd),
            total_volume: _coerceNumber(t.volume24),
            price_change_percentage_24h_in_currency: _coerceNumber(
              t.percent_change_24h,
            ),
            price_change_percentage_7d_in_currency: _coerceNumber(
              t.percent_change_7d,
            ),
            price_change_percentage_30d_in_currency: null,
            sparkline_in_7d: null,
            market_cap_rank: _coerceNumber(t.rank),
          };
        })
        .filter(Boolean);
      learnSymbols(rows);
      return rows;
    },
    top: async (limit) => {
      const cap = Math.max(1, Math.min(limit | 0, 100));
      const url = `${COINLORE_API}/tickers/?start=0&limit=${cap}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, CACHE_TTL, TICKERS_TTL),
      );
      return (data.data || [])
        .map((t) => {
          const price = _coerceNumber(t.price_usd);
          if (price === null) return null;
          const id = SYMBOL_TO_ID[String(t.symbol).toUpperCase()] || t.nameid;
          return {
            id,
            symbol: String(t.symbol).toLowerCase(),
            name: t.name,
            image: logoFor(id),
            current_price: price,
            market_cap: _coerceNumber(t.market_cap_usd),
            total_volume: _coerceNumber(t.volume24),
            price_change_percentage_24h_in_currency: _coerceNumber(
              t.percent_change_24h,
            ),
            price_change_percentage_7d_in_currency: _coerceNumber(
              t.percent_change_7d,
            ),
            price_change_percentage_30d_in_currency: null,
            sparkline_in_7d: null,
            market_cap_rank: _coerceNumber(t.rank),
          };
        })
        .filter(Boolean);
    },
    global: async () => {
      const url = `${COINLORE_API}/global/`;
      const raw = await fetchWithProxy(url, LONG_CACHE_TTL);
      return _normalizeGlobal(raw);
    },
    chart: () =>
      Promise.reject(new Error("CoinLore: chart endpoint not wired")),
    ohlcv: () => Promise.reject(new Error("CoinLore: OHLCV not wired")),
    search: () => Promise.reject(new Error("CoinLore: no search endpoint")),
    coin: () => Promise.reject(new Error("CoinLore: no coin-detail endpoint")),
    trending: () => Promise.reject(new Error("CoinLore: no trending endpoint")),
  };

  // ── Coinbase (SECONDARY for tickers) ────────────────
  const coinbase = {
    markets: async (ids) => {
      const wanted = (ids || []).filter((id) => COINBASE_PAIRS[id]);
      if (!wanted.length) return [];
      const rows = await Promise.all(
        wanted.map(async (id) => {
          try {
            const url = `${COINBASE_API}/prices/${COINBASE_PAIRS[id]}/spot`;
            const data = await _dedupeRequest(url, () =>
              fetchWithProxy(url, CACHE_TTL),
            );
            const price = _coerceNumber(data?.data?.amount);
            if (price === null) return null;
            return {
              id,
              symbol: ID_TO_SYMBOL[id].toLowerCase(),
              name: id,
              image: logoFor(id),
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
    chart: async (id, days = 30) => {
      const pair = COINBASE_PAIRS[id];
      if (!pair) throw new Error(`Coinbase: no pair for ${id}`);
      const d = Math.max(1, days | 0);
      const useHourly = d <= 2;
      const cap = useHourly ? Math.max(2, d * 24) : Math.max(2, Math.min(d, 300));
      const granularity = useHourly ? 3600 : 86400;
      const url = `${COINBASE_EXCHANGE_API}/products/${pair}/candles?granularity=${granularity}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      if (!Array.isArray(data)) return [];
      // Coinbase Exchange returns newest-first; reverse for chronological.
      return data
        .slice(0, cap)
        .reverse()
        .map((k) => [Number(k[0]) * 1000, _coerceNumber(k[4])]);
    },
    ohlcv: async (id, interval = "1h", limit = 500) => {
      const pair = COINBASE_PAIRS[id];
      if (!pair) throw new Error(`Coinbase: no pair for ${id}`);
      const cap = Math.max(1, Math.min(limit | 0, 300));
      const intervalMap = {
        "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400,
      };
      const gran = intervalMap[interval] || 3600;
      const url = `${COINBASE_EXCHANGE_API}/products/${pair}/candles?granularity=${gran}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      if (!Array.isArray(data)) return [];
      // [time, low, high, open, close, volume] — newest-first.
      return data
        .slice(0, cap)
        .reverse()
        .map((k) => ({
          timestamp: Number(k[0]) * 1000,
          open: _coerceNumber(k[3]),
          high: _coerceNumber(k[2]),
          low: _coerceNumber(k[1]),
          close: _coerceNumber(k[4]),
          volume: _coerceNumber(k[5]),
          quoteVolume: null,
        }));
    },
    search: () => Promise.reject(new Error("Coinbase: no search endpoint")),
    coin: () => Promise.reject(new Error("Coinbase: no coin-detail endpoint")),
    trending: () => Promise.reject(new Error("Coinbase: no trending endpoint")),
  };

  // ── Binance (PRIMARY for OHLCV / chart) ─────────────
  //
  // Fetched directly from the browser, never through the Worker.
  // Binance rejects Cloudflare Worker egress IPs with 403 (see the
  // Worker's header comment for the full history); the browser's
  // own IP is unaffected, and Binance sends permissive CORS headers
  // for /api/v3/klines.
  const binance = {
    markets: () => Promise.reject(new Error("Binance: markets not wired")),
    top: () => Promise.reject(new Error("Binance: no top-list endpoint")),
    global: () => Promise.reject(new Error("Binance: no global endpoint")),
    chart: async (id, days = 30) => {
      const pair = binancePairFor(id);
      if (!pair) throw new Error(`Binance: no USDT pair for ${id}`);
      const d = Math.max(1, days | 0);
      const useHourly = d <= 2;
      const cap = useHourly ? Math.max(2, d * 24) : Math.max(2, Math.min(d, 1000));
      const bInt = useHourly ? "1h" : "1d";
      const url = `${BINANCE_API}/klines?symbol=${pair}&interval=${bInt}&limit=${cap}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      if (!Array.isArray(data)) return [];
      return data.map((k) => [Number(k[0]), _coerceNumber(k[4])]);
    },
    ohlcv: async (id, interval = "1h", limit = 500) => {
      const pair = binancePairFor(id);
      if (!pair) throw new Error(`Binance: no USDT pair for ${id}`);
      const cap = Math.max(1, Math.min(limit | 0, 1000));
      const binanceInterval = binanceIntervalFor(interval);
      const url = `${BINANCE_API}/klines?symbol=${pair}&interval=${binanceInterval}&limit=${cap}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      if (!Array.isArray(data)) return [];
      return data.map((k) => ({
        timestamp: Number(k[0]),
        open: _coerceNumber(k[1]),
        high: _coerceNumber(k[2]),
        low: _coerceNumber(k[3]),
        close: _coerceNumber(k[4]),
        volume: _coerceNumber(k[5]),
        quoteVolume: _coerceNumber(k[7]),
      }));
    },
    search: () => Promise.reject(new Error("Binance: no search endpoint")),
    coin: () => Promise.reject(new Error("Binance: no coin-detail endpoint")),
    trending: () => Promise.reject(new Error("Binance: no trending endpoint")),
  };

  // ── CoinPaprika (TERTIARY + search/coin/trending) ───
  const coinpaprika = {
    markets: async (ids) => {
      const wanted = (ids || []).filter((id) => ID_TO_SYMBOL[id]);
      if (!wanted.length) return [];
      const url = `${COINPAPRIKA_API}/tickers?quotes=USD&limit=500`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, CACHE_TTL, TICKERS_TTL),
      );
      const bySymbol = Object.create(null);
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
          const price = _coerceNumber(q.price);
          if (price === null) return null;
          return {
            id,
            symbol: String(t.symbol).toLowerCase(),
            name: t.name,
            image: logoFor(id),
            current_price: price,
            market_cap: _coerceNumber(q.market_cap),
            total_volume: _coerceNumber(q.volume_24h),
            price_change_percentage_24h_in_currency: _coerceNumber(
              q.percent_change_24h,
            ),
            price_change_percentage_7d_in_currency: _coerceNumber(
              q.percent_change_7d,
            ),
            price_change_percentage_30d_in_currency: _coerceNumber(
              q.percent_change_30d,
            ),
            sparkline_in_7d: null,
            market_cap_rank: _coerceNumber(t.rank),
          };
        })
        .filter(Boolean);
      learnSymbols(rows);
      return rows;
    },
    top: async (limit) => {
      const cap = Math.max(1, Math.min(limit | 0, 1000));
      const url = `${COINPAPRIKA_API}/tickers?quotes=USD&limit=${cap}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, CACHE_TTL, TICKERS_TTL),
      );
      return (data || [])
        .map((t) => {
          const q = t.quotes?.USD || {};
          const price = _coerceNumber(q.price);
          if (price === null) return null;
          const id = SYMBOL_TO_ID[String(t.symbol).toUpperCase()] || t.id;
          return {
            id,
            symbol: String(t.symbol).toLowerCase(),
            name: t.name,
            image: logoFor(id),
            current_price: price,
            market_cap: _coerceNumber(q.market_cap),
            total_volume: _coerceNumber(q.volume_24h),
            price_change_percentage_24h_in_currency: _coerceNumber(
              q.percent_change_24h,
            ),
            price_change_percentage_7d_in_currency: _coerceNumber(
              q.percent_change_7d,
            ),
            price_change_percentage_30d_in_currency: _coerceNumber(
              q.percent_change_30d,
            ),
            sparkline_in_7d: null,
            market_cap_rank: _coerceNumber(t.rank),
          };
        })
        .filter(Boolean);
    },
    chart: async (id, days = 30) => {
      const pid = ID_TO_PAPRIKA[id];
      if (!pid) throw new Error(`CoinPaprika: no slug for ${id}`);
      const end = new Date();
      const start = new Date(end.getTime() - days * 86400000);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const url = `${COINPAPRIKA_API}/coins/${pid}/ohlcv/historical?start=${fmt(start)}&end=${fmt(end)}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      return (data || []).map((k) => [
        new Date(k.time_open).getTime(),
        _coerceNumber(k.close),
      ]);
    },
    ohlcv: async (id, _interval = "1h", limit = 500) => {
      const pid = ID_TO_PAPRIKA[id];
      if (!pid) throw new Error(`CoinPaprika: no slug for ${id}`);
      const cap = Math.max(1, Math.min(limit | 0, 5000));
      const end = new Date();
      const start = new Date(end.getTime() - Math.max(cap, 30) * 86400000);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const url = `${COINPAPRIKA_API}/coins/${pid}/ohlcv/historical?start=${fmt(start)}&end=${fmt(end)}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      return (data || []).slice(-cap).map((k) => ({
        timestamp: new Date(k.time_open).getTime(),
        open: _coerceNumber(k.open),
        high: _coerceNumber(k.high),
        low: _coerceNumber(k.low),
        close: _coerceNumber(k.close),
        volume: _coerceNumber(k.volume),
        quoteVolume: _coerceNumber(k.volume),
      }));
    },
    global: async () => {
      const url = `${COINPAPRIKA_API}/global`;
      const raw = await fetchWithProxy(url, LONG_CACHE_TTL);
      return _normalizeGlobal(raw);
    },
    search: async (query) => {
      const q = String(query || "")
        .trim()
        .slice(0, 128);
      if (!q) return { coins: [] };
      const url = `${COINPAPRIKA_API}/search?q=${encodeURIComponent(q)}&c=currencies&limit=10`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, CACHE_TTL),
      );
      return {
        coins: (data.currencies || []).map((c) => ({
          id: SYMBOL_TO_ID[String(c.symbol).toUpperCase()] || c.id,
          symbol: c.symbol,
          name: c.name,
          market_cap_rank: _coerceNumber(c.rank),
        })),
      };
    },
    coin: async (id) => {
      const pid = ID_TO_PAPRIKA[id];
      if (!pid) throw new Error(`CoinPaprika: no slug for ${id}`);
      // /coins/{id} returns metadata only (name, description, links).
      // Price and market-cap live on /tickers/{id}. Without the merge,
      // md.market_cap and md.total_volume are undefined and the stats
      // grid renders a fabricated "$0.00" for both. Fetch in parallel;
      // a ticker failure degrades to metadata-only, not a hard fail.
      const coinUrl = `${COINPAPRIKA_API}/coins/${pid}`;
      const tickerUrl = `${COINPAPRIKA_API}/tickers/${pid}?quotes=USD`;
      const [meta, ticker] = await Promise.all([
        _dedupeRequest(coinUrl, () =>
          fetchWithProxy(coinUrl, LONG_CACHE_TTL),
        ),
        _dedupeRequest(tickerUrl, () =>
          fetchWithProxy(tickerUrl, CACHE_TTL, TICKERS_TTL),
        ).catch(() => null),
      ]);
      if (!meta || typeof meta !== "object") return meta;
      if (ticker && ticker.quotes && ticker.quotes.USD) {
        const q = ticker.quotes.USD;
        meta.market_data = {
          current_price: { usd: _coerceNumber(q.price) },
          market_cap: { usd: _coerceNumber(q.market_cap) },
          total_volume: { usd: _coerceNumber(q.volume_24h) },
          price_change_percentage_24h: _coerceNumber(q.percent_change_24h),
          ath: { usd: null },
          ath_change_percentage: { usd: null },
          circulating_supply: _coerceNumber(q.circulating_supply),
          max_supply: _coerceNumber(q.max_supply),
        };
        meta.market_cap_rank = _coerceNumber(ticker.rank);
      }
      return meta;
    },
    trending: async () => {
      const url = `${COINPAPRIKA_API}/tickers?quotes=USD&limit=250`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, CACHE_TTL, TICKERS_TTL),
      );
      const sorted = (data || [])
        .filter(
          (t) =>
            t.quotes?.USD &&
            Number.isFinite(_coerceNumber(t.quotes.USD.percent_change_24h)),
        )
        .sort((a, b) => {
          const av = Math.abs(_coerceNumber(a.quotes.USD.percent_change_24h));
          const bv = Math.abs(_coerceNumber(b.quotes.USD.percent_change_24h));
          return bv - av;
        })
        .slice(0, 10);
      return {
        coins: sorted.map((t) => {
          const id = SYMBOL_TO_ID[String(t.symbol).toUpperCase()] || t.id;
          return {
            item: {
              id,
              symbol: String(t.symbol).toLowerCase(),
              name: t.name,
              market_cap_rank: _coerceNumber(t.rank),
            },
          };
        }),
      };
    },
  };

  // ── Kraken pair map — XBT for Bitcoin, XDG for Dogecoin ──
  const KRAKEN_PAIRS = Object.freeze({
    bitcoin: "XBTUSD",
    ethereum: "ETHUSD",
    tether: "USDTUSD",
    "usd-coin": "USDCUSD",
    binancecoin: "BNBUSD",
    solana: "SOLUSD",
    ripple: "XRPUSD",
    cardano: "ADAUSD",
    dogecoin: "XDGUSD",
    litecoin: "LTCUSD",
    tron: "TRXUSD",
    polkadot: "DOTUSD",
    matic: "MATICUSD",
    cosmos: "ATOMUSD",
    uniswap: "UNIUSD",
    aave: "AAVEUSD",
    dai: "DAIUSD",
    chainlink: "LINKUSD",
    stellar: "XLMUSD",
    "avalanche-2": "AVAXUSD",
  });

  // ── Bybit pair map — same symbol format as Binance ──────
  const BYBIT_PAIRS = Object.freeze({
    bitcoin: "BTCUSDT",
    ethereum: "ETHUSDT",
    binancecoin: "BNBUSDT",
    solana: "SOLUSDT",
    ripple: "XRPUSDT",
    cardano: "ADAUSDT",
    dogecoin: "DOGEUSDT",
    litecoin: "LTCUSDT",
    tron: "TRXUSDT",
    polkadot: "DOTUSDT",
    matic: "MATICUSDT",
    cosmos: "ATOMUSDT",
    uniswap: "UNIUSDT",
    aave: "AAVEUSDT",
    chainlink: "LINKUSDT",
    stellar: "XLMUSDT",
    "avalanche-2": "AVAXUSDT",
  });

  // ── Kraken (SECONDARY for OHLCV / chart) ────────────────
  // Different infrastructure from Binance. Free, no key, permissive
  // CORS. A Binance region-block does not affect Kraken.
  const kraken = {
    markets: () => Promise.reject(new Error("Kraken: markets not wired")),
    top: () => Promise.reject(new Error("Kraken: no top-list endpoint")),
    global: () => Promise.reject(new Error("Kraken: no global endpoint")),
    chart: async (id, days = 30) => {
      const pair = KRAKEN_PAIRS[id];
      if (!pair) throw new Error(`Kraken: no USD pair for ${id}`);
      const d = Math.max(1, days | 0);
      const useHourly = d <= 2;
      const cap = useHourly ? Math.max(2, d * 24) : Math.max(2, Math.min(d, 720));
      const interval = useHourly ? 60 : 1440;
      const url = `${KRAKEN_API}/OHLC?pair=${pair}&interval=${interval}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      const result = data?.result || {};
      const seriesKey = Object.keys(result).find((k) => k !== "last");
      const rows = seriesKey ? result[seriesKey] : null;
      if (!Array.isArray(rows)) return [];
      // [time(sec), open, high, low, close, vwap, volume, count]
      return rows
        .slice(-cap)
        .map((k) => [Number(k[0]) * 1000, _coerceNumber(k[4])]);
    },
    ohlcv: async (id, interval = "1h", limit = 500) => {
      const pair = KRAKEN_PAIRS[id];
      if (!pair) throw new Error(`Kraken: no USD pair for ${id}`);
      const cap = Math.max(1, Math.min(limit | 0, 720));
      const intervalMap = {
        "1m": 1, "5m": 5, "15m": 15, "30m": 30,
        "1h": 60, "4h": 240, "1d": 1440, "1w": 10080,
      };
      const kInt = intervalMap[interval] || 60;
      const url = `${KRAKEN_API}/OHLC?pair=${pair}&interval=${kInt}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      const result = data?.result || {};
      const seriesKey = Object.keys(result).find((k) => k !== "last");
      const rows = seriesKey ? result[seriesKey] : null;
      if (!Array.isArray(rows)) return [];
      return rows.slice(-cap).map((k) => ({
        timestamp: Number(k[0]) * 1000,
        open: _coerceNumber(k[1]),
        high: _coerceNumber(k[2]),
        low: _coerceNumber(k[3]),
        close: _coerceNumber(k[4]),
        volume: _coerceNumber(k[6]),
        quoteVolume: null,
      }));
    },
    search: () => Promise.reject(new Error("Kraken: no search endpoint")),
    coin: () => Promise.reject(new Error("Kraken: no coin-detail endpoint")),
    trending: () => Promise.reject(new Error("Kraken: no trending endpoint")),
  };

  // ── Bybit (TERTIARY for OHLCV / chart) ──────────────────
  // Another independent hedge. Free, no key, CORS-clean.
  const bybit = {
    markets: () => Promise.reject(new Error("Bybit: markets not wired")),
    top: () => Promise.reject(new Error("Bybit: no top-list endpoint")),
    global: () => Promise.reject(new Error("Bybit: no global endpoint")),
    chart: async (id, days = 30) => {
      const pair = BYBIT_PAIRS[id];
      if (!pair) throw new Error(`Bybit: no USDT pair for ${id}`);
      const d = Math.max(1, days | 0);
      const useHourly = d <= 2;
      const cap = useHourly ? Math.max(2, d * 24) : Math.max(2, Math.min(d, 1000));
      const bInt = useHourly ? "60" : "D";
      const url = `${BYBIT_API}/kline?category=spot&symbol=${pair}&interval=${bInt}&limit=${cap}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      const list = data?.result?.list;
      if (!Array.isArray(list)) return [];
      // Bybit returns newest-first; reverse for chronological.
      return list
        .reverse()
        .map((k) => [Number(k[0]), _coerceNumber(k[4])]);
    },
    ohlcv: async (id, interval = "1h", limit = 500) => {
      const pair = BYBIT_PAIRS[id];
      if (!pair) throw new Error(`Bybit: no USDT pair for ${id}`);
      const cap = Math.max(1, Math.min(limit | 0, 1000));
      const intervalMap = {
        "1m": "1", "5m": "5", "15m": "15", "30m": "30",
        "1h": "60", "4h": "240", "1d": "D", "1w": "W",
      };
      const bInt = intervalMap[interval] || "60";
      const url = `${BYBIT_API}/kline?category=spot&symbol=${pair}&interval=${bInt}&limit=${cap}`;
      const data = await _dedupeRequest(url, () =>
        fetchWithProxy(url, LONG_CACHE_TTL),
      );
      const list = data?.result?.list;
      if (!Array.isArray(list)) return [];
      return list.reverse().map((k) => ({
        timestamp: Number(k[0]),
        open: _coerceNumber(k[1]),
        high: _coerceNumber(k[2]),
        low: _coerceNumber(k[3]),
        close: _coerceNumber(k[4]),
        volume: _coerceNumber(k[5]),
        quoteVolume: _coerceNumber(k[6]),
      }));
    },
    search: () => Promise.reject(new Error("Bybit: no search endpoint")),
    coin: () => Promise.reject(new Error("Bybit: no coin-detail endpoint")),
    trending: () => Promise.reject(new Error("Bybit: no trending endpoint")),
  };

  const providers = { coinlore, coinbase, coinpaprika, binance, kraken, bybit };
  const ORDER = ["coinlore", "coinbase", "coinpaprika"];

  // ── Smart failover ──────────────────────────────────
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

    let order;
    if (method === "top" || method === "global") {
      order = ["coinlore", "coinpaprika"];
    } else if (method === "ohlcv" || method === "chart") {
      // Ordered by likelihood of success and independence of infra.
      // Binance is fastest but region-blocked often; Kraken, Coinbase,
      // and Bybit are on different infrastructure. CoinPaprika is
      // last because its free tier now returns 402 for chart data.
      order = ["binance", "kraken", "coinbase", "bybit", "coinpaprika"];
    } else {
      order = ["coinpaprika"];
    }

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

  // ── Top-cached (1h TTL for the aggregated top list) ──
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

  // ── Public API ──────────────────────────────────────
  return Object.freeze({
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

    global: async () => {
      try {
        const result = await withFailover("global");
        return _normalizeGlobal(result);
      } catch (e) {
        console.warn(
          "[Prices] global() all providers failed — returning null-shaped response:",
          e.message,
        );
        source = "unavailable";
        return _normalizeGlobal({});
      }
    },

    search: (query) => withFailover("search", query),
    coin: (id) => withFailover("coin", id),
    trending: () => withFailover("trending"),

    fearGreed: () =>
      fetchWithProxy("https://api.alternative.me/fng/?limit=1", CACHE_TTL)
        .then(
          (d) =>
            d.data?.[0] || { value: "50", value_classification: "Neutral" },
        )
        .catch(() => ({ value: null, value_classification: null })),

    getSymbol,
    learnSymbols,

    _normalizeGlobal,

    get source() {
      return source;
    },

    _internal: Object.freeze({
      DIRECT_ONLY_DOMAINS,
      resetCircuit,
      resetProviderBlocks,
      binancePairFor,
      binanceIntervalFor,
      BINANCE_EXCLUDED,
      BINANCE_INTERVAL_MAP,
    }),
  });
})();

console.log(
  "[Prices] Module loaded (Binance (direct) → CoinLore → CoinBase → CoinPaprika → Cache; OHLCV via Binance direct, tickers via CoinLore, search/detail via CoinPaprika; logos for 26 tokens).",
);
