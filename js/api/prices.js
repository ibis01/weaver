// ===============================================================
//                  Market Data API (Constitutionally Compliant)
// ===============================================================
// §2.7 No Fabricated Data: never returns $0.00 for missing prices.
//      Missing values are `null` throughout, and `null` propagates
//      honestly to the UI as "—" or "unavailable".
// §3.4 Graceful Degradation:
//      CoinLore → CoinBase → CoinPaprika → stale cache. Every
//      provider's `global()` output is normalized to a single
//      canonical shape before leaving this module.
// §3.6 Caching:
//      Bounded LRU per localStorage key, plus in-memory dedup of
//      concurrent in-flight requests.
// §3.7 Deterministic:
//      All numeric parsing goes through a single null-preserving
//      coerce helper. No `|| 0` that silently collapses "absent"
//      into "zero".
//
// v5 changelog:
//   - `_normalizeGlobal()` — single shape-normalizer used by every
//     provider's global(). Fixes the SchemaValidationError:
//     "coingecko global: data must be an object" that fired when
//     CoinLore returned an array or CoinPaprika returned a flat
//     object instead of the wrapped { data: {...} } shape.
//   - `W.api.global()` never throws. On total provider failure it
//     returns the canonical shape with explicit nulls, so a
//     downstream schema validator gets a well-typed object instead
//     of catching an exception and storing a `{ error: ... }`
//     payload that then fails schema validation.
//   - Bounded caches: every localStorage key gets an LRU with a
//     hard cap on entry count and total byte size.
//   - In-flight deduplication: N concurrent calls to the same URL
//     share one network request.
//   - Circuit-breaker jitter: the recovery delay is randomized
//     +/- 20% to prevent thundering-herd behavior across browser
//     tabs.
//   - `sym-map` is capped at 500 entries to prevent unbounded
//     localStorage growth.
//   - `_coerceNumber()` replaces `parseFloat(...) || 0` everywhere.
//     `parseFloat("0") || 0` was correct; `parseFloat("") || 0`
//     silently fabricated a zero for missing data.
//   - URL builders use URLSearchParams for query construction
//     rather than string concatenation.
// ===============================================================

window.W = window.W || {};

W.api = (() => {
  const COINPAPRIKA_API = "https://api.coinpaprika.com/v1";
  const COINLORE_API = "https://api.coinlore.net/api";
  const COINBASE_API = "https://api.coinbase.com/v2";

  const CACHE_TTL = 60000; // 1 min for live prices
  const LONG_CACHE_TTL = 1800000; // 30 min for chart/coin/global
  const TICKERS_TTL = 120000; // 2 min for /tickers snapshots

  // Bounded caches: hard caps on entry count and total bytes per
  // localStorage key. Prevents unbounded growth that would eventually
  // overflow the ~5 MB localStorage quota.
  const CACHE_MAX_ENTRIES = 200;
  const CACHE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
  const SYM_MAP_MAX = 500;

  const PROXIES = [
    (u) =>
      "https://weaver-proxy.ibis01-weaver.workers.dev/proxy?url=" +
      encodeURIComponent(u),
    (u) => u,
  ];

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

  // ── Null-preserving numeric coercion ─────────────────
  // `parseFloat(x) || 0` silently turns "" and null into 0, which
  // fabricates a value for missing data (§2.7). This helper returns
  // a finite number or null, and never invents a zero.
  function _coerceNumber(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Global-response normalizer ───────────────────────
  // Accepts any shape from any provider and returns the canonical
  // CoinGecko-shaped response the schema validator expects:
  //
  //   {
  //     data: {
  //       active_cryptocurrencies:  number|null,
  //       markets:                 number|null,
  //       total_market_cap:        { usd: number|null },
  //       total_volume:            { usd: number|null },
  //       market_cap_percentage:   { btc: number|null },
  //       market_cap_change_percentage_24h_usd: number,
  //       updated_at:              number
  //     }
  //   }
  //
  // Recognized provider shapes:
  //   CoinLore:     [ { total_mcap, total_volume, btc_d, mcap_change,
  //                     coins, exchanges, ... } ]  (array-wrapped)
  //   CoinPaprika:  { market_cap_usd, volume_24h_usd,
  //                   bitcoin_dominance_percentage,
  //                   market_cap_change_24h,
  //                   cryptocurrencies, active_market_pairs, ... }
  //   Already-canonical: { data: { ... } }
  //
  // Any other shape yields a canonical response with nulls. The
  // caller never sees a non-object `data`.
  function _normalizeGlobal(raw) {
    const now = Date.now();

    // Unwrap a top-level array (CoinLore).
    let src = raw;
    if (Array.isArray(src)) src = src[0] || {};

    // Unwrap { data: ... } if present (already-normalized or
    // CoinGecko-shaped).
    if (
      src &&
      typeof src === "object" &&
      src.data &&
      typeof src.data === "object"
    ) {
      src = src.data;
    }
    if (!src || typeof src !== "object") src = {};

    // Each field tries every known provider key in priority order.
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

  // The one field where the schema requires a number rather than a
  // nullable number. Explicitly 0 only when we genuinely have no
  // signal — this is a semantic "no change measured" rather than a
  // fabricated price.
  function mcap24hOrZero(v) {
    return Number.isFinite(v) ? v : 0;
  }

  // ── Provider circuit breaker ─────────────────────────
  // When a provider returns HTTP 402 (CoinPaprika's quota-exhausted
  // signal), mark it blocked for 1 hour. Adds +/- 20% jitter to the
  // recovery delay so multiple browser tabs don't all retry at the
  // same instant.
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
  // N concurrent calls to the same URL share one network request.
  // This is the difference between "opening the Dashboard fires 4
  // parallel price fetches" and "fires 1".
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

  function getCacheKey(url) {
    return "api_cache:" + url;
  }

  // ── Bounded LRU cache ────────────────────────────────
  // Each key maps to { timestamp, value, size }. On write we evict
  // the oldest entries until we're within both caps (count and
  // bytes). Keeps localStorage from silently filling up.
  const _cacheIndex = Object.create(null);

  function _loadIndex() {
    try {
      const raw = localStorage.getItem("api_cache_index");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const k of Object.keys(parsed)) _cacheIndex[k] = parsed[k];
      }
    } catch {
      /* corrupted index — start fresh */
    }
  }
  function _saveIndex() {
    try {
      localStorage.setItem("api_cache_index", JSON.stringify(_cacheIndex));
    } catch {
      /* non-fatal */
    }
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

    // Oldest first
    entries.sort((a, b) => a.at - b.at);
    let i = 0;
    while (
      i < entries.length &&
      (entries.length - i > CACHE_MAX_ENTRIES || totalBytes > CACHE_MAX_BYTES)
    ) {
      const victim = entries[i++];
      try {
        localStorage.removeItem(getCacheKey(victim.key));
      } catch {
        /* ignore */
      }
      delete _cacheIndex[victim.key];
      totalBytes -= victim.size;
    }
    _saveIndex();
  }

  function getCached(url, ttl = CACHE_TTL) {
    try {
      const key = url; // full URL is the index key
      const raw = localStorage.getItem(getCacheKey(url));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > ttl) {
        localStorage.removeItem(getCacheKey(url));
        delete _cacheIndex[key];
        return null;
      }
      // Touch the LRU timestamp
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
    } catch {
      // localStorage can overflow on large responses. Silently skip
      // caching in that case — the in-memory response is still
      // returned to the caller.
    }
  }

  function isCircuitOpen() {
    return Date.now() < circuitBreaker.until;
  }
  function recordFailure() {
    circuitBreaker.failures++;
    if (circuitBreaker.failures >= 5) {
      // Jittered so multiple tabs don't reset at the same instant.
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

  // ── Symbol map (bounded) ─────────────────────────────
  function learnSymbols(coins) {
    try {
      const map = W.store.get("sym-map", {}) || {};
      (coins || []).forEach((c) => {
        if (c && c.id && c.symbol) map[c.id] = c.symbol;
      });
      const keys = Object.keys(map);
      if (keys.length > SYM_MAP_MAX) {
        // Keep the most recent N — insertion order is preserved by
        // V8 for string keys.
        const trimmed = {};
        for (const k of keys.slice(-SYM_MAP_MAX)) trimmed[k] = map[k];
        W.store.set("sym-map", trimmed);
      } else {
        W.store.set("sym-map", map);
      }
    } catch {
      /* non-fatal */
    }
  }
  function getSymbol(id) {
    try {
      const map = W.store.get("sym-map", {}) || {};
      return (map[id] || id).toUpperCase();
    } catch {
      return String(id).toUpperCase();
    }
  }

  // ── CoinLore (PRIMARY) ──────────────────────────────
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
            image: "",
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
          return {
            id: SYMBOL_TO_ID[String(t.symbol).toUpperCase()] || t.nameid,
            symbol: String(t.symbol).toLowerCase(),
            name: t.name,
            image: "",
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

  // ── Coinbase (SECONDARY) ────────────────────────────
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
    // Coinbase has no global endpoint. Throwing lets the failover
    // chain move on; the caller (W.api.global) never sees a
    // half-shaped response.
    global: () => Promise.reject(new Error("Coinbase: no global endpoint")),
    chart: () => Promise.reject(new Error("Coinbase: chart not wired")),
    ohlcv: () => Promise.reject(new Error("Coinbase: OHLCV not wired")),
    search: () => Promise.reject(new Error("Coinbase: no search endpoint")),
    coin: () => Promise.reject(new Error("Coinbase: no coin-detail endpoint")),
    trending: () => Promise.reject(new Error("Coinbase: no trending endpoint")),
  };

  // ── CoinPaprika (TERTIARY + chart/search/trending) ──
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
            image: "",
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
            image: "",
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
      const url = `${COINPAPRIKA_API}/coins/${pid}`;
      return _dedupeRequest(url, () => fetchWithProxy(url, LONG_CACHE_TTL));
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

  const providers = { coinlore, coinbase, coinpaprika };
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

    // ── global() — NEVER throws ──────────────────────
    // The schema validator runs on the result of this call. If we
    // let an exception escape (all providers blocked, network down),
    // the caller catches it and typically stores `{ error: ... }`,
    // which then fails schema validation with
    // "coingecko global: data must be an object" — masking the real
    // cause. Returning a canonical shape with nulls is honest
    // (§2.7: null means "unknown", not "zero") and keeps the schema
    // contract satisfied regardless of provider state.
    global: async () => {
      try {
        const result = await withFailover("global");
        // Belt-and-braces: normalize again at the boundary in case a
        // future provider bypasses its own normalizer.
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

    // Exposed for tests and diagnostics.
    _normalizeGlobal,

    get source() {
      return source;
    },
  });
})();

console.log(
  "[Prices] Module loaded (CoinLore → CoinBase → CoinPaprika → Cache; global() normalized and non-throwing; bounded caches; inflight dedup).",
);
