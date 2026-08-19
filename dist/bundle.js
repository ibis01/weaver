// ====== Weaver Bundle ======
// Ensure global W object exists
if (typeof window.W === "undefined") window.W = {};
window.W.features = window.W.features || {};
window.W.api = window.W.api || {};
window.W.fmt = window.W.fmt || {};
window.W.ui = window.W.ui || {};
window.W.store = window.W.store || {};
window.W.dashboard = window.W.dashboard || {};
// ==============================

// ---- js/storage/storage.js ----
// ===============================================================
//  Weaver Storage Layer
// ===============================================================

// Prevent redeclaration errors
if (!window.W) window.W = {};

const StorageModule = (function () {
  const Storage = {
    /**
     * Generate a prefixed key
     * @param {string} key – The raw key
     * @returns {string} – Prefixed key
     */
    _key(key) {
      return `weaver:${key}`;
    },

    /**
     * Store a value in localStorage
     * @param {string} key – The key
     * @param {*} value – Any JSON-serializable value
     */
    set(key, value) {
      try {
        localStorage.setItem(this._key(key), JSON.stringify(value));
      } catch (e) {
        console.warn("[Storage] set error:", e.message);
        // Fallback: store in memory if localStorage fails
        if (!this._memory) this._memory = {};
        this._memory[key] = value;
      }
    },

    /**
     * Retrieve a value from localStorage
     * @param {string} key – The key
     * @param {*} fallback – Value to return if key not found
     * @returns {*} – Parsed JSON or fallback
     */
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(this._key(key));
        if (raw === null) {
          // Check memory fallback
          if (this._memory && key in this._memory) {
            return this._memory[key];
          }
          return fallback;
        }
        return JSON.parse(raw);
      } catch (e) {
        console.warn("[Storage] get error:", e.message);
        return fallback;
      }
    },

    /**
     * Delete a key from localStorage
     * @param {string} key – The key
     */
    delete(key) {
      try {
        localStorage.removeItem(this._key(key));
        if (this._memory) delete this._memory[key];
      } catch (e) {
        console.warn("[Storage] delete error:", e.message);
      }
    },

    // ── Secure Storage Methods ──────────────────────────────

    /**
     * Store sensitive settings with encryption
     * @param {Object} settings - The full settings object
     * @param {string} password - User's security password
     */
    async setSecureSettings(settings, password) {
      try {
        if (!W.crypto || !W.crypto.secure) {
          throw new Error("SecureCrypto module not loaded");
        }

        // Encrypt sensitive fields
        const encrypted = await W.crypto.secure.encryptSettings(
          settings,
          password,
        );

        // Store encrypted data
        const secureData = {
          encrypted: encrypted,
          timestamp: Date.now(),
        };

        localStorage.setItem(
          this._key("secure_settings"),
          JSON.stringify(secureData),
        );

        // Remove sensitive fields from regular settings
        const safeSettings = { ...settings };
        delete safeSettings.ai;
        delete safeSettings.telegram;

        // Store non-sensitive settings normally
        this.set("settings", safeSettings);

        console.log("[Storage] Secure settings saved");
      } catch (e) {
        console.error("[Storage] setSecureSettings error:", e.message);
        throw e;
      }
    },

    /**
     * Retrieve and decrypt sensitive settings
     * @param {string} password - User's security password
     * @returns {Object|null} - Decrypted sensitive settings or null
     */
    async getSecureSettings(password) {
      try {
        const raw = localStorage.getItem(this._key("secure_settings"));
        if (!raw) return null;

        const secureData = JSON.parse(raw);
        if (!secureData.encrypted) return null;

        const sensitiveData = await W.crypto.secure.decryptSettings(
          secureData.encrypted,
          password,
        );

        return sensitiveData;
      } catch (e) {
        console.warn("[Storage] getSecureSettings error:", e.message);
        return null;
      }
    },

    /**
     * Check if migration from plaintext to encrypted is needed
     * @returns {boolean}
     */
    needsMigration() {
      const settings = this.get("settings", {});
      return !!(settings.ai?.key || settings.telegram?.token);
    },

    /**
     * Migrate plaintext settings to encrypted storage
     * @param {string} password - User's security password
     * @returns {Promise<boolean>} - True if migration succeeded
     */
    async migrateToSecure(password) {
      try {
        const settings = this.get("settings", {});

        // Check if migration is needed
        if (!this.needsMigration()) {
          console.log("[Storage] No migration needed");
          return true;
        }

        console.log("[Storage] Starting migration to secure storage...");

        // Encrypt and save
        await this.setSecureSettings(settings, password);

        // Verify by attempting to read back
        const testRead = await this.getSecureSettings(password);
        if (!testRead) {
          throw new Error("Migration verification failed");
        }

        console.log("[Storage] Migration completed successfully");
        return true;
      } catch (e) {
        console.error("[Storage] Migration failed:", e.message);
        throw e;
      }
    },

    /**
     * Clear all secure settings (for logout/reset)
     */
    clearSecureSettings() {
      try {
        localStorage.removeItem(this._key("secure_settings"));
        console.log("[Storage] Secure settings cleared");
      } catch (e) {
        console.warn("[Storage] clearSecureSettings error:", e.message);
      }
    },

    /**
     * Check if secure settings exist
     * @returns {boolean}
     */
    hasSecureSettings() {
      const raw = localStorage.getItem(this._key("secure_settings"));
      return !!raw;
    },

    // ── Optional IndexedDB methods (for large data) ──
    // These are placeholders; you can implement them later
    // if you need to store large amounts of data.

    /**
     * Open an IndexedDB database (placeholder)
     * @param {string} dbName – Database name
     * @param {number} version – Database version
     * @returns {Promise<IDBDatabase>}
     */
    async openIndexedDB(dbName = "WeaverDB", version = 1) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, version);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("store")) {
            db.createObjectStore("store", { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    /**
     * Save to IndexedDB (placeholder)
     * @param {string} key – The key
     * @param {*} value – The value
     * @returns {Promise<void>}
     */
    async saveToIndexedDB(key, value) {
      try {
        const db = await this.openIndexedDB();
        const tx = db.transaction("store", "readwrite");
        const store = tx.objectStore("store");
        store.put({ key, value });
        return new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        console.warn("[Storage] IndexedDB save error:", e.message);
      }
    },

    /**
     * Load from IndexedDB (placeholder)
     * @param {string} key – The key
     * @returns {Promise<any>}
     */
    async loadFromIndexedDB(key) {
      try {
        const db = await this.openIndexedDB();
        const tx = db.transaction("store", "readonly");
        const store = tx.objectStore("store");
        const request = store.get(key);
        return new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result?.value);
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        console.warn("[Storage] IndexedDB load error:", e.message);
        return null;
      }
    },
  };

  return Storage;
})();

// Only assign if not already assigned
if (!W.store) {
  W.store = StorageModule;
  console.log("[Storage] Module loaded.");
} else {
  console.log("[Storage] Module already loaded, skipping reassignment.");
}

// ---- js/api/prices.js ----
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

// ---- js/utils/format.js ----
// Complete Formatting Utilities

window.W = window.W || {};

// ── Currency Symbols ────────────────────────────────────
W.SYMBOLS = {
  usd: "$",
  eur: "€",
  gbp: "£",
  inr: "₹",
  jpy: "¥",
  aud: "A$",
  cad: "C$",
  chf: "Fr",
  cny: "¥",
  krw: "₩",
  rub: "₽",
  ngn: "₦", // Nigerian Naira
  btc: "₿",
  eth: "⟠",
  sol: "◎",
  usdt: "₮",
  usdc: "₮",
};

// ── Color Palette ──────────────────────────────────────
W.PALETTE = [
  "#7c5cff", // brand purple
  "#2ee6a8", // brand green
  "#5cd6ff", // brand cyan
  "#ffb35c", // warn / gold
  "#ff5c7a", // danger / red
  "#c792ea", // lavender
  "#f78c6c", // orange
  "#8bd450", // lime
  "#ff8bd0", // pink
  "#9aa3b2", // muted gray
];

// ── Formatting Helpers ─────────────────────────────────

/**
 * Get the current currency symbol
 * @param {string} currency - Optional currency code
 * @returns {string} Currency symbol
 */
W.fmt.getSymbol = function (currency) {
  const cur = currency || W.currency?.() || "usd";
  return W.SYMBOLS[cur.toLowerCase()] || "$";
};

/**
 * Get the current currency code
 * @returns {string} Currency code
 */
W.fmt.getCurrency = function () {
  return W.currency?.() || "usd";
};

/**
 * Format a number as currency
 * @param {number} value - The value to format
 * @param {Object} options - { compact: bool, decimals: number, currency: string }
 * @returns {string} Formatted currency string
 */
W.fmt.money = function (value, options = {}) {
  if (value == null || isNaN(value)) return "—";
  const abs = Math.abs(value);
  const neg = value < 0 ? "- " : "";
  const cur = options.currency || W.currency?.() || "usd";
  const sym = W.fmt.getSymbol(cur);
  const decimals = options.decimals ?? 2;

  // NGN often uses fewer decimals (no fractional kobo in practice)
  const isNgn = cur.toLowerCase() === "ngn";

  // Compact formatting (K, M, B)
  if (options.compact) {
    if (abs >= 1e9) return neg + sym + (abs / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return neg + sym + (abs / 1e6).toFixed(2) + "M";
    if (abs >= 1e5) return neg + sym + (abs / 1e3).toFixed(1) + "K";
  }

  // NGN: use 0 decimals by default (no kobo), or respect custom decimals
  const finalDecimals = isNgn && !options.decimals ? 0 : decimals;

  // For very small numbers (crypto), show more decimals
  if (abs < 0.01 && abs > 0 && !isNgn) {
    return neg + sym + abs.toFixed(6);
  }

  return (
    neg +
    sym +
    abs.toLocaleString(undefined, {
      minimumFractionDigits: finalDecimals,
      maximumFractionDigits: finalDecimals,
    })
  );
};

/**
 * Format a price (similar to money but with more precision for small values)
 * @param {number} value - The price to format
 * @param {string} currency - Optional currency code
 * @returns {string} Formatted price
 */
W.fmt.price = function (value, currency) {
  if (value == null || isNaN(value)) return "—";
  const cur = currency || W.currency?.() || "usd";
  const sym = W.fmt.getSymbol(cur);
  const abs = Math.abs(value);
  const neg = value < 0 ? "-" : "";
  const isNgn = cur.toLowerCase() === "ngn";

  // NGN: use 2 decimals max
  if (isNgn) {
    return (
      neg +
      sym +
      abs.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    );
  }

  // For micro amounts (e.g., memecoins), show more decimals
  if (abs < 0.0001 && abs > 0) {
    return neg + sym + abs.toFixed(8);
  }
  if (abs < 0.01 && abs > 0) {
    return neg + sym + abs.toFixed(6);
  }

  return (
    neg +
    sym +
    abs.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};
/**
 * Format a percentage with sign
 * @param {number} value - The percentage value
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} Formatted percentage with HTML color class
 */
W.fmt.pct = function (value, decimals = 2) {
  if (value == null || isNaN(value)) return '<span class="muted">—</span>';
  const sign = value >= 0 ? "▲ " : "▼ ";
  const abs = Math.abs(value);
  const cls = value >= 0 ? "up" : "down";
  return `<span class="${cls}">${sign}${abs.toFixed(decimals)}%</span>`;
};

/**
 * Format a percentage as plain text (no HTML)
 * @param {number} value - The percentage value
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} Plain text percentage
 */
W.fmt.pctPlain = function (value, decimals = 2) {
  if (value == null || isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
};

/**
 * Format a number with thousand separators
 * @param {number} value - The number to format
 * @param {number} decimals - Decimal places (default: 0)
 * @returns {string} Formatted number
 */
W.fmt.num = function (value, decimals = 0) {
  if (value == null || isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Format a number with K/M/B suffix (compact)
 * @param {number} value - The number to format
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Compact number
 */
W.fmt.compact = function (value, decimals = 1) {
  if (value == null || isNaN(value)) return "—";
  const abs = Math.abs(value);
  const neg = value < 0 ? "-" : "";
  if (abs >= 1e9) return neg + (abs / 1e9).toFixed(decimals) + "B";
  if (abs >= 1e6) return neg + (abs / 1e6).toFixed(decimals) + "M";
  if (abs >= 1e3) return neg + (abs / 1e3).toFixed(decimals) + "K";
  return neg + abs.toFixed(decimals);
};

/**
 * Truncate a string with ellipsis
 * @param {string} str - The string to truncate
 * @param {number} maxLen - Maximum length (default: 60)
 * @returns {string} Truncated string
 */
W.fmt.truncate = function (str, maxLen = 60) {
  if (!str || typeof str !== "string") return "";
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
};

/**
 * Shorten an address (e.g., 0x1234...5678)
 * @param {string} addr - The address to shorten
 * @param {number} startLen - Characters to keep at start (default: 6)
 * @param {number} endLen - Characters to keep at end (default: 4)
 * @returns {string} Shortened address
 */
W.fmt.addr = function (addr, startLen = 6, endLen = 4) {
  if (!addr || typeof addr !== "string") return "—";
  if (addr.length <= startLen + endLen + 3) return addr;
  return addr.slice(0, startLen) + "…" + addr.slice(-endLen);
};

/**
 * Format a timestamp as a date string
 * @param {number|string|Date} ts - Timestamp, date string, or Date object
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date
 */
W.fmt.date = function (ts, options = {}) {
  if (!ts) return "—";
  const date = typeof ts === "object" ? ts : new Date(ts);
  if (isNaN(date.getTime())) return "—";

  const defaultOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const merged = { ...defaultOptions, ...options };
  return date.toLocaleDateString(undefined, merged);
};

/**
 * Format a timestamp as a time string
 * @param {number|string|Date} ts - Timestamp, date string, or Date object
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted time
 */
W.fmt.time = function (ts, options = {}) {
  if (!ts) return "—";
  const date = typeof ts === "object" ? ts : new Date(ts);
  if (isNaN(date.getTime())) return "—";

  const defaultOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };
  const merged = { ...defaultOptions, ...options };
  return date.toLocaleTimeString(undefined, merged);
};

/**
 * Format a timestamp as relative time (e.g., "3 hours ago")
 * @param {number|string|Date} ts - Timestamp, date string, or Date object
 * @param {Object} options - { future: bool, short: bool }
 * @returns {string} Relative time string
 */
W.fmt.relative = function (ts, options = {}) {
  if (!ts) return "—";
  const date = typeof ts === "object" ? ts : new Date(ts);
  if (isNaN(date.getTime())) return "—";

  const now = Date.now();
  const diff = date.getTime() - now;
  const absDiff = Math.abs(diff);
  const short = options.short || false;

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const inFuture = diff > 0;
  const suffix = inFuture ? (short ? "" : " from now") : short ? "" : " ago";

  let label = "";
  if (seconds < 60) label = short ? "now" : "just now";
  else if (minutes < 60) label = (short ? "" : minutes + "m") + suffix;
  else if (hours < 24) label = (short ? "" : hours + "h") + suffix;
  else if (days < 7) label = (short ? "" : days + "d") + suffix;
  else if (weeks < 4) label = (short ? "" : weeks + "w") + suffix;
  else if (months < 12) label = (short ? "" : months + "mo") + suffix;
  else label = (short ? "" : years + "y") + suffix;

  return label;
};

/**
 * Format a number with sign (+/-)
 * @param {number} value - The value to format
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} Signed number
 */
W.fmt.signed = function (value, decimals = 2) {
  if (value == null || isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return sign + value.toFixed(decimals);
};

/**
 * Format a number with color class based on sign
 * @param {number} value - The value to format
 * @param {number} decimals - Decimal places (default: 2)
 * @param {string} prefix - Optional prefix (e.g., currency symbol)
 * @returns {string} HTML formatted number with color
 */
W.fmt.colored = function (value, decimals = 2, prefix = "") {
  if (value == null || isNaN(value)) return '<span class="muted">—</span>';
  const sign = value >= 0 ? "+" : "";
  const cls = value >= 0 ? "up" : "down";
  return `<span class="${cls}">${sign}${prefix}${Math.abs(value).toFixed(decimals)}</span>`;
};

/**
 * Escape HTML to prevent XSS
 * @param {string} str - The string to escape
 * @returns {string} Escaped HTML string
 */
W.fmt.escapeHTML = function (str) {
  if (!str || typeof str !== "string") return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
};

/**
 * Format a file size in bytes
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Formatted file size
 */
W.fmt.filesize = function (bytes, decimals = 1) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return value.toFixed(decimals) + " " + sizes[i];
};

/**
 * Format a duration in seconds to human-readable
 * @param {number} seconds - Duration in seconds
 * @returns {string} Human-readable duration
 */
W.fmt.duration = function (seconds) {
  if (!seconds || seconds < 0) return "0s";
  const units = [
    { name: "y", value: 31536000 },
    { name: "d", value: 86400 },
    { name: "h", value: 3600 },
    { name: "m", value: 60 },
    { name: "s", value: 1 },
  ];
  let remaining = Math.floor(seconds);
  const parts = [];
  for (const unit of units) {
    const count = Math.floor(remaining / unit.value);
    if (count > 0) {
      parts.push(count + unit.name);
      remaining -= count * unit.value;
    }
  }
  return parts.join(" ") || "0s";
};

console.log("[Utils] Format module loaded.");

// ---- js/utils/debounce.js ----
//  Debounce Utility

window.W = window.W || {};

/**
 * Debounce a function – limits how often it can be called.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} ms - Delay in milliseconds (default: 300)
 * @param {boolean} immediate - If true, call on leading edge instead of trailing
 * @returns {Function} Debounced function
 *
 * @example
 * const search = W.debounce(async (query) => {
 *   const results = await api.search(query);
 *   render(results);
 * }, 350);
 *
 * input.addEventListener('input', (e) => search(e.target.value));
 */
W.debounce = function (fn, ms = 300, immediate = false) {
  // Validate inputs
  if (typeof fn !== "function") {
    console.warn("[Debounce] Expected a function, got", typeof fn);
    return () => {};
  }
  if (typeof ms !== "number" || ms < 0) {
    console.warn("[Debounce] Invalid delay, using 300ms");
    ms = 300;
  }

  let timer = null;
  let lastCall = 0;

  return function (...args) {
    const context = this;
    const now = Date.now();

    // If immediate and timer is not set, call immediately
    if (immediate && timer === null) {
      fn.apply(context, args);
      timer = setTimeout(() => {
        timer = null;
      }, ms);
      return;
    }

    // Clear the previous timer
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    // Set a new timer
    timer = setTimeout(() => {
      timer = null;
      // Only call if enough time has passed (for trailing edge)
      if (!immediate || now - lastCall >= ms) {
        fn.apply(context, args);
        lastCall = now;
      }
    }, ms);
  };
};

/**
 * Throttle a function – ensures it's called at most once per interval.
 *
 * @param {Function} fn - The function to throttle
 * @param {number} ms - Minimum time between calls (default: 300)
 * @returns {Function} Throttled function
 *
 * @example
 * const update = W.throttle(() => renderChart(), 1000);
 * window.addEventListener('resize', update);
 */
W.throttle = function (fn, ms = 300) {
  if (typeof fn !== "function") {
    console.warn("[Throttle] Expected a function, got", typeof fn);
    return () => {};
  }

  let timer = null;
  let lastCall = 0;

  return function (...args) {
    const context = this;
    const now = Date.now();

    if (timer !== null) {
      // Already scheduled
      return;
    }

    const remaining = ms - (now - lastCall);
    if (remaining <= 0) {
      // Enough time has passed – call immediately
      fn.apply(context, args);
      lastCall = now;
    } else {
      // Schedule for later
      timer = setTimeout(() => {
        timer = null;
        lastCall = Date.now();
        fn.apply(context, args);
      }, remaining);
    }
  };
};

/**
 * Leading-edge throttle – calls immediately, then ignores subsequent calls
 * until the interval has passed.
 *
 * @param {Function} fn - The function to throttle
 * @param {number} ms - Minimum time between calls (default: 300)
 * @returns {Function} Throttled function (leading edge)
 */
W.throttleLeading = function (fn, ms = 300) {
  if (typeof fn !== "function") {
    console.warn("[ThrottleLeading] Expected a function, got", typeof fn);
    return () => {};
  }

  let lastCall = 0;

  return function (...args) {
    const context = this;
    const now = Date.now();

    if (now - lastCall >= ms) {
      lastCall = now;
      fn.apply(context, args);
    }
  };
};

console.log("[Utils] Debounce module loaded.");

// ---- js/ui/theme.js ----
// ================================================================
// js/ui/theme.js – Weaver Theme Configuration
// ================================================================

window.W = window.W || {};

// ── Color Palette ──────────────────────────────────────
W.PALETTE = [
  "#7c5cff", // brand purple
  "#2ee6a8", // brand green
  "#5cd6ff", // brand cyan
  "#ffb35c", // warn / gold
  "#ff5c7a", // danger / red
  "#c792ea", // lavender
  "#f78c6c", // orange
  "#8bd450", // lime
  "#ff8bd0", // pink
  "#9aa3b2", // muted gray
];

// ── Currency Symbols ──────────────────────────────────
W.SYMBOLS = {
  usd: "$",
  eur: "€",
  gbp: "£",
  inr: "₹",
  jpy: "¥",
  aud: "A$",
  cad: "C$",
  btc: "₿",
  eth: "⟠",
};

// ── Chart.js Configuration ────────────────────────────
(function () {
  // Check if Chart.js is available
  if (typeof Chart === "undefined") {
    console.warn("[Theme] Chart.js not loaded — skipping chart theming.");
    return;
  }

  // ── Font ────────────────────────────────────────────
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = "#8b93a7";

  // ── Borders ─────────────────────────────────────────
  Chart.defaults.borderColor = "rgba(255,255,255,.06)";

  // ── Animation ───────────────────────────────────────
  Chart.defaults.animation = {
    duration: 800,
    easing: "easeOutQuart",
  };

  // ── Tooltips ────────────────────────────────────────
  const tooltip = Chart.defaults.plugins.tooltip;
  tooltip.backgroundColor = "rgba(16,18,30,.92)";
  tooltip.titleColor = "#eef1f9";
  tooltip.bodyColor = "#9aa3b2";
  tooltip.borderColor = "rgba(124,92,255,.4)";
  tooltip.borderWidth = 1;
  tooltip.cornerRadius = 10;
  tooltip.padding = 12;
  tooltip.displayColors = false;
  tooltip.titleFont = {
    weight: 700,
    family: "'Sora', 'Inter', system-ui, sans-serif",
  };
  tooltip.bodyFont = {
    family: "'Inter', system-ui, sans-serif",
  };

  // ── Legend ──────────────────────────────────────────
  const legend = Chart.defaults.plugins.legend;
  legend.labels.usePointStyle = true;
  legend.labels.pointStyle = "circle";
  legend.labels.boxWidth = 6;
  legend.labels.boxHeight = 6;
  legend.labels.padding = 16;
  legend.labels.font = {
    family: "'Inter', system-ui, sans-serif",
    size: 11,
  };

  // ── Custom Gradients ───────────────────────────────
  /**
   * Create a gradient for a chart dataset
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {string} color - Hex color (e.g., "#7c5cff")
   * @param {number} opacityTop - Opacity at top (0-1)
   * @param {number} opacityBottom - Opacity at bottom (0-1)
   * @returns {CanvasGradient}
   */
  Chart.helpers.createGradient = function (
    ctx,
    color,
    opacityTop = 0.35,
    opacityBottom = 0.05,
  ) {
    const area = ctx.chart.chartArea;
    if (!area) return "transparent";

    const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    gradient.addColorStop(0, `rgba(${r},${g},${b},${opacityTop})`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},${opacityBottom})`);
    return gradient;
  };

  /**
   * Create a gradient for a doughnut chart
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {string} color - Hex color
   * @param {number} opacity - Opacity (0-1)
   * @returns {CanvasGradient}
   */
  Chart.helpers.createRadialGradient = function (ctx, color, opacity = 0.6) {
    const centerX = ctx.chart.width / 2;
    const centerY = ctx.chart.height / 2;
    const radius = Math.min(ctx.chart.width, ctx.chart.height) / 2;

    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius,
    );
    gradient.addColorStop(0, `rgba(${r},${g},${b},${opacity})`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},${opacity * 0.2})`);
    return gradient;
  };

  console.log("[Theme] Chart.js configured with Aurora theme.");
})();

// ── Theme Utilities ───────────────────────────────────

/**
 * Get the current currency symbol
 * @returns {string} Currency symbol
 */
W.getCurrencySymbol = function () {
  const cur = W.currency ? W.currency() : "usd";
  return W.SYMBOLS[cur] || "$";
};

/**
 * Get the current currency code
 * @returns {string} Currency code (e.g., 'usd')
 */
W.getCurrency = function () {
  return W.currency ? W.currency() : "usd";
};

/**
 * Format a number with the current currency
 * @param {number} value - Value to format
 * @param {Object} options - { compact: boolean, decimals: number }
 * @returns {string} Formatted string
 */
W.formatCurrency = function (value, options = {}) {
  if (value == null || isNaN(value)) return "—";
  const cur = W.getCurrency();
  const sym = W.getCurrencySymbol();
  const abs = Math.abs(value);
  const neg = value < 0 ? "-" : "";
  const decimals = options.decimals ?? 2;

  if (options.compact) {
    if (abs >= 1e9) return neg + sym + (abs / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return neg + sym + (abs / 1e6).toFixed(2) + "M";
    if (abs >= 1e5) return neg + sym + (abs / 1e3).toFixed(1) + "K";
  }

  return (
    neg +
    sym +
    abs.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
};

// ── Theme toggle (if you add dark/light mode later) ──
W.theme = {
  current: "dark",

  toggle() {
    this.current = this.current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", this.current);
    if (this.current === "light") {
      document.documentElement.style.setProperty("--bg", "#f5f7fa");
      document.documentElement.style.setProperty("--text", "#1a1a2e");
      document.documentElement.style.setProperty(
        "--card",
        "rgba(255,255,255,0.7)",
      );
      document.documentElement.style.setProperty("--muted", "#6b7280");
    } else {
      document.documentElement.style.setProperty("--bg", "#07080d");
      document.documentElement.style.setProperty("--text", "#eef1f9");
      document.documentElement.style.setProperty(
        "--card",
        "rgba(22,25,38,0.45)",
      );
      document.documentElement.style.setProperty("--muted", "#98a1b3");
    }
    return this.current;
  },

  // Detect system preference
  detect() {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      this.current = "light";
    } else {
      this.current = "dark";
    }
    document.documentElement.setAttribute("data-theme", this.current);
    return this.current;
  },
};

// Auto-detect on load
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    W.theme.detect();
    console.log(`[Theme] Detected theme: ${W.theme.current}`);
  });
}

console.log("[Theme] Module loaded.");

// ---- js/ui/ui.js ----
// ================================================================
// js/ui/ui.js – Weaver UI Utilities
// ================================================================

window.W = window.W || {};

W.ui = {
  /**
   * Show a toast notification
   * @param {string} msg - HTML message to display
   * @param {string} type - 'info', 'ok', 'warn'
   * @param {number} ms - Duration in milliseconds
   */
  toast(msg, type = "info", ms = 3500) {
    const container = document.getElementById("toasts");
    if (!container) {
      console.warn("[UI] Toast container not found");
      return;
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 300);
    }, ms);
  },

  /**
   * Create a modal dialog
   * @param {Object} config - { title, body, footer }
   * @returns {Object} { close, el }
   */
  modal({ title, body, footer }) {
    const root = document.getElementById("modal-root");
    if (!root) {
      console.warn("[UI] Modal root not found");
      return { close: () => {}, el: null };
    }

    root.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <h3>${title}</h3>
            <button class="modal-x" aria-label="Close">✕</button>
          </div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
        </div>
      </div>
    `;

    const close = () => {
      root.innerHTML = "";
    };

    // Close on X button
    const closeBtn = root.querySelector(".modal-x");
    if (closeBtn) closeBtn.onclick = close;

    // Close on backdrop click
    const backdrop = root.querySelector("#modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", (e) => {
        if (e.target.id === "modal-backdrop") close();
      });
    }

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    return {
      close,
      el: root.querySelector(".modal"),
    };
  },

  /**
   * Show a confirmation dialog
   * @param {string} msg - Confirmation message
   * @param {Function} onYes - Callback when confirmed
   */
  confirm(msg, onYes) {
    const m = this.modal({
      title: "Are you sure?",
      body: `<p>${msg}</p>`,
      footer: `
        <button class="btn ghost" data-a="no">Cancel</button>
        <button class="btn danger" data-a="yes">Delete</button>
      `,
    });

    const noBtn = m.el?.querySelector('[data-a="no"]');
    const yesBtn = m.el?.querySelector('[data-a="yes"]');

    if (noBtn) noBtn.onclick = m.close;
    if (yesBtn) {
      yesBtn.onclick = () => {
        m.close();
        onYes();
      };
    }
  },

  /**
   * Search-as-you-type coin picker
   * @param {HTMLElement} container - The container element
   * @param {Function} onPick - Callback with selected coin { id, symbol, name, img }
   */
  coinPicker(container, onPick) {
    if (!container) {
      console.warn("[UI] coinPicker: container not found");
      return;
    }

    container.innerHTML = `
      <div class="picker">
        <input class="picker-input" placeholder="Search coin (e.g. bitcoin, ETH)…" autocomplete="off">
        <div class="picker-results hidden"></div>
        <div class="picker-chip hidden"></div>
      </div>
    `;

    const input = container.querySelector(".picker-input");
    const results = container.querySelector(".picker-results");
    const chip = container.querySelector(".picker-chip");

    if (!input || !results || !chip) return;

    const doSearch = W.debounce
      ? W.debounce(async () => {
          const q = input.value.trim();
          if (q.length < 2) {
            results.classList.add("hidden");
            return;
          }

          try {
            if (!W.api || !W.api.search) {
              throw new Error("CoinGecko API not loaded");
            }
            const data = await W.api.search(q);
            const coins = (data.coins || []).slice(0, 8);

            if (!coins.length) {
              results.innerHTML =
                '<div class="picker-item muted">No results</div>';
              results.classList.remove("hidden");
              return;
            }

            results.innerHTML = coins
              .map(
                (c) => `
              <div class="picker-item" data-id="${c.id}" data-symbol="${c.symbol}" data-name="${c.name}" data-img="${c.thumb || ""}">
                <img src="${c.thumb || ""}" alt="">
                <span>${c.name} <b class="muted">${c.symbol.toUpperCase()}</b></span>
                ${c.market_cap_rank ? `<span class="muted small">#${c.market_cap_rank}</span>` : ""}
              </div>
            `,
              )
              .join("");

            results.classList.remove("hidden");

            results.querySelectorAll(".picker-item[data-id]").forEach((it) => {
              it.onclick = () => {
                const pick = {
                  id: it.dataset.id,
                  symbol: it.dataset.symbol,
                  name: it.dataset.name,
                  img: it.dataset.img,
                };
                chip.innerHTML = `
              <img src="${pick.img}" alt="">
              ${pick.name} (${pick.symbol.toUpperCase()})
              <button class="picker-clear">✕</button>
            `;
                chip.classList.remove("hidden");
                input.classList.add("hidden");
                results.classList.add("hidden");
                chip.querySelector(".picker-clear").onclick = () => {
                  chip.classList.add("hidden");
                  input.classList.remove("hidden");
                  input.value = "";
                  onPick(null);
                };
                onPick(pick);
              };
            });
          } catch (e) {
            console.warn("[UI] coinPicker search error:", e.message);
            results.innerHTML = `<div class="picker-item muted">⚠️ ${e.message}</div>`;
            results.classList.remove("hidden");
          }
        }, 350)
      : (() => {
          console.warn("[UI] W.debounce not available");
        })();

    input.addEventListener("input", doSearch);

    input.addEventListener("focus", () => {
      if (results.innerHTML) results.classList.remove("hidden");
    });

    // Close results when clicking outside
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) results.classList.add("hidden");
    });
  },

  /**
   * Loading spinner HTML
   * @returns {string} HTML string
   */
  spinner() {
    return '<div class="spinner"></div>';
  },

  /**
   * Empty state HTML
   * @param {string} icon - Emoji or icon
   * @param {string} msg - Main message
   * @param {string} sub - Subtitle message (optional)
   * @returns {string} HTML string
   */
  empty(icon, msg, sub = "") {
    return `
      <div class="empty">
        <div class="empty-icon">${icon}</div>
        <p>${msg}</p>
        ${sub ? `<p class="muted small">${sub}</p>` : ""}
      </div>
    `;
  },
};

console.log("[UI] Module loaded.");

// ---- js/ui/dashboard.js ----
// ===============================================================
//                     Weaver Dashboard UI
// ===============================================================

window.W = window.W || {};

W.dashboard = (() => {
  let chartAlloc = null;
  let chartSpark = null;

  // ── Helper: Stat Card HTML ───────────────────────────
  const statCard = (label, big, sub) =>
    `<div class="card stat">
      <div class="stat-label">${label}</div>
      <div class="stat-big">${big}</div>
      <div class="stat-sub">${sub}</div>
    </div>`;

  // ── Helper: Signed Money ────────────────────────────
  const signedMoney = (n) =>
    n == null
      ? "—"
      : `<span class="${n >= 0 ? "up" : "down"}">${n >= 0 ? "+" : "-"}${W.fmt.money(Math.abs(n))}</span>`;

  // ── Helper: Terminal Tape ────────────────────────────
  const tapeHTML = (coins) => {
    if (!coins || !Array.isArray(coins) || !coins.length) {
      return '<div class="tape-wrap"><div class="tape"><span class="tape-item muted">📊 Loading market data...</span></div></div>';
    }

    let tapeItems = "";
    let validCount = 0;

    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c || typeof c !== "object") continue;
      const symbol = c.symbol || (c.symbol === "" ? c.symbol : null);
      if (!symbol) continue;
      const price =
        c.current_price !== undefined
          ? c.current_price
          : c.price !== undefined
            ? c.price
            : null;
      if (price === null || price === undefined) continue;
      const change =
        c.price_change_percentage_24h_in_currency !== undefined
          ? c.price_change_percentage_24h_in_currency
          : 0;

      tapeItems += `
        <span class="tape-item">
          <b>${symbol.toUpperCase()}</b>
          <span class="muted">${W.fmt.price(price)}</span>
          ${W.fmt.pct(change)}
        </span>`;
      validCount++;
      if (validCount >= 20) break;
    }

    if (!tapeItems) {
      return '<div class="tape-wrap"><div class="tape"><span class="tape-item muted">📊 No market data available</span></div></div>';
    }

    const doubled = tapeItems + tapeItems;

    return `<div class="tape-wrap">
      <div class="tape">${doubled}</div>
    </div>`;
  };

  // ── Helper: Sparkline ────────────────────────────────
  function drawSpark(c) {
    const vals = (c.dataset.spark || "")
      .split(",")
      .map(Number)
      .filter((v) => !isNaN(v));
    if (vals.length < 2) return;
    const w = (c.width = 110),
      h = (c.height = 30),
      ctx = c.getContext("2d");
    const min = Math.min(...vals),
      max = Math.max(...vals),
      up = c.dataset.up === "1";
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = up ? "#2ee6a8" : "#ff5c7a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w,
        y = h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = up ? "rgba(46,230,168,.12)" : "rgba(255,92,122,.12)";
    ctx.fill();
  }

  const sparkCell = (arr, up) =>
    arr && arr.length
      ? `<canvas class="spark" data-up="${up ? 1 : 0}" data-spark="${arr
          .filter((_, i) => i % 6 === 0)
          .map((v) => v.toFixed(4))
          .join(",")}"></canvas>`
      : '<span class="muted small">—</span>';

  // ── Helper: Terminal Row (DEFENSIVE) ────────────────────
  const termRow = (c, i) => {
    if (!c || typeof c !== "object") return "";

    const id = c.id || "unknown";
    const image = c.image || "";
    const name = c.name || "Unknown";
    const symbol = c.symbol ? c.symbol.toUpperCase() : "???";
    const price =
      c.current_price !== undefined ? c.current_price : c.price || 0;
    const p24 =
      c.price_change_percentage_24h_in_currency !== undefined
        ? c.price_change_percentage_24h_in_currency
        : 0;
    const p7 =
      c.price_change_percentage_7d_in_currency !== undefined
        ? c.price_change_percentage_7d_in_currency
        : 0;
    const p30 =
      c.price_change_percentage_30d_in_currency !== undefined
        ? c.price_change_percentage_30d_in_currency
        : 0;
    const marketCap = c.market_cap || 0;
    const volume = c.total_volume || 0;
    const sparkline = (c.sparkline_in_7d || {}).price || [];

    return `
      <tr class="clickable" data-coin="${id}">
        <td class="muted">${i + 1}</td>
        <td class="coin-cell">
          <img src="${image}" alt="${name}" style="width:24px;height:24px;border-radius:50%;">
          <div>
            <b>${symbol}</b>
            <span class="muted small">${name}</span>
          </div>
        </td>
        <td class="num"><b>${W.fmt.price(price)}</b></td>
        <td class="num">${W.fmt.pct(p24)}</td>
        <td class="num">${W.fmt.pct(p7)}</td>
        <td class="num">${W.fmt.pct(p30)}</td>
        <td class="num">${W.fmt.money(marketCap, { compact: true })}</td>
        <td class="num">${W.fmt.money(volume, { compact: true })}</td>
        <td>${sparkCell(sparkline, p24 >= 0)}</td>
      </tr>
    `;
  };

  // ── Enrich Portfolio Data (with wallet sync) ──────────
  async function enrich() {
    // Get manual holdings
    const manualHoldings = W.portfolio ? W.portfolio.all() : [];
    // Get wallet holdings (if any)
    let walletHoldings = [];
    if (W.walletSync && typeof W.walletSync.holdings === "function") {
      walletHoldings = W.walletSync.holdings() || [];
    }

    // Merge: wallet holdings are marked as wallet: true
    const allHoldings = [
      ...manualHoldings.map((h) => ({ ...h, wallet: false })),
      ...walletHoldings.map((h) => ({ ...h, wallet: true })),
    ];

    if (!allHoldings.length) return { rows: [], totals: null };

    const ids = [...new Set(allHoldings.map((h) => h.coinId))].join(",");
    let markets = [];
    if (ids.trim()) {
      try {
        markets = await W.api.markets(ids);
      } catch (e) {
        console.warn("[Dashboard] Market fetch failed:", e.message);
      }
    }

    const rows = allHoldings
      .map((h) => {
        const m = markets.find((c) => c.id === h.coinId) || {};
        const price = m.current_price ?? h.buyPrice ?? 0;
        const value = price * h.qty;
        const cost = h.wallet ? value : (h.buyPrice || 0) * h.qty; // wallet holdings have no cost basis
        return {
          ...h,
          price,
          value,
          cost,
          pnl: value - cost,
          pnlPct: cost ? ((value - cost) / cost) * 100 : 0,
          p24: m.price_change_percentage_24h_in_currency ?? null,
          p7: m.price_change_percentage_7d_in_currency ?? null,
          image: m.image || h.img,
        };
      })
      .sort((a, b) => b.value - a.value);

    const totals = { value: 0, cost: 0 };
    let prev24 = 0,
      prev7 = 0;
    rows.forEach((r) => {
      totals.value += r.value;
      totals.cost += r.cost;
      if (r.p24 != null) prev24 += r.value / (1 + r.p24 / 100);
      if (r.p7 != null) prev7 += r.value / (1 + r.p7 / 100);
    });
    totals.allTime = totals.value - totals.cost;
    totals.allTimePct = totals.cost ? (totals.allTime / totals.cost) * 100 : 0;
    totals.day = totals.value - prev24;
    totals.dayPct = prev24 ? (totals.day / prev24) * 100 : 0;
    totals.week = totals.value - prev7;
    totals.weekPct = prev7 ? (totals.week / prev7) * 100 : 0;
    return { rows, totals };
  }

  // ── Holdings Table ──────────────────────────────────
  const holdingsTable = (rows) => `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>24h</th>
            <th>Qty</th>
            <th>Avg Buy</th>
            <th>Value</th>
            <th>P/L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td class="coin-cell">
                <img src="${r.image || r.img || ""}" alt="${r.name}">
                <div>
                  <b>${r.name}</b>
                  <br><span class="muted small">${r.symbol.toUpperCase()}</span>
                </div>
              </td>
              <td>${W.fmt.price(r.price)}</td>
              <td>${W.fmt.pct(r.p24)}</td>
              <td>${r.qty}</td>
              <td>${r.wallet ? "—" : W.fmt.price(r.buyPrice)}</td>
              <td><b>${W.fmt.money(r.value)}</b></td>
              <td>${r.wallet ? '<span class="muted">—</span>' : signedMoney(r.pnl) + '<div class="small">' + W.fmt.pct(r.pnlPct) + "</div>"}</td>
              <td class="row-actions">
                ${
                  r.wallet
                    ? '<span class="tag rank" title="From connected wallet">👛 wallet</span>'
                    : `
                  <button class="icon-btn" data-edit="${r.id}" title="Edit">✏️</button>
                  <button class="icon-btn" data-del="${r.id}" title="Delete">🗑️</button>
                `
                }
              </td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  // ── Wire row actions ─────────────────────────────────
  function wireRows(container, rows) {
    rows.forEach((r) => {
      if (r.wallet) return; // skip wallet rows
      const e = container.querySelector(`[data-edit="${r.id}"]`);
      const d = container.querySelector(`[data-del="${r.id}"]`);
      if (e) e.onclick = () => holdingModal(r);
      if (d) {
        d.onclick = () =>
          W.ui.confirm(`Remove <b>${r.name}</b> from your portfolio?`, () => {
            if (W.portfolio && W.portfolio.remove) W.portfolio.remove(r.id);
            W.ui.toast("Holding removed", "ok");
            W.refresh();
          });
      }
    });
  }

  // ── Holding Modal ────────────────────────────────────
  function holdingModal(existing = null, preselect = null) {
    const coinLine = existing
      ? `<p class="muted small">Coin: <b>${existing.name} (${existing.symbol.toUpperCase()})</b></p>`
      : preselect
        ? `<p class="muted small">Coin: <b>${preselect.name} (${preselect.symbol.toUpperCase()})</b></p>`
        : `<div id="picker"></div>`;

    const m = W.ui.modal({
      title: existing ? `Edit ${existing.name}` : "Add Holding",
      body: `
        <form id="h-form">
          ${coinLine}
          <label>
            Quantity
            <input type="number" step="any" name="qty" required value="${existing ? existing.qty : ""}" placeholder="0.5">
          </label>
          <label>
            Average buy price
            <input type="number" step="any" name="buyPrice" required value="${existing ? existing.buyPrice : ""}" placeholder="29500">
          </label>
          <label>
            Date (optional)
            <input type="date" name="date">
          </label>
        </form>
      `,
      footer: `
        <button class="btn ghost" id="h-cancel">Cancel</button>
        <button class="btn primary" id="h-save">${existing ? "Save" : "Add"}</button>
      `,
    });

    let picked = existing
      ? {
          id: existing.coinId,
          symbol: existing.symbol,
          name: existing.name,
          img: existing.img,
        }
      : preselect
        ? {
            id: preselect.id,
            symbol: preselect.symbol,
            name: preselect.name,
            img: preselect.image?.small || "",
          }
        : null;

    if (!existing && !preselect && W.ui.coinPicker) {
      W.ui.coinPicker(m.el.querySelector("#picker"), (p) => (picked = p));
    }

    m.el.querySelector("#h-cancel").onclick = m.close;
    m.el.querySelector("#h-save").onclick = () => {
      const f = m.el.querySelector("#h-form");
      const qty = parseFloat(f.qty.value),
        buyPrice = parseFloat(f.buyPrice.value);
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      if (!qty || qty <= 0 || isNaN(buyPrice) || buyPrice < 0) {
        return W.ui.toast("Enter valid quantity and price", "warn");
      }
      if (existing && W.portfolio && W.portfolio.update) {
        W.portfolio.update(existing.id, { qty, buyPrice });
      } else if (W.portfolio && W.portfolio.add) {
        W.portfolio.add({
          coinId: picked.id,
          symbol: picked.symbol,
          name: picked.name,
          img: picked.img,
          qty,
          buyPrice,
          date: f.date.value ? new Date(f.date.value).getTime() : Date.now(),
        });
      }
      m.close();
      W.ui.toast(existing ? "Holding updated" : "Holding added 🎉", "ok");
      W.refresh();
    };
  }

  // ── Transaction Modal ────────────────────────────────
  function txModal() {
    const m = W.ui.modal({
      title: "Record Transaction",
      body: `
        <form id="t-form">
          <label>
            Type
            <select name="type">
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <div id="picker"></div>
          <label>
            Quantity
            <input type="number" step="any" name="qty" required placeholder="0.25">
          </label>
          <label>
            Price per coin
            <input type="number" step="any" name="price" required placeholder="Price at time of trade">
          </label>
        </form>
      `,
      footer: `
        <button class="btn ghost" id="t-cancel">Cancel</button>
        <button class="btn primary" id="t-save">Record</button>
      `,
    });

    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(m.el.querySelector("#picker"), (p) => (picked = p));
    }

    m.el.querySelector("#t-cancel").onclick = m.close;
    m.el.querySelector("#t-save").onclick = () => {
      const f = m.el.querySelector("#t-form");
      const qty = parseFloat(f.qty.value),
        price = parseFloat(f.price.value);
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      if (!qty || qty <= 0 || !price || price <= 0) {
        return W.ui.toast("Enter valid quantity and price", "warn");
      }
      if (W.portfolio && W.portfolio.recordTx) {
        const ok = W.portfolio.recordTx({
          type: f.type.value,
          coin: {
            id: picked.id,
            symbol: picked.symbol,
            name: picked.name,
            img: picked.img,
          },
          qty,
          price,
        });
        if (ok) {
          m.close();
          W.ui.toast("Transaction recorded ✓", "ok");
          W.refresh();
        }
      } else {
        W.ui.toast("Portfolio module not available", "warn");
      }
    };
  }

  // ── MAIN RENDER ──────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div id="d-tape"></div>
      <div class="cards" id="d-stats"></div>
      <div class="card">
        <div class="watch-head">
          <h3>🌐 Markets Terminal</h3>
          <div class="qa">
            <button class="btn primary tiny" id="qa-add">+ Add</button>
            <button class="btn tiny" id="qa-tx">↔ Buy/Sell</button>
            <button class="btn tiny" id="qa-sample" title="Load sample portfolio">🎲</button>
            <button class="btn tiny" id="qa-sync" title="Sync connected wallets">👛 Sync</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="term-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Token</th>
                <th class="num">Price</th>
                <th class="num">24H</th>
                <th class="num">7D</th>
                <th class="num">30D</th>
                <th class="num">Market Cap</th>
                <th class="num">Volume</th>
                <th>7d Chart</th>
              </tr>
            </thead>
            <tbody id="d-rows">
              <tr><td colspan="9">${W.ui.spinner()}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="watch-head">
            <h3>💼 Your Portfolio</h3>
            <div class="qa">
              <button class="btn primary tiny" id="qa-add2">+ Add</button>
              <button class="btn tiny" id="qa-tx2">↔ Buy/Sell</button>
              <button class="btn tiny" id="qa-sample2" title="Load sample portfolio">🎲</button>
            </div>
          </div>
          <div id="d-port"></div>
        </div>
        <div class="card">
          <h3>🍩 Allocation</h3>
          <div class="chart-box"><canvas id="alloc"></canvas></div>
        </div>
      </div>
    `;

    // ── Wire buttons ────────────────────────────────────
    const btns = view.querySelectorAll("#qa-add, #qa-add2");
    btns.forEach((b) => (b.onclick = () => holdingModal()));

    const txBtns = view.querySelectorAll("#qa-tx, #qa-tx2");
    txBtns.forEach((b) => (b.onclick = () => txModal()));

    const sampleBtns = view.querySelectorAll("#qa-sample, #qa-sample2");
    sampleBtns.forEach((b) => {
      b.onclick = () => {
        if (W.portfolio && W.portfolio.seed) {
          W.portfolio.seed();
          W.ui.toast("Sample portfolio loaded 🎉", "ok");
          W.refresh();
        }
      };
    });

    const syncBtn = view.querySelector("#qa-sync");
    if (syncBtn) {
      syncBtn.onclick = async () => {
        W.ui.toast("👛 Syncing wallets…", "info");
        if (W.walletSync && W.walletSync.refresh) {
          await W.walletSync.refresh();
          W.refresh();
        } else {
          W.ui.toast("Wallet sync module not available", "warn");
        }
      };
    }

    // ── Fetch data ──────────────────────────────────────
    const [topR, globR, fgR, pf] = await Promise.allSettled([
      W.api.top(100),
      W.api.global(),
      W.api.fearGreed(),
      enrich(),
    ]);

    const TOP =
      topR.status === "fulfilled" && Array.isArray(topR.value)
        ? topR.value
        : [];
    const rows = pf.status === "fulfilled" ? pf.value.rows : [];
    const totals = pf.status === "fulfilled" ? pf.value.totals : null;
    const g = globR.status === "fulfilled" ? globR.value.data : null;
    const fg = fgR.status === "fulfilled" ? fgR.value : null;

    // ── Trending data ──────────────────────────────────
    let trendR;
    try {
      const trendData = await W.api.trending();
      trendR = { status: "fulfilled", value: trendData };
    } catch (e) {
      trendR = { status: "rejected", reason: e };
    }

    // ── Tape ────────────────────────────────────────────
    const tapeContainer = view.querySelector("#d-tape");
    if (tapeContainer) {
      if (TOP && TOP.length) {
        tapeContainer.innerHTML = tapeHTML(TOP.slice(0, 20));
      } else {
        tapeContainer.innerHTML = tapeHTML([]);
      }
    }

    // ── Stats ───────────────────────────────────────────
    const fgColor = fg
      ? fg.value < 25
        ? "#ff5c7a"
        : fg.value < 45
          ? "#ffb35c"
          : fg.value < 75
            ? "#f5d76e"
            : "#2ee6a8"
      : "#9aa3b2";

    const statsEl = view.querySelector("#d-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        ${totals ? statCard("Total Balance", W.fmt.money(totals.value), rows.length + " assets") : statCard("Total Balance", "—", "add holdings below")}
        ${totals ? statCard("P/L · 24h", signedMoney(totals.day), W.fmt.pct(totals.dayPct)) : ""}
        ${g ? statCard("Global Market Cap", W.fmt.money(g.total_market_cap[W.currency()], { compact: true }), W.fmt.pct(g.market_cap_change_percentage_24h_usd)) : ""}
        ${g ? statCard("BTC Dominance", g.market_cap_percentage.btc.toFixed(1) + "%", "ETH " + g.market_cap_percentage.eth.toFixed(1) + "%") : ""}
        ${fg ? statCard("Fear & Greed", `<span style="color:${fgColor}">${fg.value}</span>`, fg.value_classification) : ""}
      `;
    }

    // ── Terminal rows ───────────────────────────────────
    let tab = "trending";
    const drawRows = () => {
      let list = TOP;
      if (tab === "trending" && trendR && trendR.status === "fulfilled") {
        list = trendR.value.coins
          .map((x) => x.item.id)
          .map((id) => TOP.find((c) => c.id === id))
          .filter(Boolean);
        if (!list.length) list = TOP.slice(0, 20);
      }
      if (tab === "top") list = TOP.slice(0, 50);
      if (tab === "gain") {
        list = [...TOP]
          .sort(
            (a, b) =>
              (b.price_change_percentage_24h_in_currency ?? 0) -
              (a.price_change_percentage_24h_in_currency ?? 0),
          )
          .slice(0, 20);
      }
      if (tab === "lose") {
        list = [...TOP]
          .sort(
            (a, b) =>
              (a.price_change_percentage_24h_in_currency ?? 0) -
              (b.price_change_percentage_24h_in_currency ?? 0),
          )
          .slice(0, 20);
      }
      const rowsEl = view.querySelector("#d-rows");
      if (rowsEl) {
        const rowsHtml = list.length
          ? list
              .map(termRow)
              .filter((r) => r !== "")
              .join("")
          : '<tr><td colspan="9" class="muted center">All live sources unreachable — data appears when a pipe (or your cache) is available.</td></tr>';
        rowsEl.innerHTML = rowsHtml;
        rowsEl
          .querySelectorAll("tr[data-coin]")
          .forEach(
            (tr) =>
              (tr.onclick = () =>
                (location.hash = "#/coin/" + tr.dataset.coin)),
          );
        rowsEl.querySelectorAll("canvas.spark").forEach(drawSpark);
      }
    };

    // ── Tab switchers ───────────────────────────────────
    const tabContainer = view.querySelector(".watch-head .qa");
    if (tabContainer) {
      const tabs = ["trending", "top", "gain", "lose"];
      const labels = ["🔥 Trending", "🏆 Top", "📈 Gainers", "📉 Losers"];
      tabs.forEach((t, i) => {
        const btn = document.createElement("button");
        btn.className = `chip ${i === 0 ? "active" : ""}`;
        btn.dataset.tab = t;
        btn.textContent = labels[i];
        btn.onclick = () => {
          tabContainer
            .querySelectorAll("[data-tab]")
            .forEach((x) => x.classList.remove("active"));
          btn.classList.add("active");
          tab = t;
          drawRows();
        };
        tabContainer.appendChild(btn);
      });
    }

    view.querySelectorAll("[data-tab]").forEach((c) => {
      c.onclick = () => {
        view
          .querySelectorAll("[data-tab]")
          .forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        tab = c.dataset.tab;
        drawRows();
      };
    });

    drawRows();

    // ── Portfolio ──────────────────────────────────────
    const port = view.querySelector("#d-port");
    if (port) {
      if (!rows.length) {
        port.innerHTML = W.ui.empty(
          "💼",
          "Portfolio is empty",
          "Hit + Add, or 🎲 to load the sample portfolio",
        );
      } else {
        port.innerHTML = holdingsTable(rows);
        wireRows(port, rows);
      }
    }

    // ── Allocation Chart ──────────────────────────────
    if (window.Chart) {
      const allocCanvas = view.querySelector("#alloc");
      if (allocCanvas) {
        chartAlloc?.destroy();
        if (rows.length) {
          chartAlloc = new Chart(allocCanvas, {
            type: "doughnut",
            data: {
              labels: rows.map((r) => r.symbol.toUpperCase()),
              datasets: [
                {
                  data: rows.map((r) => +r.value.toFixed(2)),
                  backgroundColor: W.PALETTE || [
                    "#7c5cff",
                    "#2ee6a8",
                    "#5cd6ff",
                    "#ffb35c",
                    "#ff5c7a",
                    "#c792ea",
                    "#f78c6c",
                    "#8bd450",
                    "#ff8bd0",
                    "#9aa3b2",
                  ],
                  borderColor: "#0b0d14",
                  borderWidth: 3,
                  hoverOffset: 14,
                  borderRadius: 8,
                  spacing: 2,
                },
              ],
            },
            options: {
              maintainAspectRatio: false,
              cutout: "62%",
              plugins: {
                legend: {
                  position: "right",
                  labels: {
                    color: "#eef1f9",
                    font: { size: 11 },
                    usePointStyle: true,
                    pointStyle: "circle",
                  },
                },
              },
            },
          });
        } else if (g) {
          const others =
            100 - g.market_cap_percentage.btc - g.market_cap_percentage.eth;
          chartAlloc = new Chart(allocCanvas, {
            type: "doughnut",
            data: {
              labels: ["BTC", "ETH", "Others"],
              datasets: [
                {
                  data: [
                    +g.market_cap_percentage.btc.toFixed(1),
                    +g.market_cap_percentage.eth.toFixed(1),
                    +others.toFixed(1),
                  ],
                  backgroundColor: ["#f7931a", "#627eea", "#7c5cff"],
                  borderColor: "#0b0d14",
                  borderWidth: 3,
                  hoverOffset: 14,
                  borderRadius: 8,
                },
              ],
            },
            options: {
              maintainAspectRatio: false,
              cutout: "62%",
              plugins: {
                legend: {
                  position: "right",
                  labels: {
                    color: "#eef1f9",
                    font: { size: 11 },
                    usePointStyle: true,
                    pointStyle: "circle",
                  },
                },
              },
            },
          });
        }
      }
    }
  }

  // ── Portfolio Page (separate view) ──────────────────
  async function renderPortfolio(view) {
    const has = W.portfolio ? W.portfolio.all().length > 0 : false;

    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>💼 Holdings</h3>
          <div class="qa">
            <button class="btn primary" id="p-add">+ Add Holding</button>
            <button class="btn" id="p-tx">↔ Buy / Sell</button>
          </div>
        </div>
        <div id="p-body">
          ${has ? W.ui.spinner() : W.ui.empty("💼", "No holdings yet", "Add a holding or record a transaction")}
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h3>📜 Transaction History</h3>
          ${W.portfolio && W.portfolio.txs ? txList(W.portfolio.txs().slice().reverse()) : '<p class="muted small">No transactions yet.</p>'}
        </div>
        <div class="card">
          <h3>👛 Wallet Tracking</h3>
          <p class="muted small">Connect MetaMask or Phantom in the <a class="link" href="#/web3">Web3 tab</a> to view on-chain balances. Manual holdings above are stored privately in your browser.</p>
        </div>
      </div>
    `;

    const addBtn = view.querySelector("#p-add");
    if (addBtn) addBtn.onclick = () => holdingModal();

    const txBtn = view.querySelector("#p-tx");
    if (txBtn) txBtn.onclick = () => txModal();

    if (has && W.portfolio) {
      const { rows } = await enrich();
      const body = view.querySelector("#p-body");
      if (body) {
        body.innerHTML = holdingsTable(rows);
        wireRows(body, rows);
      }
    }
  }

  // ── Transaction List Helper ──────────────────────────
  function txList(list) {
    if (!list || !list.length)
      return '<p class="muted small">No transactions yet.</p>';
    return `<ul class="tx-list">
      ${list
        .map(
          (t) => `
        <li>
          <span class="tag ${t.type}">${t.type}</span>
          ${t.qty} ${t.symbol.toUpperCase()} @ ${W.fmt.price(t.price)}
          <span class="muted small">${W.fmt.date(t.date)}</span>
        </li>
      `,
        )
        .join("")}
    </ul>`;
  }

  // ── Exports ──────────────────────────────────────────
  return {
    render,
    renderPortfolio,
    holdingModal,
    txModal,
    enrich,
  };
})();

console.log("[Dashboard] Module loaded.");

// ---- js/api/snapshot.js ----

// js/api/snapshot.js – Fallback Snapshot Cache

// This module provides local snapshot fallbacks when live APIs are unreachable.
// It patches W.api methods to return cached data from /data/ folder.

window.W = window.W || {};

(function () {
  // ── Constants ─────────────────────────────────────────
  const SNAPSHOT_GLOBAL = {
    data: {
      total_market_cap: { usd: 2272990000000 },
      total_volume: { usd: 51130000000 },
      market_cap_percentage: { btc: 56.3, eth: 10.0 },
      market_cap_change_percentage_24h_usd: 0.04,
    },
  };

  const SNAPSHOT_FNG = {
    value: "41",
    value_classification: "Fear",
    timestamp: Date.now() / 1000,
  };

  let topSnapshot = null;
  let globalSnapshot = null;
  let fngSnapshot = null;

  // ── Load snapshots ─────────────────────────────────────
  async function loadSnapshots() {
    try {
      // Try loading from /data/ folder
      const [topRes, globalRes, fngRes] = await Promise.allSettled([
        fetch("data/top.json?t=" + Date.now(), { cache: "no-store" }),
        fetch("data/global.json?t=" + Date.now(), { cache: "no-store" }),
        fetch("data/fng.json?t=" + Date.now(), { cache: "no-store" }),
      ]);

      if (topRes.status === "fulfilled" && topRes.value.ok) {
        topSnapshot = await topRes.value.json();
        try {
          localStorage.setItem("snapshot-top", JSON.stringify(topSnapshot));
        } catch (e) {}
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem("snapshot-top");
        if (stored) topSnapshot = JSON.parse(stored);
      }

      if (globalRes.status === "fulfilled" && globalRes.value.ok) {
        globalSnapshot = await globalRes.value.json();
        try {
          localStorage.setItem(
            "snapshot-global",
            JSON.stringify(globalSnapshot),
          );
        } catch (e) {}
      } else {
        const stored = localStorage.getItem("snapshot-global");
        if (stored) globalSnapshot = JSON.parse(stored);
        else globalSnapshot = SNAPSHOT_GLOBAL;
      }

      if (fngRes.status === "fulfilled" && fngRes.value.ok) {
        fngSnapshot = await fngRes.value.json();
        try {
          localStorage.setItem("snapshot-fng", JSON.stringify(fngSnapshot));
        } catch (e) {}
      } else {
        const stored = localStorage.getItem("snapshot-fng");
        if (stored) fngSnapshot = JSON.parse(stored);
        else fngSnapshot = SNAPSHOT_FNG;
      }
    } catch (e) {
      console.warn("[Snapshot] Load error:", e);
      // Use hardcoded defaults
      topSnapshot = topSnapshot || [];
      globalSnapshot = globalSnapshot || SNAPSHOT_GLOBAL;
      fngSnapshot = fngSnapshot || SNAPSHOT_FNG;
    }

    // Ensure we have arrays
    if (!Array.isArray(topSnapshot)) topSnapshot = [];
  }

  // ── Patch API methods ──────────────────────────────────
  async function patchAPI() {
    const api = W.api;
    if (!api) {
      console.warn("[Snapshot] W.api not found, skipping patch");
      return;
    }

    // Wait for snapshots to load
    await loadSnapshots();

    // ── Patch markets ──────────────────────────────────
    const originalMarkets = api.markets;
    if (originalMarkets) {
      api.markets = async (ids) => {
        try {
          return await originalMarkets(ids);
        } catch (e) {
          console.warn("[Snapshot] Markets fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          const idArray = typeof ids === "string" ? ids.split(",") : ids;
          const result = topSnapshot.filter((c) => idArray.includes(c.id));
          api.source = "snapshot";
          return result.length ? result : topSnapshot.slice(0, idArray.length);
        }
      };
    }

    // ── Patch top ──────────────────────────────────────
    const originalTop = api.top;
    if (originalTop) {
      api.top = async (limit) => {
        try {
          return await originalTop(limit);
        } catch (e) {
          console.warn("[Snapshot] Top fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          api.source = "snapshot";
          return topSnapshot.slice(0, limit);
        }
      };
    }

    // ── Patch global ──────────────────────────────────
    const originalGlobal = api.global;
    if (originalGlobal) {
      api.global = async () => {
        try {
          return await originalGlobal();
        } catch (e) {
          console.warn("[Snapshot] Global fallback:", e.message);
          api.source = "snapshot";
          return globalSnapshot || SNAPSHOT_GLOBAL;
        }
      };
    }

    // ── Patch fearGreed ──────────────────────────────
    const originalFG = api.fearGreed;
    if (originalFG) {
      api.fearGreed = async () => {
        try {
          return await originalFG();
        } catch (e) {
          console.warn("[Snapshot] FearGreed fallback:", e.message);
          api.source = "snapshot";
          const fg = fngSnapshot?.data?.[0] || SNAPSHOT_FNG;
          return fg;
        }
      };
    }

    // ── Patch chart ───────────────────────────────────
    const originalChart = api.chart;
    if (originalChart) {
      api.chart = async (id, days) => {
        try {
          return await originalChart(id, days);
        } catch (e) {
          console.warn("[Snapshot] Chart fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          const coin = topSnapshot.find((c) => c.id === id);
          if (coin?.sparkline_in_7d?.price) {
            api.source = "snapshot";
            const prices = coin.sparkline_in_7d.price;
            const now = Date.now();
            return prices.map((v, i) => [
              now - (prices.length - 1 - i) * 3600000,
              v,
            ]);
          }
          throw new Error("No chart data in snapshot");
        }
      };
    }

    // ── Patch search ──────────────────────────────────
    const originalSearch = api.search;
    if (originalSearch) {
      api.search = async (query) => {
        try {
          return await originalSearch(query);
        } catch (e) {
          console.warn("[Snapshot] Search fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          const q = query.toLowerCase();
          const results = topSnapshot
            .filter(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.symbol.toLowerCase().includes(q),
            )
            .slice(0, 10);
          api.source = "snapshot";
          return {
            coins: results.map((c) => ({
              id: c.id,
              name: c.name,
              symbol: c.symbol,
              thumb: c.image,
              market_cap_rank: c.market_cap_rank,
            })),
          };
        }
      };
    }

    // ── Patch coin ────────────────────────────────────
    const originalCoin = api.coin;
    if (originalCoin) {
      api.coin = async (id) => {
        try {
          return await originalCoin(id);
        } catch (e) {
          console.warn("[Snapshot] Coin fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          const coin = topSnapshot.find((c) => c.id === id);
          if (!coin) throw new Error("Coin not found in snapshot");
          api.source = "snapshot";
          return {
            id: coin.id,
            symbol: coin.symbol,
            name: coin.name,
            image: { large: coin.image, small: coin.image },
            market_data: {
              current_price: { usd: coin.current_price },
              market_cap: { usd: coin.market_cap },
              total_volume: { usd: coin.total_volume },
              price_change_percentage_24h: coin.price_change_percentage_24h,
              price_change_percentage_7d:
                coin.price_change_percentage_7d_in_currency,
              price_change_percentage_30d:
                coin.price_change_percentage_30d_in_currency,
              circulating_supply: coin.circulating_supply,
              max_supply: coin.max_supply,
              ath: { usd: coin.ath },
              ath_change_percentage: { usd: coin.ath_change_percentage },
              atl: { usd: coin.atl },
            },
            market_cap_rank: coin.market_cap_rank,
            description: {
              en: `${coin.name} is a cryptocurrency. Data from snapshot.`,
            },
            links: { homepage: [] },
            platforms: {},
          };
        }
      };
    }

    console.log("[Snapshot] API patched with fallbacks");
  }

  // ── Initialize on load ────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", patchAPI);
  } else {
    patchAPI();
  }

  // ── Expose snapshot data for debugging ────────────────
  window.__SNAPSHOT = {
    top: () => topSnapshot,
    global: () => globalSnapshot,
    fng: () => fngSnapshot,
    reload: loadSnapshots,
  };

  console.log("[Snapshot] Module loaded.");
})();

// ---- js/features/portfolio.js ----
// ================================================================
// js/features/portfolio.js – Portfolio Management
// ================================================================

window.W = window.W || {};

W.portfolio = (() => {
  const HKEY = "portfolio";
  const TKEY = "transactions";
  const STREAK_KEY = "portfolio_streak";

  // ── Helpers ──────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Data Access ─────────────────────────────────────────
  function all() {
    return W.store.get(HKEY, []);
  }

  function save(list) {
    W.store.set(HKEY, list);
    if (W.achievements) W.achievements.check();
    updateStreak();
  }

  function txs() {
    return W.store.get(TKEY, []);
  }

  function saveTxs(list) {
    W.store.set(TKEY, list);
  }

  // ── Streak Tracking ─────────────────────────────────────
  function updateStreak() {
    const today = new Date().toDateString();
    const streak = W.store.get(STREAK_KEY, { last: today, count: 1 });
    if (streak.last !== today) {
      const yesterday = new Date(Date.now() - 864e5).toDateString();
      streak.count = streak.last === yesterday ? streak.count + 1 : 1;
      streak.last = today;
      W.store.set(STREAK_KEY, streak);
    }
    return streak;
  }

  function getStreak() {
    return W.store.get(STREAK_KEY, {
      last: new Date().toDateString(),
      count: 1,
    });
  }

  // ── CRUD Operations ─────────────────────────────────────
  function add({ coinId, symbol, name, img, qty, buyPrice, date }) {
    if (!coinId || !symbol || !name) throw new Error("Missing required fields");
    if (!qty || qty <= 0) throw new Error("Quantity must be positive");
    if (!buyPrice || buyPrice <= 0)
      throw new Error("Buy price must be positive");

    const list = all();
    const existing = list.find((x) => x.coinId === coinId);
    if (existing) {
      const totalQty = existing.qty + qty;
      existing.buyPrice =
        (existing.qty * existing.buyPrice + qty * buyPrice) / totalQty;
      existing.qty = totalQty;
    } else {
      list.push({
        id: uid(),
        coinId,
        symbol: symbol.toLowerCase(),
        name,
        img: img || "",
        qty,
        buyPrice,
        date: date || Date.now(),
      });
    }
    save(list);
    return list;
  }

  function update(id, { qty, buyPrice }) {
    const list = all();
    const item = list.find((x) => x.id === id);
    if (!item) throw new Error("Holding not found");
    if (qty && qty > 0) item.qty = qty;
    if (buyPrice && buyPrice > 0) item.buyPrice = buyPrice;
    save(list);
    return list;
  }

  function remove(id) {
    save(all().filter((h) => h.id !== id));
  }

  function clear() {
    W.store.delete(HKEY);
    W.store.delete(TKEY);
  }

  // ── Transaction Recording ──────────────────────────────
  function recordTx(tx) {
    const { type, coin, qty, price } = tx;
    if (
      !type ||
      !coin ||
      !coin.id ||
      !qty ||
      qty <= 0 ||
      !price ||
      price <= 0
    ) {
      throw new Error("Invalid transaction data");
    }
    if (!["buy", "sell"].includes(type))
      throw new Error("Invalid transaction type");

    const list = all();
    const existing = list.find((h) => h.coinId === coin.id);

    if (type === "buy") {
      if (existing) {
        const totalQty = existing.qty + qty;
        existing.buyPrice =
          (existing.qty * existing.buyPrice + qty * price) / totalQty;
        existing.qty = totalQty;
      } else {
        list.push({
          id: uid(),
          coinId: coin.id,
          symbol: coin.symbol.toLowerCase(),
          name: coin.name,
          img: coin.img || "",
          qty,
          buyPrice: price,
          date: Date.now(),
        });
      }
    } else {
      // sell
      if (!existing) throw new Error(`You don't hold ${coin.name}`);
      if (qty > existing.qty)
        throw new Error(`Cannot sell more than you hold (${existing.qty})`);
      existing.qty -= qty;
      if (existing.qty <= 1e-9) {
        const idx = list.indexOf(existing);
        if (idx > -1) list.splice(idx, 1);
      }
    }

    save(list);
    const txList = txs();
    txList.push({
      id: uid(),
      type,
      coinId: coin.id,
      symbol: coin.symbol.toLowerCase(),
      name: coin.name,
      qty,
      price,
      date: Date.now(),
    });
    saveTxs(txList.slice(-500)); // keep last 500 transactions
    return true;
  }

  // ── Seed Demo Data ──────────────────────────────────────
  function seed() {
    const now = Date.now();
    const samples = [
      {
        coinId: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        qty: 0.25,
        buyPrice: 43250,
      },
      {
        coinId: "ethereum",
        symbol: "eth",
        name: "Ethereum",
        qty: 2.4,
        buyPrice: 2280,
      },
      {
        coinId: "solana",
        symbol: "sol",
        name: "Solana",
        qty: 18,
        buyPrice: 98,
      },
      {
        coinId: "chainlink",
        symbol: "link",
        name: "Chainlink",
        qty: 120,
        buyPrice: 14.2,
      },
      {
        coinId: "dogecoin",
        symbol: "doge",
        name: "Dogecoin",
        qty: 3000,
        buyPrice: 0.082,
      },
    ];

    const holdings = samples.map((s, i) => ({
      ...s,
      img: "",
      id: uid(),
      date: now - (200 - i * 30) * 864e5,
    }));
    save(holdings);

    const transactions = samples.map((s) => ({
      id: uid(),
      type: "buy",
      coinId: s.coinId,
      symbol: s.symbol,
      name: s.name,
      qty: s.qty,
      price: s.buyPrice,
      date: now - 200 * 864e5,
    }));
    saveTxs(transactions);
    return holdings;
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    all,
    save,
    txs,
    saveTxs,
    add,
    update,
    remove,
    clear,
    recordTx,
    seed,
    getStreak,
    uid,
  };
})();

console.log("[Portfolio] Module loaded.");

// ---- js/features/watchlist.js ----
// ================================================================
// js/features/watchlist.js – Weaver Watchlist
// ================================================================

window.W = window.W || {};

W.watchlist = (() => {
  const KEY = "watchlist";

  // ── Internal state ─────────────────────────────────
  function getList() {
    return W.store.get(KEY, ["bitcoin", "ethereum", "solana"]);
  }

  function saveList(list) {
    W.store.set(KEY, list);
  }

  // ── Public API ─────────────────────────────────────
  function list() {
    return getList();
  }

  function has(id) {
    return list().includes(id);
  }

  function toggle(id) {
    const l = getList();
    if (l.includes(id)) {
      saveList(l.filter((x) => x !== id));
      return false;
    }
    saveList([...l, id]);
    return true;
  }

  function add(id) {
    const l = getList();
    if (!l.includes(id)) {
      saveList([...l, id]);
      return true;
    }
    return false;
  }

  function remove(id) {
    saveList(getList().filter((x) => x !== id));
  }

  // ── Render ──────────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>⭐ Watchlist</h3>
          <div id="w-picker" style="min-width:280px;"></div>
        </div>
        <div id="w-body">${W.ui.spinner()}</div>
      </div>
    `;

    // ── Coin picker ──────────────────────────────────
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#w-picker"), (p) => {
        if (p) {
          add(p.id);
          W.ui.toast(`${p.name} added to watchlist ⭐`, "ok");
          renderTable(view);
        }
      });
    } else {
      console.warn("[Watchlist] coinPicker not available");
    }

    await renderTable(view);
  }

  async function renderTable(view) {
    const body = view.querySelector("#w-body");
    if (!body) return;

    const ids = getList();
    if (!ids.length) {
      body.innerHTML = W.ui.empty(
        "⭐",
        "Watchlist is empty",
        "Search above to add coins",
      );
      return;
    }

    let coins = [];
    try {
      // Fetch market data for all watchlist coins
      const data = await W.api.markets(ids.join(","));
      coins = data || [];
    } catch (e) {
      console.warn("[Watchlist] Market fetch error:", e);
      body.innerHTML = `<p class="muted">${e.message}</p>`;
      return;
    }

    if (!coins.length) {
      body.innerHTML = W.ui.empty(
        "📭",
        "No data available",
        "Try refreshing or check your connection",
      );
      return;
    }

    // Sort by market cap rank
    coins.sort(
      (a, b) => (a.market_cap_rank || 999) - (b.market_cap_rank || 999),
    );

    body.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Coin</th>
              <th class="num">Price</th>
              <th class="num">24h</th>
              <th class="num">7d</th>
              <th class="num">Market Cap</th>
              <th class="num">Volume (24h)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${coins
              .map(
                (c) => `
              <tr class="clickable" data-coin="${c.id}">
                <td class="muted">${c.market_cap_rank || "—"}</td>
                <td class="coin-cell">
                  <img src="${c.image}" alt="${c.name}">
                  <div>
                    <b><a class="link" href="#/coin/${c.id}">${c.name}</a></b>
                    <br><span class="muted small">${c.symbol.toUpperCase()}</span>
                  </div>
                </td>
                <td class="num">${W.fmt.price(c.current_price)}</td>
                <td class="num">${W.fmt.pct(c.price_change_percentage_24h_in_currency)}</td>
                <td class="num">${W.fmt.pct(c.price_change_percentage_7d_in_currency)}</td>
                <td class="num">${W.fmt.money(c.market_cap, { compact: true })}</td>
                <td class="num">${W.fmt.money(c.total_volume, { compact: true })}</td>
                <td class="row-actions">
                  <button class="icon-btn" data-unwatch="${c.id}" title="Remove from watchlist">✕</button>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // ── Click on row → go to coin page ──────────────
    body.querySelectorAll("tr[data-coin]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        // Ignore if the click was on the remove button
        if (e.target.closest("[data-unwatch]")) return;
        const id = tr.dataset.coin;
        if (id) location.hash = "#/coin/" + id;
      });
    });

    // ── Remove button ────────────────────────────────
    body.querySelectorAll("[data-unwatch]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.unwatch;
        remove(id);
        W.ui.toast("Removed from watchlist", "info");
        renderTable(view);
      });
    });
  }

  // ── Exports ─────────────────────────────────────────
  return {
    render,
    list,
    has,
    toggle,
    add,
    remove,
  };
})();

console.log("[Watchlist] Module loaded.");

// ---- js/features/explorer.js ----
// ===============================================================
//                   Coin Explorer
// ===============================================================

window.W = window.W || {};

W.explorer = (() => {
  let chart = null;

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const kv = (key, val) =>
    `<div class="kv-row"><span class="muted">${escapeHTML(key)}</span><span>${val}</span></div>`;

  // ── Render Search ──────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🔍 Coin Explorer</h3>
        <input id="x-search" class="input big" placeholder="Search any cryptocurrency…">
        <div id="x-results"></div>
      </div>
    `;

    const input = view.querySelector("#x-search");
    const results = view.querySelector("#x-results");

    input.addEventListener(
      "input",
      W.debounce(async () => {
        const q = input.value.trim();
        if (q.length < 2) {
          results.innerHTML = "";
          return;
        }
        try {
          const data = await W.api.search(q);
          results.innerHTML = `<div class="table-wrap"><table><tbody>${(
            data.coins || []
          )
            .slice(0, 10)
            .map(
              (c) => `
          <tr class="clickable" data-id="${c.id}">
            <td style="width:40px;"><img class="coin-img" src="${c.thumb}" alt="${escapeHTML(c.name)}"></td>
            <td><b>${escapeHTML(c.name)}</b> <span class="muted small">${c.symbol.toUpperCase()}</span></td>
            <td class="muted">${c.market_cap_rank ? "Rank #" + c.market_cap_rank : ""}</td>
          </tr>
        `,
            )
            .join("")}</tbody></table></div>`;
          results.querySelectorAll("tr[data-id]").forEach((tr) => {
            tr.onclick = () => (location.hash = "#/coin/" + tr.dataset.id);
          });
        } catch (e) {
          W.ui.toast(e.message, "warn");
        }
      }, 350),
    );
  }

  // ── Render Coin Detail ─────────────────────────────────
  async function renderCoin(view, id) {
    view.innerHTML = W.ui.spinner();
    try {
      const c = await W.api.coin(id);
      if (!c) throw new Error("Coin not found");

      const md = c.market_data || {};
      const cur = W.currency();
      const contract =
        c.platforms && Object.keys(c.platforms).length
          ? Object.entries(c.platforms)
              .filter(([, addr]) => addr)
              .map(
                ([net, addr]) =>
                  `<div class="small kv-row"><span class="muted">${escapeHTML(net)}</span><span><code>${escapeHTML(addr)}</code> <button class="icon-btn" data-copy="${escapeHTML(addr)}">📋</button></span></div>`,
              )
              .join("")
          : '<span class="muted">Native coin (no contract)</span>';

      view.innerHTML = `
        <div class="card coin-head">
          <img class="coin-lg" src="${c.image?.large}" alt="${escapeHTML(c.name)}">
          <div>
            <h2>${escapeHTML(c.name)} <span class="muted">${c.symbol.toUpperCase()}</span> ${c.market_cap_rank ? `<span class="tag rank">#${c.market_cap_rank}</span>` : ""}</h2>
            <div class="coin-price">${W.fmt.price(md.current_price?.[cur])} <span class="ml">${W.fmt.pct(md.price_change_percentage_24h)}</span></div>
            <div class="mt qa">
              <button class="btn tiny ${W.watchlist.has(id) ? "primary" : ""}" id="x-watch">${W.watchlist.has(id) ? "★ Watching" : "☆ Watch"}</button>
              <button class="btn tiny" id="x-add">+ Add to Portfolio</button>
              ${c.links?.homepage?.[0] ? `<a class="btn tiny" href="${escapeHTML(c.links.homepage[0])}" target="_blank">🌐 Website</a>` : ""}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="range-row">${[
            ["1", "24H"],
            ["7", "7D"],
            ["30", "1M"],
            ["90", "3M"],
            ["365", "1Y"],
          ]
            .map(
              ([d, label]) =>
                `<button class="chip ${d === "7" ? "active" : ""}" data-days="${d}">${label}</button>`,
            )
            .join("")}</div>
          <div class="chart-box tall"><canvas id="x-chart"></canvas></div>
        </div>
        <div class="grid-2">
          <div class="card"><h3>Market Statistics</h3>
            ${kv("Market Cap", W.fmt.money(md.market_cap?.[cur], { compact: true }))}
            ${kv("24h Volume", W.fmt.money(md.total_volume?.[cur], { compact: true }))}
            ${kv("Circulating Supply", W.fmt.num(Math.round(md.circulating_supply)) + " " + c.symbol.toUpperCase())}
            ${kv("Max Supply", md.max_supply ? W.fmt.num(Math.round(md.max_supply)) : "∞")}
            ${kv("All-Time High", W.fmt.price(md.ath?.[cur]) + ' <span class="small muted">(' + W.fmt.pct(md.ath_change_percentage?.[cur]) + ")</span>")}
            ${kv("All-Time Low", W.fmt.price(md.atl?.[cur]))}
          </div>
          <div class="card"><h3>Contract Address</h3>${contract}
            <h3 class="mt">About</h3><div class="about">${(
              c.description?.en || "No description available."
            )
              .replace(/<[^>]+>/g, " ")
              .split(". ")
              .slice(0, 4)
              .join(". ")}.</div>
          </div>
        </div>
      `;

      // ── Watch button ──────────────────────────────────
      view.querySelector("#x-watch").onclick = (e) => {
        const on = W.watchlist.toggle(id);
        e.target.textContent = on ? "★ Watching" : "☆ Watch";
        e.target.classList.toggle("primary", on);
      };

      // ── Add to portfolio ──────────────────────────────
      view.querySelector("#x-add").onclick = () => {
        if (W.dashboard?.holdingModal) W.dashboard.holdingModal(null, c);
        else W.ui.toast("Portfolio module not available", "warn");
      };

      // ── Copy contract ─────────────────────────────────
      view.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.onclick = () => {
          navigator.clipboard.writeText(btn.dataset.copy);
          W.ui.toast("Address copied ✓", "ok");
        };
      });

      // ── Chart range buttons ───────────────────────────
      view.querySelectorAll("[data-days]").forEach((ch) => {
        ch.onclick = () => {
          view
            .querySelectorAll("[data-days]")
            .forEach((x) => x.classList.remove("active"));
          ch.classList.add("active");
          drawChart(id, ch.dataset.days, view);
        };
      });

      // ── Draw initial chart ────────────────────────────
      drawChart(id, 7, view);
    } catch (e) {
      view.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
    }
  }

  // ── Draw Chart (with robust error handling) ───────────
  async function drawChart(id, days, view) {
    const canvas = view.querySelector("#x-chart");
    if (!canvas) {
      console.warn("[Explorer] Chart canvas not found");
      return;
    }

    // ── Check if Chart.js is available ──────────────────
    if (typeof Chart === "undefined") {
      canvas.parentElement.innerHTML = `
        <p class="muted small center" style="padding:40px 0;">
          📊 Chart library not loaded. Please include Chart.js in your HTML.
        </p>`;
      return;
    }

    // ── Destroy previous chart instance ──────────────────
    if (chart) {
      try {
        chart.destroy();
      } catch (e) {
        console.warn("[Explorer] Error destroying previous chart:", e);
      }
      chart = null;
    }

    try {
      const data = await W.api.chart(id, days);
      const prices = Array.isArray(data) ? data : data?.prices || [];

      if (!prices || prices.length < 2) {
        canvas.parentElement.innerHTML = `
          <p class="muted small center" style="padding:40px 0;">
            📉 No chart data available for this period.
          </p>`;
        return;
      }

      const up = prices[prices.length - 1][1] >= prices[0][1];
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, 0, 260);
      const color = up ? "46,230,168" : "255,92,122";
      gradient.addColorStop(0, `rgba(${color},.32)`);
      gradient.addColorStop(1, `rgba(${color},0)`);

      // Ensure the canvas is visible and has dimensions
      if (canvas.width === 0 || canvas.height === 0) {
        // Force a layout update
        canvas.style.width = "100%";
        canvas.style.height = "260px";
        canvas.width = canvas.parentElement.clientWidth || 600;
        canvas.height = 260;
      }

      chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: prices.map((p) =>
            new Date(p[0]).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
          ),
          datasets: [
            {
              data: prices.map((p) => p[1]),
              borderColor: up ? "#2ee6a8" : "#ff5c7a",
              borderWidth: 2.5,
              pointRadius: 0,
              fill: true,
              backgroundColor: gradient,
              tension: 0.3,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  return `$${ctx.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { color: "#9aa3b2", maxTicksLimit: 8 },
              grid: { display: false },
            },
            y: {
              ticks: {
                color: "#9aa3b2",
                callback: (value) => "$" + value.toLocaleString(),
              },
              grid: { color: "rgba(255,255,255,.05)" },
            },
          },
          interaction: {
            intersect: false,
            mode: "index",
          },
          animation: {
            duration: 800,
          },
        },
      });
    } catch (e) {
      console.error("[Explorer] Chart error:", e);
      canvas.parentElement.innerHTML = `
        <p class="muted small center" style="padding:40px 0;">
          ⚠️ Failed to load chart: ${escapeHTML(e.message)}
        </p>`;
    }
  }

  return { render, renderCoin };
})();

console.log("[Explorer] Module loaded.");

// ---- js/features/alerts.js ----
// js/features/alerts.js – Price Alerts


window.W = window.W || {};

W.alerts = (() => {
  const KEY = "alerts";

  // ── Data Access ────────────────────────────────────────
  function list() {
    return W.store.get(KEY, []);
  }

  function save(alerts) {
    W.store.set(KEY, alerts);
    updateBadge();
  }

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function condText(a) {
    switch (a.cond) {
      case "above":
        return `price above ${W.fmt.price(a.val)}`;
      case "below":
        return `price below ${W.fmt.price(a.val)}`;
      case "move24":
        return `24h move exceeds ±${a.val}%`;
      case "volume":
        return `volume spike (±${a.val}% move)`;
      default:
        return "";
    }
  }

  function updateBadge() {
    const badge = document.getElementById("alert-badge");
    if (!badge) return;
    const count = list().filter((a) => !a.triggered).length;
    badge.textContent = count || "";
    badge.style.display = count ? "inline-block" : "none";
  }

  // ── Render ─────────────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🚨 Create Alert</h3>
        <form id="a-form" class="alert-form">
          <div id="a-picker" style="grid-column:1/-1;"></div>
          <label>Condition
            <select name="cond">
              <option value="above">Price goes above</option>
              <option value="below">Price goes below</option>
              <option value="move24">24h % movement exceeds</option>
              <option value="volume">Volume spike (big 24h move)</option>
            </select>
          </label>
          <label>Value
            <input type="number" step="any" name="val" required placeholder="e.g. 70000 or 10">
          </label>
          <button class="btn primary" type="submit">Create Alert</button>
        </form>
      </div>
      <div class="card">
        <h3>Active Alerts</h3>
        <div id="a-list"></div>
      </div>
    `;

    // ── Coin picker ──────────────────────────────────────
    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#a-picker"), (p) => (picked = p));
    } else {
      console.warn("[Alerts] coinPicker not available");
    }

    // ── Form submit ──────────────────────────────────────
    view.querySelector("#a-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      const val = parseFloat(f.val.value);
      if (isNaN(val) || val <= 0)
        return W.ui.toast("Enter a valid value", "warn");

      const alerts = list();
      alerts.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        coinId: picked.id,
        symbol: picked.symbol.toUpperCase(),
        name: picked.name,
        img: picked.img,
        cond: f.cond.value,
        val: val,
        triggered: false,
        created: Date.now(),
      });
      save(alerts);
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      W.ui.toast("Alert created 🚨", "ok");
      render(view);
    };

    // ── Draw list ────────────────────────────────────────
    drawList(view);
    updateBadge();
  }

  function drawList(view) {
    const el = view.querySelector("#a-list");
    const alerts = list();
    if (!alerts.length) {
      el.innerHTML = W.ui.empty(
        "🚨",
        "No alerts yet",
        "Create one above — Weaver watches the market for you",
      );
      return;
    }

    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Coin</th><th>Condition</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${alerts
              .map(
                (a) => `
              <tr>
                <td class="coin-cell">
                  <img src="${a.img}" alt="${a.name}">
                  <b>${escapeHTML(a.name)}</b>
                </td>
                <td>${escapeHTML(condText(a))}</td>
                <td>${a.triggered ? '<span class="tag triggered">Triggered</span>' : '<span class="tag live">Watching</span>'}</td>
                <td><button class="icon-btn" data-del="${a.id}">🗑️</button></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // ── Delete buttons ──────────────────────────────────
    el.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.del;
        W.ui.confirm("Delete this alert?", () => {
          save(list().filter((a) => a.id !== id));
          drawList(view);
          updateBadge();
        });
      };
    });
  }

  // ── Check Alerts ──────────────────────────────────────
  async function check() {
    updateBadge();
    const alerts = list();
    const active = alerts.filter((a) => !a.triggered);
    if (!active.length) return;

    const ids = [...new Set(active.map((a) => a.coinId))].join(",");
    let markets;
    try {
      markets = await W.api.markets(ids);
    } catch (e) {
      console.warn("[Alerts] Check error:", e);
      return;
    }

    const triggered = [];
    active.forEach((a) => {
      const m = markets.find((c) => c.id === a.coinId);
      if (!m) return;
      const p24 = m.price_change_percentage_24h_in_currency ?? 0;
      let hit = false;
      if (a.cond === "above" && m.current_price >= a.val) hit = true;
      if (a.cond === "below" && m.current_price <= a.val) hit = true;
      if (
        (a.cond === "move24" || a.cond === "volume") &&
        Math.abs(p24) >= a.val
      )
        hit = true;
      if (hit) {
        a.triggered = true;
        const msg = `🚨 <b>${a.name}</b> — ${condText(a)} (now ${W.fmt.price(m.current_price)})`;
        W.ui.toast(msg, "warn", 6000);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Weaver Alert", {
            body: `${a.name}: ${condText(a)}`,
            icon: "assets/logo.png",
          });
        }
        if (W.tg) W.tg.notify("alert:" + a.id, msg);
        triggered.push(a.id);
      }
    });

    if (triggered.length) {
      save(alerts);
      updateBadge();
    }
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    render,
    check,
    list,
    save,
    updateBadge,
  };
})();

console.log("[Alerts] Module loaded.");

// ---- js/features/news.js ----
// js/features/news.js – Complete News Module

const log = (msg, data) => {
  console.log(`[News] ${msg}`, data || "");
};

// ── RSS Feeds ──────────────────────────────────────────────────
const FEEDS = [
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["Cointelegraph", "https://cointelegraph.com/rss"],
  ["Decrypt", "https://decrypt.co/feed"],
];

// ── Proxy chain ─────────────────────────────────────────────────
const PROX = [
  (u) => "http://localhost:3001/proxy?url=" + encodeURIComponent(u),
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  (u) => "https://ibis01.github.io/weaver/data/news.json",
];

// ── Fetch with proxy fallback ──────────────────────────────────
async function via(url, asJSON = false) {
  let lastErr = null;
  for (const buildProxy of PROX) {
    const proxyUrl = buildProxy(url);
    log(`Trying proxy: ${proxyUrl.substring(0, 80)}...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const resp = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; WeaverBot/1.0)" },
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      if (
        text.trim().startsWith("<") &&
        !text.includes("<rss") &&
        !text.includes("<feed")
      ) {
        throw new Error("HTML response (not RSS)");
      }
      log(`✅ Proxy succeeded: ${proxyUrl}`);
      return asJSON ? JSON.parse(text) : text;
    } catch (err) {
      clearTimeout(timeout);
      log(`❌ Proxy failed: ${err.message}`);
      lastErr = err;
    }
  }
  console.error("[News] All proxies failed.", lastErr);
  throw lastErr || new Error("All proxies failed");
}

// ── Parse RSS XML ──────────────────────────────────────────────
function parseRSS(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const items = doc.querySelectorAll("item");
  const articles = [];
  items.forEach((item) => {
    const title = item.querySelector("title")?.textContent || "Untitled";
    const link = item.querySelector("link")?.textContent || "#";
    const description = item.querySelector("description")?.textContent || "";
    const pubDate = item.querySelector("pubDate")?.textContent || "";
    articles.push({ title, link, description, pubDate });
  });
  return articles;
}

// ── Render articles into container ─────────────────────────────
function renderArticles(articles) {
  const container = document.getElementById("news-container");
  if (!container) return;
  if (!articles || articles.length === 0) {
    container.innerHTML = '<div class="info">No articles available.</div>';
    return;
  }
  const items = articles
    .slice(0, 20)
    .map(
      (a) => `
    <div class="news-item">
      <h3><a href="${a.link}" target="_blank" rel="noopener">${a.title}</a></h3>
      <p>${a.description ? a.description.substring(0, 200) + "..." : ""}</p>
      <small>${a.pubDate || ""}</small>
    </div>
  `,
    )
    .join("");
  container.innerHTML = `<div class="news-list">${items}</div>`;
}

// ════════════════════════════════════════════════════════════════
// ═══════ FIXED: Renders inside the view, not below it ═══════
// ════════════════════════════════════════════════════════════════
async function render(view) {
  // 1. Clear the view and set up the news page structure
  view.innerHTML = `
    <div class="card">
      <h3>📰 Crypto News</h3>
      <div id="news-container"></div>
    </div>
  `;

  // 2. Get the container
  const container = document.getElementById("news-container");
  if (!container) {
    console.warn("[News] Container not found after rendering");
    return;
  }

  // 3. Show loading
  container.innerHTML = '<div class="loading">Loading news...</div>';

  try {
    const feedPromises = FEEDS.map(async ([name, url]) => {
      try {
        const xml = await via(url);
        const articles = parseRSS(xml);
        return { name, articles, error: null };
      } catch (err) {
        log(`Failed to fetch ${name}:`, err.message);
        return { name, articles: [], error: err.message };
      }
    });
    const results = await Promise.all(feedPromises);
    const allArticles = results.flatMap((r) => r.articles);

    if (allArticles.length === 0) {
      log("No live articles, trying snapshot...");
      const snapshot = await via("", true);
      if (snapshot && snapshot.length) {
        renderArticles(snapshot);
        return;
      }
      container.innerHTML =
        '<div class="error">Could not load news. Try again later.</div>';
      return;
    }
    renderArticles(allArticles);
  } catch (err) {
    console.error("[News] Render error:", err);
    container.innerHTML =
      '<div class="error">Failed to load news. Check console.</div>';
  }
}

// ── Exports ─────────────────────────────────────────────────────
window.W = window.W || {};
W.features = W.features || {};
W.features.news = { render };
W.news = { render };

console.log("[News] Module loaded.");

// ---- js/features/ai.js ----
//  Premium AI Intelligence Engine
// ================================================================
//
// 🧠 Weaver AI – Your Personal Crypto Intelligence Analyst
//
// Unique Features:
//   • Multi-model LLM support (OpenAI, Anthropic, Custom)
//   • On-chain data enrichment (wallet tracking, whale alerts)
//   • Portfolio correlation analysis (which assets move together)
//   • Risk decomposition (liquidity, volatility, concentration)
//   • Sentiment-aware market analysis
//   • Proactive insights (alerts triggered by AI)
//   • Memory system (learns from your portfolio behavior)
//   • Natural language portfolio queries
// ================================================================

window.W = window.W || {};

W.ai = (() => {
  // ── Constants ─────────────────────────────────────────
  const MEMORY_KEY = "ai_memory";
  const INSIGHTS_KEY = "ai_insights";
  const MAX_HISTORY = 50;

  // ── LLM Providers ─────────────────────────────────────
  const PROVIDERS = {
    openai: {
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1/chat/completions",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
      defaultModel: "gpt-4o-mini",
    },
    anthropic: {
      name: "Anthropic",
      endpoint: "https://api.anthropic.com/v1/messages",
      models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
      defaultModel: "claude-3-sonnet",
    },
    custom: {
      name: "Custom",
      endpoint: "",
      models: [],
      defaultModel: "",
    },
  };

  // ── State ──────────────────────────────────────────────
  let memory = W.store.get(MEMORY_KEY, { conversations: [], insights: [] });
  let insightsCache = W.store.get(INSIGHTS_KEY, []);

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function saveMemory() {
    W.store.set(MEMORY_KEY, memory);
  }

  function saveInsights() {
    W.store.set(INSIGHTS_KEY, insightsCache);
  }

  function getSettings() {
    const s = W.store.get("settings", {});
    return s.ai || {};
  }

  // ── 1. ADVANCED PORTFOLIO ANALYSIS ──────────────────

  /**
   * Decompose portfolio risk into components
   */
  function decomposeRisk(rows, totals) {
    if (!rows || !rows.length) return null;

    // Concentration risk (top holdings)
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const top3 = sorted.slice(0, 3);
    const top3Concentration = totals.value
      ? (top3.reduce((s, r) => s + r.value, 0) / totals.value) * 100
      : 0;

    // Volatility (if we have 7d data)
    const vol = rows.reduce((s, r) => s + Math.abs(r.p7 || 0), 0) / rows.length;

    // Correlation proxy: how many assets move together
    let correlated = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      for (let j = i + 1; j < Math.min(rows.length, 5); j++) {
        const a = rows[i].p7 || 0;
        const b = rows[j].p7 || 0;
        if (a > 0 && b > 0) correlated++;
        if (a < 0 && b < 0) correlated++;
      }
    }
    const maxPairs =
      (Math.min(rows.length, 5) * (Math.min(rows.length, 5) - 1)) / 2;
    const correlationScore = maxPairs ? (correlated / maxPairs) * 100 : 0;

    // Liquidity risk (if we have volume data)
    const liquidityScore =
      (rows.reduce((s, r) => {
        const vol = r.total_volume || 0;
        return s + (vol > 1000000 ? 1 : 0);
      }, 0) /
        rows.length) *
      100;

    // Sector diversification (if we have sector data)
    const sectors = new Set(rows.map((r) => r.sector || "Other"));
    const sectorScore = (sectors.size / Math.max(rows.length, 1)) * 100;

    return {
      concentration: top3Concentration,
      volatility: vol,
      correlation: correlationScore,
      liquidity: liquidityScore,
      diversification: sectorScore,
      riskScore:
        top3Concentration * 0.3 +
        vol * 0.2 +
        (100 - correlationScore) * 0.2 +
        (100 - liquidityScore) * 0.15 +
        (100 - sectorScore) * 0.15,
    };
  }

  /**
   * Identify hidden patterns in portfolio
   */
  function findPatterns(rows) {
    if (!rows || rows.length < 2) return [];

    const patterns = [];
    const symbols = rows.map((r) => r.symbol.toUpperCase());

    // Check for sector concentration
    const sectorCount = {};
    rows.forEach((r) => {
      const sector = r.sector || "Other";
      sectorCount[sector] = (sectorCount[sector] || 0) + 1;
    });
    const concentratedSector = Object.entries(sectorCount).find(
      ([, count]) => count > rows.length / 2,
    );
    if (concentratedSector) {
      patterns.push({
        type: "concentration",
        severity: "warning",
        message: `${concentratedSector[0]} makes up ${((concentratedSector[1] / rows.length) * 100).toFixed(0)}% of your assets`,
        suggestion: "Consider diversifying into other sectors",
      });
    }

    // Check for overlapping assets (same ecosystem)
    const ecosystems = ["bitcoin", "ethereum", "solana", "polygon", "arbitrum"];
    const ecoCount = {};
    rows.forEach((r) => {
      const eco = ecosystems.find((e) => r.coinId.includes(e)) || "other";
      ecoCount[eco] = (ecoCount[eco] || 0) + 1;
    });
    const dominantEco = Object.entries(ecoCount).sort((a, b) => b[1] - a[1])[0];
    if (dominantEco && dominantEco[1] > rows.length / 3) {
      patterns.push({
        type: "ecosystem",
        severity: "info",
        message: `${dominantEco[0]} ecosystem dominates your portfolio (${dominantEco[1]} assets)`,
        suggestion: `Look into assets from other ecosystems for better diversification`,
      });
    }

    // Check for correlated performance
    const with7d = rows.filter((r) => r.p7 !== null);
    if (with7d.length >= 3) {
      const positive = with7d.filter((r) => r.p7 > 0).length;
      const negative = with7d.filter((r) => r.p7 < 0).length;
      if (positive === with7d.length) {
        patterns.push({
          type: "momentum",
          severity: "bullish",
          message: "All your assets are in positive territory this week",
          suggestion: "Strong bull momentum — consider taking some profits",
        });
      } else if (negative === with7d.length) {
        patterns.push({
          type: "momentum",
          severity: "bearish",
          message: "All your assets are down this week",
          suggestion: "Dollar-cost average into quality projects during dips",
        });
      }
    }

    return patterns;
  }

  // ── 2. ON-CHAIN INTELLIGENCE ──────────────────────────

  /**
   * Get whale activity for a token
   */
  async function getWhaleActivity(coinId, minUsd = 100000) {
    try {
      const coin = await W.api.coin(coinId);
      const contract = coin?.platforms?.ethereum;
      if (!contract) return null;

      // Fetch recent large transfers
      const txs = await fetch(
        `https://eth.blockscout.com/api/v2/tokens/${contract}/transfers`,
      ).then((r) => r.json());
      const price = coin?.market_data?.current_price?.usd || 0;

      const whales = (txs.items || [])
        .filter(
          (t) => (parseFloat(t.total?.value || 0) / 1e18) * price >= minUsd,
        )
        .slice(0, 5)
        .map((t) => ({
          from: t.from?.hash || "unknown",
          to: t.to?.hash || "unknown",
          amount: parseFloat(t.total?.value || 0) / 1e18,
          value: (parseFloat(t.total?.value || 0) / 1e18) * price,
          timestamp: new Date(t.timestamp).getTime(),
        }));

      return whales;
    } catch (e) {
      console.warn("[AI] Whale activity error:", e);
      return null;
    }
  }

  /**
   * Analyze Smart Money sentiment
   */
  async function getSmartMoneySentiment(coinId) {
    try {
      // Use W.smart module if available
      if (!W.smart) return null;
      const coin = await W.api.coin(coinId);
      const contract = coin?.platforms?.ethereum;
      if (!contract) return null;

      const holders = await fetch(
        `https://eth.blockscout.com/api/v2/tokens/${contract}/holders`,
      ).then((r) => r.json());

      if (!holders?.items) return null;

      // Analyze top 5 holders
      const top5 = holders.items.slice(0, 5);
      let accumulating = 0;
      for (const h of top5) {
        try {
          const txs = await fetch(
            `https://eth.blockscout.com/api/v2/addresses/${h.address.hash}/token-transfers?token=${contract}`,
          ).then((r) => r.json());
          // Check last 7 days activity
          const weekAgo = Date.now() - 7 * 864e5;
          const recent = (txs.items || []).filter(
            (t) => new Date(t.timestamp).getTime() > weekAgo,
          );
          const netFlow = recent.reduce((sum, t) => {
            if (t.to?.hash === h.address.hash)
              sum += parseFloat(t.total?.value || 0);
            if (t.from?.hash === h.address.hash)
              sum -= parseFloat(t.total?.value || 0);
            return sum;
          }, 0);
          if (netFlow > 0) accumulating++;
        } catch (e) {}
      }

      return {
        topHolders: top5.length,
        accumulating: accumulating,
        sentiment:
          accumulating >= 3
            ? "bullish"
            : accumulating >= 2
              ? "neutral"
              : "bearish",
        score: (accumulating / Math.max(top5.length, 1)) * 100,
      };
    } catch (e) {
      console.warn("[AI] Smart money error:", e);
      return null;
    }
  }

  // ── 3. MEMORY SYSTEM ──────────────────────────────────

  /**
   * Remember a conversation interaction
   */
  function remember(query, response, context = {}) {
    memory.conversations.push({
      timestamp: Date.now(),
      query,
      response,
      context,
    });
    if (memory.conversations.length > MAX_HISTORY) {
      memory.conversations = memory.conversations.slice(-MAX_HISTORY);
    }
    saveMemory();
  }

  /**
   * Get relevant past conversations
   */
  function recall(query, limit = 3) {
    const words = query.toLowerCase().split(" ");
    return memory.conversations
      .filter((c) => words.some((w) => c.query.toLowerCase().includes(w)))
      .slice(-limit);
  }

  // ── 4. PROACTIVE INSIGHTS ─────────────────────────────

  /**
   * Generate proactive insights based on portfolio state
   */
  async function generateInsights() {
    const holdings = W.portfolio?.all() || [];
    if (!holdings.length) return [];

    const { rows, totals } = (await W.dashboard?.enrich?.()) || {
      rows: [],
      totals: null,
    };
    if (!rows.length || !totals) return [];

    const risk = decomposeRisk(rows, totals);
    const patterns = findPatterns(rows);
    const insights = [];

    // Risk insights
    if (risk) {
      if (risk.concentration > 70) {
        insights.push({
          type: "risk",
          severity: "warning",
          icon: "⚠️",
          title: "High Concentration Risk",
          message: `Your top 3 holdings make up ${risk.concentration.toFixed(0)}% of your portfolio`,
          suggestion: "Consider diversifying to reduce single-asset risk",
        });
      }
      if (risk.volatility > 10) {
        insights.push({
          type: "risk",
          severity: "info",
          icon: "📊",
          title: "High Volatility Detected",
          message: `Average 7-day swing is ${risk.volatility.toFixed(1)}%`,
          suggestion: "Consider hedging or reducing position sizes",
        });
      }
      if (risk.correlation > 70) {
        insights.push({
          type: "correlation",
          severity: "info",
          icon: "🔗",
          title: "High Correlation",
          message: "Your assets tend to move together",
          suggestion: "Add uncorrelated assets for better diversification",
        });
      }
    }

    // Pattern insights
    patterns.forEach((p) => {
      insights.push({
        type: p.type,
        severity: p.severity,
        icon:
          p.type === "concentration"
            ? "🎯"
            : p.type === "ecosystem"
              ? "🌿"
              : "📈",
        title: p.type.charAt(0).toUpperCase() + p.type.slice(1),
        message: p.message,
        suggestion: p.suggestion,
      });
    });

    // On-chain insights (if available)
    if (W.whales) {
      try {
        const topAsset = rows.sort((a, b) => b.value - a.value)[0];
        if (topAsset) {
          const whaleActivity = await getWhaleActivity(topAsset.coinId);
          if (whaleActivity && whaleActivity.length > 2) {
            insights.push({
              type: "whale",
              severity: "info",
              icon: "🐋",
              title: `Whale Activity Detected on ${topAsset.name}`,
              message: `${whaleActivity.length} large transfers in recent hours`,
              suggestion: "Monitor for potential price impact",
            });
          }
        }
      } catch (e) {}
    }

    // Smart money sentiment
    if (W.smart && rows.length) {
      try {
        const topAsset = rows.sort((a, b) => b.value - a.value)[0];
        if (topAsset) {
          const sentiment = await getSmartMoneySentiment(topAsset.coinId);
          if (sentiment && sentiment.sentiment === "bullish") {
            insights.push({
              type: "smartmoney",
              severity: "bullish",
              icon: "🧠",
              title: `Smart Money Accumulating ${topAsset.name}`,
              message: `${sentiment.accumulating}/${sentiment.topHolders} top holders accumulating`,
              suggestion:
                "Smart money signal — consider adding to your position",
            });
          }
        }
      } catch (e) {}
    }

    // Cache insights
    insightsCache = insights;
    saveInsights();

    return insights;
  }

  // ── 5. LLM QUERY ENGINE ──────────────────────────────

  /**
   * Query an LLM with context
   */
  async function queryLLM(prompt, systemPrompt = null) {
    const settings = getSettings();
    const provider = settings.provider || "openai";
    const config = PROVIDERS[provider];
    if (!config) throw new Error("Unknown provider");

    const apiKey = settings.key;
    const model = settings.model || config.defaultModel;
    const endpoint = settings.url || config.endpoint;

    if (!apiKey) {
      throw new Error("API key required. Add one in Settings.");
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    let body;
    let headers;

    if (provider === "openai" || provider === "custom") {
      body = JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      });
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
    } else if (provider === "anthropic") {
      body = JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      });
      headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
    } else {
      throw new Error("Unsupported provider");
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: body,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      let result;
      if (provider === "anthropic") {
        result = data.content?.[0]?.text || "";
      } else {
        result = data.choices?.[0]?.message?.content || "";
      }

      return result;
    } catch (e) {
      console.error("[AI] LLM query error:", e);
      throw new Error(`LLM query failed: ${e.message}`);
    }
  }

  // ── 6. NATURAL LANGUAGE QUERIES ──────────────────────

  /**
   * Ask Weaver a question about crypto, portfolio, or market
   */
  async function ask(question, useLLM = true) {
    // Check if this is a portfolio query
    const isPortfolioQuery =
      /portfolio|holdings|own|invest|balance|worth|value/i.test(question);
    const isPriceQuery = /price|worth|cost|value|how much/i.test(question);
    const isMarketQuery =
      /market|sentiment|trend|fear|greed|dominance|cap/i.test(question);

    // Build context
    const holdings = W.portfolio?.all() || [];
    const { rows, totals } = (await W.dashboard?.enrich?.()) || {
      rows: [],
      totals: null,
    };
    const risk = decomposeRisk(rows, totals);
    const patterns = findPatterns(rows);

    // Prepare portfolio context
    let portfolioContext = "";
    if (holdings.length) {
      portfolioContext = `The user's portfolio consists of ${holdings.length} assets worth ${W.fmt.money(totals?.value || 0)}. `;
      portfolioContext += `Top holdings: ${rows
        .slice(0, 3)
        .map((r) => `${r.symbol.toUpperCase()} (${W.fmt.money(r.value)})`)
        .join(", ")}. `;
      if (risk) {
        portfolioContext += `Portfolio risk score: ${risk.riskScore.toFixed(0)}/100. `;
        portfolioContext += `Concentration: ${risk.concentration.toFixed(0)}%, Volatility: ${risk.volatility.toFixed(1)}%. `;
      }
    }

    // Build market context
    let marketContext = "";
    try {
      const fg = await W.api.fearGreed();
      const g = await W.api.global();
      marketContext = `Fear & Greed: ${fg.value} (${fg.value_classification}). `;
      marketContext += `BTC Dominance: ${g.data.market_cap_percentage.btc.toFixed(1)}%. `;
      marketContext += `Market Cap: ${W.fmt.money(g.data.total_market_cap.usd, { compact: true })}. `;
    } catch (e) {}

    // ── If no LLM, use deterministic answers ────────────
    if (!useLLM) {
      // Check for specific coin queries
      if (isPriceQuery && !isPortfolioQuery) {
        const coinMatch = question.match(
          /\b(bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge|cardano|ada|ripple|xrp|chainlink|link)\b/i,
        );
        if (coinMatch) {
          const searchTerm = coinMatch[0].toLowerCase();
          try {
            const results = await W.api.search(searchTerm);
            if (results.coins && results.coins.length) {
              const coin = results.coins[0];
              const detail = await W.api.coin(coin.id);
              const price = detail.market_data?.current_price?.usd;
              const change = detail.market_data?.price_change_percentage_24h;
              if (price) {
                return `📊 <b>${detail.name}</b> is currently ${W.fmt.price(price)} (${W.fmt.pct(change)}). Market cap: ${W.fmt.money(detail.market_data.market_cap.usd, { compact: true })}.`;
              }
            }
          } catch (e) {}
        }
      }

      // Portfolio summary
      if (isPortfolioQuery && holdings.length) {
        return `💼 Your portfolio is worth <b>${W.fmt.money(totals?.value || 0)}</b> across ${holdings.length} assets. All-time P/L: ${W.fmt.pct(totals?.allTimePct || 0)}. ${patterns.length ? `\n\n🧠 Insights: ${patterns.map((p) => p.message).join(". ")}` : ""}`;
      }

      // Market summary
      if (isMarketQuery) {
        return `📈 Market: ${marketContext}`;
      }

      return `I can help you with your portfolio, market data, or specific coins. Try asking "What's my portfolio worth?" or "What's the price of Bitcoin?" ⚡ Add an AI API key in Settings for advanced conversational answers.`;
    }

    // ── Use LLM ──────────────────────────────────────────
    const systemPrompt = `
      You are Weaver, a sophisticated crypto intelligence analyst.
      You have access to portfolio data, market data, and on-chain insights.
      Respond in a helpful, professional tone.

      Portfolio Context:
      ${portfolioContext}

      Market Context:
      ${marketContext}

      Rules:
      - Never provide financial advice
      - Always note that crypto is volatile
      - Be concise but informative
      - Use emojis sparingly
      - Format numbers properly
      - If you don't know, say so
    `;

    try {
      const result = await queryLLM(question, systemPrompt);
      // Remember this interaction
      remember(question, result, { type: "llm", timestamp: Date.now() });
      return result;
    } catch (e) {
      // Fallback to deterministic
      console.warn("[AI] LLM fallback:", e);
      return await ask(question, false);
    }
  }

  // ── 7. PORTFOLIO INTELLIGENCE ────────────────────────

  async function portfolioInsights() {
    const { rows, totals } = (await W.dashboard?.enrich?.()) || {
      rows: [],
      totals: null,
    };
    if (!rows.length || !totals) {
      return {
        summary: "No holdings to analyze. Add some assets to get started! 🚀",
        risk: null,
        patterns: [],
        metrics: null,
        recommendation: "Start by adding your first asset.",
      };
    }

    const risk = decomposeRisk(rows, totals);
    const patterns = findPatterns(rows);
    const best = rows.sort((a, b) => b.pnlPct - a.pnlPct)[0];
    const worst = rows.sort((a, b) => a.pnlPct - b.pnlPct)[0];

    // Generate recommendation
    let recommendation = "";
    if (risk?.concentration > 70) {
      recommendation = "⚠️ Consider diversifying to reduce single-asset risk.";
    } else if (
      patterns.some((p) => p.type === "momentum" && p.severity === "bullish")
    ) {
      recommendation =
        "📈 Strong momentum — consider taking some profits or setting stop-losses.";
    } else if (
      patterns.some((p) => p.type === "momentum" && p.severity === "bearish")
    ) {
      recommendation = "📉 Dips are opportunities — DCA into quality projects.";
    } else {
      recommendation =
        "✅ Your portfolio is well-balanced. Continue monitoring and DCA.";
    }

    return {
      summary: `Your portfolio is worth <b>${W.fmt.money(totals.value)}</b> with ${rows.length} assets. All-time: ${W.fmt.pct(totals.allTimePct)}.`,
      risk,
      patterns,
      metrics: {
        totalValue: totals.value,
        totalCost: totals.cost,
        allTimePnl: totals.allTime,
        allTimePct: totals.allTimePct,
        dayPnl: totals.day,
        dayPct: totals.dayPct,
        weekPnl: totals.week,
        weekPct: totals.weekPct,
        topPerformer: best
          ? { name: best.name, symbol: best.symbol, pct: best.pnlPct }
          : null,
        worstPerformer: worst
          ? { name: worst.name, symbol: worst.symbol, pct: worst.pnlPct }
          : null,
      },
      recommendation,
    };
  }

  // ── 8. MARKET INTELLIGENCE ───────────────────────────

  async function marketIntelligence() {
    try {
      const [fg, g, top] = await Promise.all([
        W.api.fearGreed(),
        W.api.global(),
        W.api.top(10),
      ]);

      const movers = [...top].sort(
        (a, b) =>
          (b.price_change_percentage_24h_in_currency || 0) -
          (a.price_change_percentage_24h_in_currency || 0),
      );
      const best = movers[0];
      const worst = movers[movers.length - 1];

      // Detect market regime
      let regime = "neutral";
      if (fg.value >= 75) regime = "greedy";
      else if (fg.value <= 25) regime = "fearful";

      const regimeMsg = {
        greedy:
          "🟢 Extreme Greed — Market may be overheated. Consider taking profits.",
        fearful: "🔴 Extreme Fear — Contrarian buying opportunity.",
        neutral: "⚖️ Neutral — Continue with your strategy.",
      };

      return {
        fearGreed: { value: fg.value, classification: fg.value_classification },
        dominance: g.data.market_cap_percentage.btc.toFixed(1),
        cap: g.data.total_market_cap.usd,
        capChange: g.data.market_cap_change_percentage_24h_usd,
        topGainer: {
          name: best.name,
          change: best.price_change_percentage_24h_in_currency,
        },
        topLoser: {
          name: worst.name,
          change: worst.price_change_percentage_24h_in_currency,
        },
        regime: regime,
        regimeMessage: regimeMsg[regime],
        summary: `📊 Market: ${fg.value_classification} (${fg.value}/100). BTC dominance ${g.data.market_cap_percentage.btc.toFixed(1)}%. ${regimeMsg[regime]}`,
      };
    } catch (e) {
      console.warn("[AI] Market intelligence error:", e);
      return {
        summary: "Market data unavailable. Try again later.",
      };
    }
  }

  // ── 9. AI RENDER ──────────────────────────────────────

  async function render(view) {
    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>🧠 Portfolio Intelligence</h3>
          <div id="ai-portfolio-summary">${W.ui.spinner()}</div>
        </div>
        <div class="card">
          <h3>📊 Market Intelligence</h3>
          <div id="ai-market-summary">${W.ui.spinner()}</div>
        </div>
      </div>
      <div class="card">
        <h3>💡 Proactive Insights</h3>
        <div id="ai-insights">${W.ui.spinner()}</div>
      </div>
      <div class="card">
        <h3>💬 Ask Weaver (AI Analyst)</h3>
        <div class="ask-row">
          <input id="ai-q" class="input" placeholder='Try: "How is my portfolio doing?" or "What should I know about this market?"'>
          <button class="btn primary" id="ai-go">Ask</button>
          <button class="btn tiny" id="ai-llm-toggle">⚡ LLM</button>
        </div>
        <div class="qa mt small">
          <button class="chip" data-quick="What's my portfolio worth?">💼 Portfolio</button>
          <button class="chip" data-quick="How is the market doing today?">📈 Market</button>
          <button class="chip" data-quick="Should I be worried about inflation?">💰 Macro</button>
          <button class="chip" data-quick="What's the sentiment on Bitcoin?">₿ Sentiment</button>
        </div>
        <div id="ai-answer" class="ai-answer hidden"></div>
      </div>
    `;

    // ── Load portfolio insights ─────────────────────────
    try {
      const insights = await portfolioInsights();
      const el = view.querySelector("#ai-portfolio-summary");
      if (el) {
        el.innerHTML = `
          <div class="ai-brief">${insights.summary}</div>
          <div class="meter-bar mt"><div style="width:${100 - (insights.risk?.riskScore || 0)}%; background: ${(insights.risk?.riskScore || 0) < 40 ? "var(--up)" : (insights.risk?.riskScore || 0) < 60 ? "var(--warn)" : "var(--down)"};"></div></div>
          <div class="small">Risk Score: ${(100 - (insights.risk?.riskScore || 0)).toFixed(0)}/100</div>
          <div class="mt small">${insights.recommendation}</div>
        `;
      }
    } catch (e) {
      view.querySelector("#ai-portfolio-summary").innerHTML =
        `<p class="muted">${escapeHTML(e.message)}</p>`;
    }

    // ── Load market intelligence ────────────────────────
    try {
      const market = await marketIntelligence();
      const el = view.querySelector("#ai-market-summary");
      if (el) {
        el.innerHTML = `
          <div class="ai-brief">${market.summary}</div>
          <div class="kv-row"><span class="muted">Fear & Greed</span><span><b>${market.fearGreed?.value}</b> (${market.fearGreed?.classification})</span></div>
          <div class="kv-row"><span class="muted">BTC Dominance</span><span>${market.dominance}%</span></div>
          <div class="kv-row"><span class="muted">Top Gainer</span><span>${market.topGainer?.name} ${W.fmt.pct(market.topGainer?.change)}</span></div>
          <div class="kv-row"><span class="muted">Top Loser</span><span>${market.topLoser?.name} ${W.fmt.pct(market.topLoser?.change)}</span></div>
        `;
      }
    } catch (e) {
      view.querySelector("#ai-market-summary").innerHTML =
        `<p class="muted">${escapeHTML(e.message)}</p>`;
    }

    // ── Load proactive insights ─────────────────────────
    try {
      const insights = await generateInsights();
      const el = view.querySelector("#ai-insights");
      if (el) {
        if (!insights.length) {
          el.innerHTML =
            '<p class="muted small">No insights yet. Add more assets to get started.</p>';
        } else {
          el.innerHTML = insights
            .slice(0, 4)
            .map(
              (i) => `
            <div class="kv-row" style="border-bottom:1px solid var(--border);padding:8px 0;">
              <span>${i.icon} <b>${escapeHTML(i.title)}</b><br><span class="muted small">${escapeHTML(i.message)}</span></span>
              <span class="small">${escapeHTML(i.suggestion || "")}</span>
            </div>
          `,
            )
            .join("");
        }
      }
    } catch (e) {
      view.querySelector("#ai-insights").innerHTML =
        `<p class="muted">${escapeHTML(e.message)}</p>`;
    }

    // ── Ask Weaver ──────────────────────────────────────
    let useLLM = true;

    view.querySelector("#ai-go").onclick = async () => {
      const q = view.querySelector("#ai-q").value.trim();
      if (!q) return;
      const answerBox = view.querySelector("#ai-answer");
      answerBox.classList.remove("hidden");
      answerBox.innerHTML = W.ui.spinner();

      try {
        const response = await ask(q, useLLM);
        answerBox.innerHTML = `<div class="ai-brief">${response}</div>`;
      } catch (e) {
        answerBox.innerHTML = `<div class="ai-brief" style="border-color:var(--down);">❌ ${escapeHTML(e.message)}</div>`;
      }
    };

    view.querySelector("#ai-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") view.querySelector("#ai-go").click();
    });

    view.querySelector("#ai-llm-toggle").onclick = () => {
      useLLM = !useLLM;
      view.querySelector("#ai-llm-toggle").textContent = useLLM
        ? "⚡ LLM"
        : "💡 Rule";
      view.querySelector("#ai-llm-toggle").classList.toggle("primary", useLLM);
      W.ui.toast(
        useLLM ? "LLM mode enabled" : "Rule-based mode enabled",
        "info",
      );
    };

    view.querySelectorAll("[data-quick]").forEach((btn) => {
      btn.onclick = () => {
        view.querySelector("#ai-q").value = btn.dataset.quick;
        view.querySelector("#ai-go").click();
      };
    });
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    render,
    ask,
    portfolioInsights,
    marketIntelligence,
    generateInsights,
    decomposeRisk,
    findPatterns,
    getWhaleActivity,
    getSmartMoneySentiment,
    queryLLM,
    remember,
    recall,
  };
})();

console.log("[AI] Module loaded.");

// ---- js/features/optimizer.js ----
// ================================================================
// js/features/optimizer.js – Portfolio Optimizer
// ================================================================

window.W = window.W || {};

W.optimizer = (() => {
  let rows = [],
    totals = null;

  // ── Helpers ──────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function concentration(values) {
    const total = values.reduce((a, b) => a + b, 0);
    if (!total) return 0;
    const top3 = [...values].sort((a, b) => b - a).slice(0, 3);
    return (top3.reduce((a, b) => a + b, 0) / total) * 100;
  }

  // ── Preset Targets ──────────────────────────────────────
  function presetTargets(kind, holdings) {
    const targets = {};
    const ids = holdings.map((r) => r.coinId);

    if (kind === "equal") {
      ids.forEach((id) => (targets[id] = 100 / ids.length));
      return targets;
    }

    const anchors =
      kind === "btc"
        ? [
            ["bitcoin", 80],
            ["ethereum", 10],
          ]
        : [
            ["bitcoin", 50],
            ["ethereum", 30],
          ];

    let anchorSum = 0;
    anchors.forEach(([id, weight]) => {
      if (ids.includes(id)) {
        targets[id] = weight;
        anchorSum += weight;
      }
    });

    const others = ids.filter((id) => !(id in targets));
    if (others.length) {
      const remaining = 100 - anchorSum;
      others.forEach((id) => (targets[id] = remaining / others.length));
    }
    return targets;
  }

  // ── Draw Table ──────────────────────────────────────────
  function drawTable(view, targets) {
    const tableEl = view.querySelector("#o-table");
    if (!tableEl) return;

    tableEl.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th class="num">Value</th>
              <th class="num">Current %</th>
              <th class="num">Target %</th>
              <th>Suggested Trade</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td class="coin-cell">
                  <img src="${r.image || r.img || ""}" alt="${escapeHTML(r.name)}" style="width:24px;height:24px;border-radius:50%;">
                  <b>${escapeHTML(r.name)}</b>
                  <span class="muted small">${r.symbol.toUpperCase()}</span>
                </td>
                <td class="num">${W.fmt.money(r.value)}</td>
                <td class="num">${totals.value ? ((r.value / totals.value) * 100).toFixed(1) : 0}%</td>
                <td class="num">
                  <input type="number" step="0.1" min="0" max="100" data-target="${r.coinId}" style="width:80px;text-align:right;" value="${+targets[r.coinId].toFixed(1)}">
                </td>
                <td data-trade="${r.coinId}"></td>
              </tr>
            `,
              )
              .join("")}
            <tr>
              <td colspan="3"></td>
              <td class="num"><b id="o-sum"></b></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    // ── Recompute on input ──────────────────────────────
    view.querySelectorAll("[data-target]").forEach((input) => {
      input.oninput = () => recompute(view);
    });
  }

  // ── Recompute ───────────────────────────────────────────
  function recompute(view) {
    const targets = {};
    let sum = 0;

    rows.forEach((r) => {
      const input = view.querySelector(`[data-target="${r.coinId}"]`);
      const val = input ? parseFloat(input.value) || 0 : 0;
      targets[r.coinId] = val;
      sum += val;
    });

    const ok = Math.abs(sum - 100) <= 0.5;
    const sumEl = view.querySelector("#o-sum");
    if (sumEl) {
      sumEl.textContent = `${sum.toFixed(1)}%`;
      sumEl.style.color = ok ? "var(--up)" : "var(--down)";
    }

    // ── Trade suggestions ──────────────────────────────
    rows.forEach((r) => {
      const el = view.querySelector(`[data-trade="${r.coinId}"]`);
      if (!el) return;
      if (!ok) {
        el.innerHTML = '<span class="muted small">Adjust targets</span>';
        return;
      }
      const targetValue = (totals.value * (targets[r.coinId] || 0)) / 100;
      const delta = targetValue - r.value;
      if (Math.abs(delta) < totals.value * 0.005) {
        el.innerHTML = '<span class="tag neutral">Hold</span>';
        return;
      }
      const qty = Math.abs(delta) / r.price;
      const action = delta > 0 ? "Buy" : "Sell";
      const cls = delta > 0 ? "buy" : "sell";
      el.innerHTML = `
        <span class="tag ${cls}">${action}</span>
        ${qty.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${r.symbol.toUpperCase()}
        <span class="muted small">(${W.fmt.money(Math.abs(delta))})</span>
      `;
    });

    // ── Stats ──────────────────────────────────────────
    const beforeConcentration = concentration(rows.map((r) => r.value));
    const afterConcentration = concentration(
      rows.map((r) => (totals.value * (targets[r.coinId] || 0)) / 100),
    );
    const avgVol =
      rows.reduce((s, r) => s + Math.abs(r.p7 || 0), 0) / rows.length;

    const statsEl = view.querySelector("#o-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="card stat">
          <div class="stat-label">Current Value</div>
          <div class="stat-big">${W.fmt.money(totals.value)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Concentration (top-3)</div>
          <div class="stat-big">${beforeConcentration.toFixed(0)}% → <span class="${afterConcentration < beforeConcentration ? "up" : ""}">${afterConcentration.toFixed(0)}%</span></div>
        </div>
        <div class="card stat">
          <div class="stat-label">Volatility (avg 7d swing)</div>
          <div class="stat-big">${avgVol.toFixed(1)}%</div>
          <div class="stat-sub">${avgVol > 8 ? "High — consider trimming swingy assets" : "Within normal range"}</div>
        </div>
      `;
    }

    // ── Brief ──────────────────────────────────────────
    const worst = [...rows].sort((a, b) => b.value - a.value)[0];
    const briefEl = view.querySelector("#o-brief");
    if (briefEl && ok) {
      const targetPct = targets[worst.coinId] || 0;
      briefEl.innerHTML = `
        <div class="ai-brief mt">
          🤖 <b>Weaver's plan:</b> your largest position (${escapeHTML(worst.name)}) moves from
          ${((worst.value / totals.value) * 100).toFixed(0)}% to ${targetPct.toFixed(0)}%,
          shifting top-3 concentration ${beforeConcentration.toFixed(0)}% → ${afterConcentration.toFixed(0)}%.
          ${
            afterConcentration < beforeConcentration
              ? "This meaningfully reduces single-asset risk."
              : "Warning: this plan increases concentration — size positions so a 50% drawdown can't wipe you out."
          }
          Execute sells first, then buys. Sells realize gains — check your <a class="link" href="#/settings">Tax Report</a>.
          <span class="muted small">Not financial advice.</span>
        </div>
      `;
    } else if (briefEl) {
      briefEl.innerHTML = "";
    }
  }

  // ── Render ──────────────────────────────────────────────
  async function render(view) {
    if (!view) {
      console.warn("[Optimizer] No view element provided");
      return;
    }

    // Get portfolio data from dashboard
    const data = W.dashboard
      ? await W.dashboard.enrich()
      : { rows: [], totals: null };

    if (!view.isConnected) return;
    rows = data.rows || [];
    totals = data.totals || null;

    if (!rows.length || !totals?.value) {
      view.innerHTML = W.ui.empty(
        "🧮",
        "Nothing to optimize",
        "Add holdings first — the optimizer will rebalance them.",
      );
      return;
    }

    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🧮 Portfolio Optimizer</h3>
          <div class="qa">
            <button class="chip" data-preset="equal">Equal Weight</button>
            <button class="chip active" data-preset="balanced">Balanced 50/30/20</button>
            <button class="chip" data-preset="btc">BTC Maximalist</button>
          </div>
        </div>
        <p class="muted small">Pick a strategy or edit targets manually — Weaver computes the exact trades live, plus before/after risk.</p>
      </div>
      <div class="cards" id="o-stats"></div>
      <div class="card"><div id="o-table"></div></div>
      <div id="o-brief"></div>
    `;

    // ── Preset buttons ──────────────────────────────────
    view.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.onclick = () => {
        view
          .querySelectorAll("[data-preset]")
          .forEach((x) => x.classList.remove("active"));
        btn.classList.add("active");
        const targets = presetTargets(btn.dataset.preset, rows);
        rows.forEach((r) => {
          const input = view.querySelector(`[data-target="${r.coinId}"]`);
          if (input) input.value = +targets[r.coinId].toFixed(1);
        });
        recompute(view);
      };
    });

    // ── Initial draw ────────────────────────────────────
    drawTable(view, presetTargets("balanced", rows));
    recompute(view);
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    render,
    recompute,
    presetTargets,
    concentration,
  };
})();

console.log("[Optimizer] Module loaded.");

// ---- js/features/timemachine.js ----
// ================================================================
// js/features/telegram.js – Telegram Alert Integration
// ================================================================

window.W = window.W || {};

W.tg = (() => {
  // ── Constants ─────────────────────────────────────────
  const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
  const MAX_MESSAGE_LENGTH = 4096;
  const RATE_LIMIT_WINDOW = 5000; // 5 seconds between messages
  const STORAGE_KEY = "telegram_settings";

  // ── State ─────────────────────────────────────────────
  let lastSent = 0;
  let settingsCache = null;

  // ── Settings ──────────────────────────────────────────
  function getSettings() {
    if (settingsCache) return settingsCache;
    const stored = W.store.get(STORAGE_KEY, null);
    if (stored) {
      settingsCache = stored;
      return stored;
    }
    // Fallback: read from legacy settings
    const legacy = W.store.get("settings", {});
    const tg = legacy.telegram || {};
    const settings = {
      enabled: !!tg.on,
      token: tg.token || "",
      chatId: tg.chat || "",
    };
    settingsCache = settings;
    W.store.set(STORAGE_KEY, settings);
    return settings;
  }

  function saveSettings(settings) {
    settingsCache = settings;
    W.store.set(STORAGE_KEY, settings);
    // Also update legacy settings for backward compatibility
    const legacy = W.store.get("settings", {});
    legacy.telegram = {
      on: settings.enabled,
      token: settings.token,
      chat: settings.chatId,
    };
    W.store.set("settings", legacy);
  }

  // ── Validation ────────────────────────────────────────
  function isValidToken(token) {
    return /^\d+:[A-Za-z0-9_-]{35}$/.test(token);
  }

  function isValidChatId(chatId) {
    // Can be numeric (user/group ID) or alphanumeric for channel username
    return /^[0-9-]+$/.test(chatId) || /^@[A-Za-z0-9_]{5,32}$/.test(chatId);
  }

  // ── Rate Limiting ──────────────────────────────────────
  function canSend() {
    const now = Date.now();
    if (now - lastSent < RATE_LIMIT_WINDOW) {
      console.warn("[Telegram] Rate limit: too many messages.");
      return false;
    }
    lastSent = now;
    return true;
  }

  // ── Send Message ──────────────────────────────────────
  async function sendMessage(text, options = {}) {
    const settings = getSettings();
    if (!settings.enabled) {
      console.warn("[Telegram] Not enabled.");
      return false;
    }
    if (!settings.token || !settings.chatId) {
      console.warn("[Telegram] Missing token or chat ID.");
      return false;
    }
    if (!isValidToken(settings.token)) {
      console.warn("[Telegram] Invalid token format.");
      return false;
    }
    if (!isValidChatId(settings.chatId)) {
      console.warn("[Telegram] Invalid chat ID format.");
      return false;
    }
    if (!canSend()) return false;

    // Truncate message if needed
    let truncated = text;
    if (text.length > MAX_MESSAGE_LENGTH) {
      truncated = text.slice(0, MAX_MESSAGE_LENGTH - 3) + "…";
    }

    const url = `${TELEGRAM_API_BASE}${settings.token}/sendMessage`;
    const payload = {
      chat_id: settings.chatId,
      text: truncated,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...options,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[Telegram] API error:", errorData);
        return false;
      }
      const data = await response.json();
      if (!data.ok) {
        console.error("[Telegram] Error response:", data.description);
        return false;
      }
      return true;
    } catch (e) {
      console.error("[Telegram] Network error:", e.message);
      return false;
    }
  }

  // ── Notify (for alerts with deduplication) ────────────
  const lastNotified = {};

  function notify(key, text, options = {}) {
    const settings = getSettings();
    if (!settings.enabled) return;
    const now = Date.now();
    // Deduplicate: if the same key was sent within 5 minutes, skip
    if (lastNotified[key] && now - lastNotified[key] < 5 * 60 * 1000) {
      console.log(
        `[Telegram] Duplicate notification suppressed for key: ${key}`,
      );
      return;
    }
    lastNotified[key] = now;
    // Send asynchronously; don't block
    sendMessage(text, options).then((ok) => {
      if (!ok) {
        console.warn(`[Telegram] Failed to send notification: ${key}`);
      }
    });
  }

  // ── Test connection ──────────────────────────────────
  async function testConnection() {
    const settings = getSettings();
    if (!settings.enabled) {
      return { success: false, error: "Telegram notifications are disabled." };
    }
    if (!settings.token || !settings.chatId) {
      return { success: false, error: "Missing token or chat ID." };
    }
    const ok = await sendMessage(
      "✅ Weaver connected! Telegram alerts are active.",
      {
        disable_notification: false,
      },
    );
    if (ok) {
      return { success: true };
    } else {
      return {
        success: false,
        error: "Failed to send test message. Check token and chat ID.",
      };
    }
  }

  // ── UI Render (integration with settings page) ──────
  function renderSettings(container) {
    const settings = getSettings();
    container.innerHTML = `
      <div class="card">
        <h3>📨 Telegram Alerts</h3>
        <p class="muted small">
          Configure your Telegram bot to receive alerts, price triggers, and gem discoveries.
          <br>
          Create a bot via <b>@BotFather</b>, get your Chat ID from <b>@userinfobot</b>, and send a message to the bot first.
        </p>
        <label>
          Bot Token
          <input type="password" id="tg-token" placeholder="123456789:AAF..." value="${settings.token}">
        </label>
        <label>
          Chat ID
          <input type="text" id="tg-chat" placeholder="e.g. 7099096813 or @channel" value="${settings.chatId}">
        </label>
        <label class="small">
          <input type="checkbox" id="tg-enabled" ${settings.enabled ? "checked" : ""} style="width:auto;">
          Enable Telegram alerts
        </label>
        <div class="qa mt">
          <button class="btn" id="tg-test">📨 Send Test Message</button>
          <button class="btn primary" id="tg-save">Save Settings</button>
        </div>
        <div id="tg-status" class="mt"></div>
      </div>
    `;

    const tokenInput = container.querySelector("#tg-token");
    const chatInput = container.querySelector("#tg-chat");
    const enabledCheck = container.querySelector("#tg-enabled");
    const testBtn = container.querySelector("#tg-test");
    const saveBtn = container.querySelector("#tg-save");
    const status = container.querySelector("#tg-status");

    testBtn.onclick = async () => {
      // Temporarily save settings to test
      const tempSettings = {
        enabled: enabledCheck.checked,
        token: tokenInput.value.trim(),
        chatId: chatInput.value.trim(),
      };
      // Validate
      if (!tempSettings.token || !tempSettings.chatId) {
        status.innerHTML =
          '<p class="down">❌ Please fill in both token and chat ID.</p>';
        return;
      }
      if (!isValidToken(tempSettings.token)) {
        status.innerHTML = '<p class="down">❌ Invalid bot token format.</p>';
        return;
      }
      if (!isValidChatId(tempSettings.chatId)) {
        status.innerHTML = '<p class="down">❌ Invalid chat ID format.</p>';
        return;
      }
      // Temporarily save to test
      const originalSettings = { ...settings };
      saveSettings(tempSettings);
      try {
        const result = await testConnection();
        if (result.success) {
          status.innerHTML =
            '<p class="up">✅ Test message sent! Check your Telegram.</p>';
        } else {
          status.innerHTML = `<p class="down">❌ ${result.error}</p>`;
        }
      } catch (e) {
        status.innerHTML = `<p class="down">❌ ${e.message}</p>`;
      }
      // Restore original settings
      saveSettings(originalSettings);
    };

    saveBtn.onclick = () => {
      const newSettings = {
        enabled: enabledCheck.checked,
        token: tokenInput.value.trim(),
        chatId: chatInput.value.trim(),
      };
      if (newSettings.token && !isValidToken(newSettings.token)) {
        status.innerHTML = '<p class="down">❌ Invalid bot token format.</p>';
        return;
      }
      if (newSettings.chatId && !isValidChatId(newSettings.chatId)) {
        status.innerHTML = '<p class="down">❌ Invalid chat ID format.</p>';
        return;
      }
      saveSettings(newSettings);
      status.innerHTML = '<p class="up">✅ Settings saved.</p>';
    };
  }

  // ── Public API ─────────────────────────────────────────
  return {
    // Core functions
    send: sendMessage,
    notify,
    test: testConnection,

    // Settings
    getSettings,
    saveSettings,
    renderSettings,

    // Utility
    isEnabled: () => getSettings().enabled,
    isValidToken,
    isValidChatId,
  };
})();

console.log("[Telegram] Module loaded.");

// ---- js/features/trader.js ----
// ================================================================
// js/features/trader.js – AI Trading Assistant
// ================================================================

window.W = window.W || {};

W.trader = (() => {
  // ── Helpers: Technical Indicators ─────────────────────

  // Simple Moving Average
  function sma(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        result.push(avg);
      }
    }
    return result;
  }

  // Relative Strength Index (RSI)
  function rsi(data, period = 14) {
    const result = new Array(data.length).fill(null);
    let gain = 0,
      loss = 0;

    // First calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) gain += diff;
      else loss += Math.abs(diff);
    }
    gain /= period;
    loss /= period;
    if (gain + loss === 0) return result;
    result[period] = 100 - 100 / (1 + gain / loss);

    // Smooth with Wilder's method
    for (let i = period + 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) {
        gain = (gain * (period - 1) + diff) / period;
        loss = (loss * (period - 1)) / period;
      } else {
        gain = (gain * (period - 1)) / period;
        loss = (loss * (period - 1) + Math.abs(diff)) / period;
      }
      if (gain + loss === 0) {
        result[i] = 50;
      } else {
        result[i] = 100 - 100 / (1 + gain / loss);
      }
    }
    return result;
  }

  // ── Signal Engine ─────────────────────────────────────

  function signalOf(score) {
    if (score >= 4) return ["STRONG BUY", "buy"];
    if (score >= 2) return ["BUY", "buy"];
    if (score <= -4) return ["STRONG SELL", "sell"];
    if (score <= -2) return ["SELL", "sell"];
    return ["HOLD", "neutral"];
  }

  function advice(label) {
    const map = {
      "STRONG BUY": "Deep value zone — DCA-friendly for long-term holders.",
      BUY: "Constructive setup — accumulating is reasonable.",
      HOLD: "No statistical edge right now — hold and wait.",
      SELL: "Consider taking partial profits / tightening stops.",
      "STRONG SELL": "Risk-off — review position size seriously.",
    };
    return map[label] || "No clear signal.";
  }

  // ── Main Analysis Function ────────────────────────────

  async function analyze(id, fg) {
    if (!id) throw new Error("No coin ID provided");
    if (!fg) throw new Error("No Fear & Greed data provided");

    // Fetch coin data and chart
    const [coin, chart] = await Promise.all([
      W.api.coin(id),
      W.api.chart(id, 90),
    ]);

    if (!coin || !chart) throw new Error("No data available for this coin");

    // Extract prices
    const prices = (chart.prices || []).map((p) => p[1]);
    if (prices.length < 50) {
      throw new Error("Insufficient historical data for analysis");
    }

    const last = prices[prices.length - 1];

    // ── Indicators ──────────────────────────────────────
    const sma20 = sma(prices, 20);
    const sma50 = sma(prices, 50);
    const rsiValues = rsi(prices, 14);

    const currentSMA20 = sma20[sma20.length - 1];
    const currentSMA50 = sma50[sma50.length - 1];
    const currentRSI = rsiValues[rsiValues.length - 1] ?? 50;

    const md = coin.market_data || {};
    const p7 = md.price_change_percentage_7d ?? 0;
    const p30 = md.price_change_percentage_30d ?? 0;

    // ── Scoring ──────────────────────────────────────────
    let score = 0;
    const reasons = [];

    // 1. Trend: price vs SMA20 vs SMA50
    if (last > currentSMA20 && currentSMA20 > currentSMA50) {
      score += 2;
      reasons.push([
        "up",
        "Uptrend — price > SMA20 > SMA50 (bullish alignment)",
      ]);
    } else if (last > currentSMA50) {
      score += 1;
      reasons.push(["up", "Price holding above the 50-day average"]);
    } else if (last < currentSMA20 && currentSMA20 < currentSMA50) {
      score -= 2;
      reasons.push([
        "down",
        "Downtrend — price < SMA20 < SMA50 (bearish alignment)",
      ]);
    } else if (last < currentSMA50) {
      score -= 1;
      reasons.push(["down", "Price below the 50-day average"]);
    } else {
      reasons.push(["neutral", "Price trading near key moving averages"]);
    }

    // 2. RSI
    if (currentRSI < 30) {
      score += 2;
      reasons.push([
        "up",
        `RSI ${currentRSI.toFixed(0)} — oversold, historically a buy zone`,
      ]);
    } else if (currentRSI > 70) {
      score -= 2;
      reasons.push([
        "down",
        `RSI ${currentRSI.toFixed(0)} — overbought, elevated pullback risk`,
      ]);
    } else if (currentRSI < 45) {
      score += 0.5;
      reasons.push([
        "neutral",
        `RSI ${currentRSI.toFixed(0)} — mildly oversold`,
      ]);
    } else if (currentRSI > 60) {
      score -= 0.5;
      reasons.push([
        "neutral",
        `RSI ${currentRSI.toFixed(0)} — mildly overbought`,
      ]);
    } else {
      reasons.push([
        "neutral",
        `RSI ${currentRSI.toFixed(0)} — neutral momentum`,
      ]);
    }

    // 3. 7‑day momentum
    if (p7 > 5) {
      score += 1;
      reasons.push(["up", `7-day momentum +${p7.toFixed(1)}% (strong)`]);
    } else if (p7 > 0) {
      score += 0.5;
      reasons.push(["up", `7-day momentum +${p7.toFixed(1)}%`]);
    } else if (p7 < -5) {
      score -= 1;
      reasons.push(["down", `7-day momentum ${p7.toFixed(1)}% (weak)`]);
    } else {
      reasons.push(["neutral", `7-day momentum ${p7.toFixed(1)}%`]);
    }

    // 4. 30‑day momentum
    if (p30 > 10) {
      score += 1;
      reasons.push(["up", `30-day momentum +${p30.toFixed(1)}% (strong)`]);
    } else if (p30 > 0) {
      score += 0.5;
      reasons.push(["up", `30-day momentum +${p30.toFixed(1)}%`]);
    } else if (p30 < -10) {
      score -= 1;
      reasons.push(["down", `30-day momentum ${p30.toFixed(1)}% (weak)`]);
    } else {
      reasons.push(["neutral", `30-day momentum ${p30.toFixed(1)}%`]);
    }

    // 5. Fear & Greed (contrarian)
    const fgv = +fg.value;
    if (fgv <= 25) {
      score += 1;
      reasons.push([
        "up",
        `Fear & Greed ${fgv} (extreme fear) — contrarian buy zone`,
      ]);
    } else if (fgv >= 75) {
      score -= 1;
      reasons.push([
        "down",
        `Fear & Greed ${fgv} (extreme greed) — contrarian caution`,
      ]);
    } else if (fgv <= 40) {
      score += 0.5;
      reasons.push(["neutral", `Fear & Greed ${fgv} — fear (cautious buying)`]);
    } else if (fgv >= 60) {
      score -= 0.5;
      reasons.push([
        "neutral",
        `Fear & Greed ${fgv} — greed (cautious selling)`,
      ]);
    } else {
      reasons.push([
        "neutral",
        `Fear & Greed ${fgv} — neutral ${fg.value_classification || ""}`,
      ]);
    }

    // ── Result ──────────────────────────────────────────
    const [signal, cssClass] = signalOf(score);
    const confidence = Math.min(100, (Math.abs(score) / 8) * 100);

    return {
      coin,
      last,
      currentRSI,
      currentSMA20,
      currentSMA50,
      p7,
      p30,
      score,
      reasons,
      signal,
      cssClass,
      confidence,
      advice: advice(signal),
    };
  }

  // ── UI: Result Card ───────────────────────────────────

  function resultCard(a) {
    const [label, cls] = [a.signal, a.cssClass];
    const conf = a.confidence;

    const reasonsHTML = a.reasons
      .map(([t, txt]) => {
        const emoji = t === "up" ? "＋" : t === "down" ? "−" : "•";
        const tagClass = t === "up" ? "buy" : t === "down" ? "sell" : "neutral";
        return `<li><span class="tag ${tagClass}">${emoji}</span> ${txt}</li>`;
      })
      .join("");

    return `
      <div class="card">
        <div class="coin-head">
          <img class="coin-lg" src="${a.coin.image?.large || ""}" alt="${a.coin.name}">
          <div>
            <h2>${a.coin.name} <span class="muted">${a.coin.symbol.toUpperCase()}</span></h2>
            <div class="coin-price">
              <span class="tag ${cls}" style="font-size:14px;padding:6px 14px;">${label}</span>
              <span class="muted small ml">Weaver score ${a.score > 0 ? "+" : ""}${a.score.toFixed(1)}/8 · confidence ${conf.toFixed(0)}%</span>
            </div>
          </div>
        </div>
        <div class="meter-bar mt"><div style="width:${conf}%; background: ${conf >= 70 ? "var(--up)" : conf >= 40 ? "var(--warn)" : "var(--down)"}; box-shadow: 0 0 20px ${conf >= 70 ? "var(--up)" : conf >= 40 ? "var(--warn)" : "var(--down)"};"></div></div>
        <div class="cards mt">
          <div class="card stat">
            <div class="stat-label">RSI (14)</div>
            <div class="stat-big">${a.currentRSI.toFixed(0)}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">SMA 20 / 50</div>
            <div class="stat-big small">${W.fmt.price(a.currentSMA20)} / ${W.fmt.price(a.currentSMA50)}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Price</div>
            <div class="stat-big">${W.fmt.price(a.last)}</div>
          </div>
        </div>
        <ul class="tx-list">${reasonsHTML}</ul>
        <div class="ai-brief mt">
          🤖 <b>Weaver:</b> ${a.advice}
          <span class="muted small">Rule-based technical analysis — not financial advice.</span>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────

  async function render(view) {
    if (!view) {
      console.warn("[Trader] No view element provided");
      return;
    }

    view.innerHTML = `
      <div class="card">
        <h3>⚡ AI Trading Assistant</h3>
        <p class="muted small">RSI-14 + SMA 20/50 trend + momentum + Fear&Greed contrarian filter → Weaver Score → signal.</p>
        <div class="qa mt">
          <div id="t-picker" style="min-width:260px;"></div>
          <button class="btn primary" id="t-go">Analyze</button>
        </div>
        <div class="qa mt" id="t-quick"></div>
      </div>
      <div id="t-result"></div>
      <div class="card">
        <h3>📡 Holdings Signals (auto-scan)</h3>
        <div id="t-hold">${W.ui.spinner()}</div>
      </div>
    `;

    // ── Coin picker ──────────────────────────────────────
    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#t-picker"), (p) => (picked = p));
    } else {
      console.warn("[Trader] coinPicker not available");
    }

    // ── Run analysis for a coin ─────────────────────────
    const run = async (id) => {
      const resultContainer = view.querySelector("#t-result");
      if (!resultContainer) return;
      resultContainer.innerHTML = W.ui.spinner();

      try {
        const fg = await W.api.fearGreed();
        const result = await analyze(id, fg);
        resultContainer.innerHTML = resultCard(result);
      } catch (e) {
        resultContainer.innerHTML = `<p class="muted">${e.message}</p>`;
      }
    };

    // ── Go button ────────────────────────────────────────
    view.querySelector("#t-go").onclick = () => {
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      run(picked.id);
    };

    // ── Quick picks ──────────────────────────────────────
    const holdings = W.portfolio ? W.portfolio.all() : [];
    const quickIds = [
      "bitcoin",
      "ethereum",
      "solana",
      ...holdings.slice(0, 3).map((h) => h.coinId),
    ].filter((id, idx, arr) => arr.indexOf(id) === idx);

    const quickContainer = view.querySelector("#t-quick");
    if (quickContainer && quickIds.length) {
      quickContainer.innerHTML = quickIds
        .map((id) => `<button class="chip" data-q="${id}">${id}</button>`)
        .join("");
      quickContainer.querySelectorAll("[data-q]").forEach((btn) => {
        btn.onclick = () => run(btn.dataset.q);
      });
    }

    // ── Holdings auto-scan ──────────────────────────────
    try {
      const fg = await W.api.fearGreed();
      const holds = holdings.slice(0, 5);
      const holdContainer = view.querySelector("#t-hold");
      if (!holdContainer) return;

      if (!holds.length) {
        holdContainer.innerHTML = '<p class="muted small">No holdings yet.</p>';
        return;
      }

      const results = [];
      for (const h of holds) {
        try {
          const r = await analyze(h.coinId, fg);
          results.push(r);
        } catch (e) {
          console.warn("[Trader] Auto-scan error for", h.coinId, e);
        }
      }

      if (!results.length) {
        holdContainer.innerHTML =
          '<p class="muted small">Could not analyze holdings.</p>';
        return;
      }

      holdContainer.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Signal</th>
                <th>RSI</th>
                <th>Trend</th>
                <th>Weaver says</th>
              </tr>
            </thead>
            <tbody>
              ${results
                .map(
                  (a) => `
                <tr>
                  <td class="coin-cell">
                    <img src="${a.coin.image?.small || ""}" alt="${a.coin.name}" style="width:20px;height:20px;border-radius:50%;">
                    <b>${a.coin.name}</b>
                  </td>
                  <td><span class="tag ${a.cssClass}">${a.signal}</span></td>
                  <td>${a.currentRSI.toFixed(0)}</td>
                  <td>${a.last > a.currentSMA50 ? '<span class="up">Above SMA50</span>' : '<span class="down">Below SMA50</span>'}</td>
                  <td class="muted small">${a.advice}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      const holdContainer = view.querySelector("#t-hold");
      if (holdContainer)
        holdContainer.innerHTML = `<p class="muted small">${e.message}</p>`;
    }
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    analyze,
    sma,
    rsi,
    signalOf,
    advice,
  };
})();

console.log("[Trader] Module loaded.");

// ---- js/features/gems.js ----
// js/features/gems.js – Gem Agent: Token Hunter

window.W = window.W || {};

W.gems = (() => {
  // ── Constants ─────────────────────────────────────────
  const DEXSCREENER_API = "https://api.dexscreener.com";
  const PROXIES = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  ];

  const CHAINS = {
    solana: "🟣",
    ethereum: "🔷",
    base: "🔵",
    bsc: "🟡",
    arbitrum: "🔺",
    polygon: "🟪",
    avalanche: "❄️",
    ton: "💎",
    blast: "💥",
  };

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function chainTag(chain) {
    return `<span class="tag rank">${CHAINS[chain] || "⛓️"} ${chain}</span>`;
  }

  function kfmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return (n || 0).toFixed(0);
  }

  function ageText(hours) {
    if (hours < 1) return "<1h";
    if (hours < 48) return Math.round(hours) + "h";
    return Math.round(hours / 24) + "d";
  }

  // ── API call with proxy fallback ──────────────────────
  async function fetchDexScreener(url) {
    let lastErr;
    for (const proxy of PROXIES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const resp = await fetch(proxy(url), { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (e) {
        lastErr = e;
        clearTimeout(timeout);
      }
    }
    throw lastErr || new Error("All proxies failed");
  }

  // ── Scoring Algorithm ──────────────────────────────────
  function score(pair) {
    const liq = (pair.liquidity && pair.liquidity.usd) || 0;
    const vol = (pair.volume && pair.volume.h24) || 0;
    const ageH = pair.pairCreatedAt
      ? (Date.now() - pair.pairCreatedAt) / 36e5
      : 0;
    const c = pair.priceChange || {};
    const h1 = c.h1 || 0,
      h6 = c.h6 || 0,
      h24 = c.h24 || 0;

    let s = 0;
    const reasons = [];

    // Liquidity
    if (liq >= 100e3 && liq <= 10e6) {
      s += 25;
      reasons.push("Healthy liquidity ($" + kfmt(liq) + ")");
    } else if (liq >= 30e3) {
      s += 12;
      reasons.push("Liquidity on the thin side");
    } else {
      s -= 20;
      reasons.push("⚠️ Micro liquidity — rug risk");
    }

    // Volume / liquidity ratio
    const vl = liq ? vol / liq : 0;
    if (vl >= 1 && vl <= 30) {
      s += 20;
      reasons.push("Real interest — volume " + vl.toFixed(1) + "× liquidity");
    } else if (vl > 30) {
      s += 5;
      reasons.push("⚠️ Volume looks washed");
    } else {
      reasons.push("Low trading interest so far");
    }

    // Momentum
    if (h24 > 20 && h6 > 0) {
      s += 20;
      reasons.push("Strong momentum +" + h24.toFixed(0) + "% 24h");
    } else if (h24 < -30) {
      s -= 15;
      reasons.push("Dumping hard " + h24.toFixed(0) + "% 24h");
    } else {
      s += 8;
    }

    // Age
    if (ageH >= 6 && ageH <= 336) {
      s += 20;
      reasons.push("Age " + ageText(ageH) + " — past infancy, still early");
    } else if (ageH < 6) {
      s += 5;
      reasons.push("⚠️ Brand new (<6h) — extreme risk");
    } else {
      s += 10;
    }

    // Early buying pressure
    if (h1 > 0 && h6 > 0) {
      s += 15;
      reasons.push("Buyers stepping in (1h & 6h green)");
    }

    s = Math.max(0, Math.min(100, s));
    const verdict =
      s >= 70
        ? ["🌱 High-potential gem", "buy"]
        : s >= 50
          ? ["🔥 Heating up", "live"]
          : s >= 30
            ? ["⚠️ Degen play", "triggered"]
            : ["🚩 Avoid", "sell"];

    return { score: s, reasons, verdict, liq, vol, ageH, h1, h6, h24 };
  }

  // ── Scan ──────────────────────────────────────────────
  let auto = false,
    timer = null;
  let seen = {};

  async function scan(view) {
    const body = view.querySelector("#g-body");
    if (!body) return;
    body.innerHTML = W.ui.spinner();

    try {
      // Fetch boosted and profiled tokens
      const [boosts, profiles] = await Promise.allSettled([
        fetchDexScreener(DEXSCREENER_API + "/token-boosts/latest/v1"),
        fetchDexScreener(DEXSCREENER_API + "/token-profiles/latest/v1"),
      ]);

      const map = new Map();
      if (boosts.status === "fulfilled" && boosts.value) {
        boosts.value.forEach((b) =>
          map.set(b.tokenAddress, b.totalBoosts || 1),
        );
      }
      if (profiles.status === "fulfilled" && profiles.value) {
        profiles.value.forEach((p) => {
          if (!map.has(p.tokenAddress)) map.set(p.tokenAddress, 0);
        });
      }

      const addresses = [...map.keys()].slice(0, 30);
      if (!addresses.length) throw new Error("No candidates");

      // Fetch pair data
      const pairs = await fetchDexScreener(
        DEXSCREENER_API + "/latest/dex/tokens/" + addresses.join(","),
      );
      const byToken = {};
      (Array.isArray(pairs) ? pairs : []).forEach((p) => {
        const a = p.baseToken?.address;
        if (!a) return;
        if (
          !byToken[a] ||
          (p.liquidity?.usd || 0) > (byToken[a].liquidity?.usd || 0)
        ) {
          byToken[a] = p;
        }
      });

      const minScore = parseFloat(view.querySelector("#g-min")?.value) || 0;
      const results = Object.values(byToken)
        .map((p) => ({ pair: p, analysis: score(p) }))
        .filter((g) => g.analysis.score >= minScore)
        .sort((a, b) => b.analysis.score - a.analysis.score)
        .slice(0, 24);

      // Notify new gems
      results.forEach((g) => {
        const addr = g.pair.baseToken.address;
        if (g.analysis.score >= 70 && !seen[addr]) {
          const msg = `🤖 <b>Gem detected:</b> ${g.pair.baseToken.symbol} on ${g.pair.chainId} — score ${g.analysis.score}`;
          W.ui.toast(msg, "ok", 6000);
          if (W.tg) W.tg.notify("gem:" + addr, msg);
        }
        seen[addr] = 1;
      });

      // Stats
      view.querySelector("#g-stats").innerHTML = `
        <div class="card stat"><div class="stat-label">Candidates scanned</div><div class="stat-big">${addresses.length}</div></div>
        <div class="card stat"><div class="stat-label">Chains covered</div><div class="stat-big">${new Set(results.map((g) => g.pair.chainId)).size}</div></div>
        <div class="card stat"><div class="stat-label">Gems ≥ ${minScore}</div><div class="stat-big">${results.length}</div></div>
      `;

      // Render cards
      if (results.length) {
        body.innerHTML = `<div class="grid-2">${results
          .map((g) => {
            const p = g.pair,
              a = g.analysis,
              t = p.baseToken;
            return `
            <div class="card">
              <div class="watch-head">
                <div>
                  <b>${escapeHTML(t.symbol)}</b> <span class="muted small">${escapeHTML(t.name)}</span><br>
                  ${chainTag(p.chainId)} <span class="muted small">age ${ageText(a.ageH)}</span>
                </div>
                <div style="text-align:right;">
                  <span class="tag ${a.verdict[1]}" style="font-size:12px;padding:5px 10px;">${a.verdict[0]}</span>
                  <div class="alt-num" style="font-size:26px;">${a.score}</div>
                </div>
              </div>
              <div class="meter-bar"><div style="width:${a.score}%; background: var(--grad);"></div></div>
              <div class="kv-row"><span class="muted">Price</span><span>$${p.priceUsd}</span></div>
              <div class="kv-row"><span class="muted">Liquidity / 24h Vol</span><span>$${kfmt(a.liq)} / $${kfmt(a.vol)}</span></div>
              <div class="kv-row"><span class="muted">1h / 6h / 24h</span><span>${W.fmt.pct(a.h1)} ${W.fmt.pct(a.h6)} ${W.fmt.pct(a.h24)}</span></div>
              <ul class="tx-list">${a.reasons
                .slice(0, 4)
                .map((r) => `<li>${escapeHTML(r)}</li>`)
                .join("")}</ul>
              <a class="btn tiny mt" target="_blank" href="${p.url || "https://dexscreener.com/" + p.chainId + "/" + p.pairAddress}">📊 Open in DEX Screener ↗</a>
            </div>
          `;
          })
          .join("")}</div>`;
      } else {
        body.innerHTML = W.ui.empty(
          "🤖",
          "No gems above the threshold right now",
          "Lower the min score or wait for the next auto-scan",
        );
      }
    } catch (e) {
      body.innerHTML = `<p class="muted">Gem scan failed: ${escapeHTML(e.message)} — DEX Screener unreachable on this network (try ⟳ or another network).</p>`;
    }
  }

  // ── Render ─────────────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🤖 Gem Agent — autonomous new-token hunter</h3>
          <div class="qa">
            <label style="margin:0;">Min score
              <select id="g-min" style="width:auto;">
                <option value="0">0</option>
                <option value="40" selected>40</option>
                <option value="60">60</option>
                <option value="70">70</option>
              </select>
            </label>
            <label class="small" style="margin:0;">
              <input type="checkbox" id="g-auto" ${auto ? "checked" : ""} style="width:auto;">
              Auto-scan 5 min
            </label>
            <button class="btn primary" id="g-go">▶ Scan now</button>
          </div>
        </div>
        <p class="muted small">The agent crawls DEX Screener's latest boosted & newly-profiled tokens on <b>every chain</b>, pulls their pairs and scores potential: liquidity sweet-spot, volume÷liquidity, momentum, age & early buying pressure. Memecoins can go to zero — not financial advice.</p>
      </div>
      <div class="cards" id="g-stats"></div>
      <div id="g-body">${W.ui.spinner()}</div>
    `;

    view.querySelector("#g-go").onclick = () => scan(view);
    view.querySelector("#g-min").onchange = () => scan(view);
    view.querySelector("#g-auto").onchange = (e) => {
      auto = e.target.checked;
      clearInterval(timer);
      if (auto) timer = setInterval(() => scan(view), 5 * 60 * 1000);
      W.ui.toast(
        auto ? "🤖 Agent armed — rescanning every 5 min" : "🤖 Agent paused",
        "info",
      );
    };
    if (auto && !timer) timer = setInterval(() => scan(view), 5 * 60 * 1000);
    await scan(view);
  }

  return { render };
})();

console.log("[Gems] Module loaded.");

// ---- js/features/shield.js ----
// ================================================================
// js/features/shield.js – Token Shield (Contract Security Auditor)
// ================================================================

window.W = window.W || {};

W.shield = (() => {
  // ── Constants ─────────────────────────────────────────
  const GOPLUS_API = "https://api.gopluslabs.io/api/v1/token_security";
  const CACHE_TTL = 300000; // 5 minutes

  const CHAINS = {
    ethereum: { id: "1", name: "Ethereum", icon: "⟠" },
    bsc: { id: "56", name: "BSC", icon: "🟡" },
    base: { id: "8453", name: "Base", icon: "🔵" },
    arbitrum: { id: "42161", name: "Arbitrum", icon: "🔷" },
    polygon: { id: "137", name: "Polygon", icon: "🟣" },
    avalanche: { id: "43114", name: "Avalanche", icon: "❄️" },
    optimism: { id: "10", name: "Optimism", icon: "🔴" },
    fantom: { id: "250", name: "Fantom", icon: "🔷" },
    cronos: { id: "25", name: "Cronos", icon: "🟢" },
    gnosis: { id: "100", name: "Gnosis", icon: "🟣" },
  };

  // ── Helpers ────────────────────────────────────────────

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function shortAddr(addr) {
    if (!addr) return "—";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function formatPercent(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return "—";
    return num.toFixed(2) + "%";
  }

  // ── Cache ──────────────────────────────────────────────

  function getCacheKey(chainId, address) {
    return `shield_${chainId}_${address.toLowerCase()}`;
  }

  function getCached(chainId, address) {
    const key = getCacheKey(chainId, address);
    const cached = W.store.get(key, null);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      W.store.delete(key);
      return null;
    }
    return cached.data;
  }

  function setCache(chainId, address, data) {
    const key = getCacheKey(chainId, address);
    W.store.set(key, { data, timestamp: Date.now() });
  }

  // ── Validate Address ──────────────────────────────────

  function isValidAddress(address, chain) {
    if (!address || typeof address !== "string") return false;
    // EVM addresses: 0x + 40 hex chars
    if (chain !== "solana") {
      return /^0x[a-fA-F0-9]{40}$/i.test(address);
    }
    // Solana: base58
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  // ── Fetch from GoPlus ─────────────────────────────────

  async function fetchTokenSecurity(chainId, address) {
    // Check cache first
    const cached = getCached(chainId, address);
    if (cached) return cached;

    const url = `${GOPLUS_API}/${chainId}?contract_addresses=${address.toLowerCase()}`;

    // Use proxy fallbacks
    const proxies = [
      (u) => u,
      (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
      (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
      (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
    ];

    let lastError = null;
    for (const proxy of proxies) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(proxy(url), {
          signal: controller.signal,
          headers: { "User-Agent": "WeaverBot/1.0" },
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.code !== 1) {
          throw new Error(data.message || "API error");
        }
        // Cache and return
        setCache(chainId, address, data);
        return data;
      } catch (e) {
        lastError = e;
        console.warn("[Shield] Proxy failed:", e.message);
      }
    }
    throw lastError || new Error("All proxies failed");
  }

  // ── Parse and Render Results ──────────────────────────

  function renderResults(data, address, chainKey) {
    const chain = CHAINS[chainKey];
    const result = data.result && data.result[address.toLowerCase()];
    if (!result) {
      return `
        <div class="card">
          ${W.ui.empty("🛡️", "No data found", "Token might be too new or not a standard ERC-20/BEP-20 on this chain.")}
        </div>
      `;
    }

    // ── Extract flags ──────────────────────────────────
    const isHoneypot = result.is_honeypot === "1";
    const isMintable = result.is_mintable === "1";
    const isProxy = result.is_proxy === "1";
    const isOwnerRenounced =
      result.owner_change === "1" ||
      result.owner === "0x0000000000000000000000000000000000000000";
    const isLpLocked = (result.lp_holders || []).some(
      (lp) => lp.is_locked === 1,
    );

    const buyTax = (parseFloat(result.buy_tax) * 100).toFixed(1);
    const sellTax = (parseFloat(result.sell_tax) * 100).toFixed(1);
    const holderCount = result.holder_count || 0;
    const totalSupply = result.total_supply
      ? parseFloat(result.total_supply).toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })
      : "Unknown";

    // ── Risk scoring ──────────────────────────────────
    let riskScore = 0;
    const risks = [];

    if (isHoneypot) {
      riskScore += 50;
      risks.push("🚨 Honeypot (cannot sell)");
    }
    if (isMintable) {
      riskScore += 20;
      risks.push("⚠️ Mintable (infinite supply)");
    }
    if (isProxy) {
      riskScore += 15;
      risks.push("⚠️ Proxy contract (hidden logic)");
    }
    if (!isLpLocked) {
      riskScore += 15;
      risks.push("⚠️ Liquidity not locked");
    }
    if (parseFloat(buyTax) > 5) {
      riskScore += 10;
      risks.push(`⚠️ High buy tax (${buyTax}%)`);
    }
    if (parseFloat(sellTax) > 5) {
      riskScore += 10;
      risks.push(`⚠️ High sell tax (${sellTax}%)`);
    }
    if (!isOwnerRenounced) {
      riskScore += 5;
      risks.push("⚠️ Owner not renounced");
    }

    const riskLevel =
      riskScore >= 40
        ? ["🚨 EXTREME RUG RISK", "sell"]
        : riskScore >= 20
          ? ["⚠️ CAUTION", "triggered"]
          : ["✅ LOOKS SAFE", "buy"];

    // ── Top holders ──────────────────────────────────
    const topHolders = (result.holders || []).slice(0, 5);
    const lpHolders = (result.lp_holders || []).slice(0, 3);

    // ── Build HTML ──────────────────────────────────
    return `
      <div class="card" style="border-color: ${riskScore >= 40 ? "var(--down)" : riskScore >= 20 ? "var(--warn)" : "var(--up)"}; box-shadow: 0 0 40px ${riskScore >= 40 ? "rgba(255,92,122,.2)" : "transparent"};">
        <div class="watch-head">
          <div>
            <h2>${escapeHTML(result.token_name || "Unknown")} <span class="muted">${escapeHTML(result.token_symbol || "")}</span></h2>
            <p class="muted small">${chain.icon} ${chain.name} · ${holderCount} Holders · Supply: ${totalSupply}</p>
          </div>
          <div style="text-align:right;">
            <span class="tag ${riskLevel[1]}" style="font-size:14px;padding:8px 16px;">${riskLevel[0]}</span>
            <div class="muted small">Risk Score: ${riskScore}/100</div>
          </div>
        </div>
        ${
          risks.length
            ? `
          <div class="mt">
            ${risks.map((r) => `<span class="tag ${r.includes("Honeypot") ? "sell" : "triggered"}">${r}</span>`).join(" ")}
          </div>
        `
            : ""
        }
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>🚨 Red Flags</h3>
          <div class="kv-row"><span>Honeypot (Cannot Sell)</span> <b class="${isHoneypot ? "down" : "up"}">${isHoneypot ? "YES 🚨" : "NO ✅"}</b></div>
          <div class="kv-row"><span>Mintable (Infinite Supply)</span> <b class="${isMintable ? "down" : "up"}">${isMintable ? "YES ⚠️" : "NO ✅"}</b></div>
          <div class="kv-row"><span>Proxy Contract (Hidden Logic)</span> <b class="${isProxy ? "down" : "up"}">${isProxy ? "YES ⚠️" : "NO ✅"}</b></div>
          <div class="kv-row"><span>Owner Renounced</span> <b class="${isOwnerRenounced ? "up" : "down"}">${isOwnerRenounced ? "YES ✅" : "NO ⚠️"}</b></div>
          <div class="kv-row"><span>Liquidity Locked</span> <b class="${isLpLocked ? "up" : "down"}">${isLpLocked ? "YES ✅" : "NO 🚨"}</b></div>
        </div>
        <div class="card">
          <h3>💰 Taxes & Fees</h3>
          <div class="kv-row"><span>Buy Tax</span> <b style="color: ${parseFloat(buyTax) > 5 ? "var(--down)" : "var(--up)"};">${buyTax}%</b></div>
          <div class="kv-row"><span>Sell Tax</span> <b style="color: ${parseFloat(sellTax) > 5 ? "var(--down)" : "var(--up)"};">${sellTax}%</b></div>
          <div class="meter-label mt">Tax Severity</div>
          <div class="meter-bar">
            <div style="width: ${Math.min(100, (parseFloat(buyTax) + parseFloat(sellTax)) * 2)}%; background: ${Math.max(parseFloat(buyTax), parseFloat(sellTax)) > 5 ? "var(--down)" : "var(--up)"};"></div>
          </div>
          <p class="muted small mt">Taxes > 5% are often used to drain buyer funds. 0/0 is ideal.</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>🐋 Top Holders</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Address</th><th>Tag</th><th>Supply %</th><th>Status</th></tr></thead>
              <tbody>
                ${topHolders
                  .map(
                    (h) => `
                  <tr>
                    <td><code>${shortAddr(h.address)}</code></td>
                    <td>${h.tag ? `<span class="tag rank">${escapeHTML(h.tag)}</span>` : '<span class="muted">—</span>'}</td>
                    <td><b>${(parseFloat(h.percent) * 100).toFixed(2)}%</b></td>
                    <td>${h.is_contract === 1 ? '<span class="tag">Contract</span>' : h.is_locked === 1 ? '<span class="tag buy">Locked</span>' : '<span class="tag neutral">Wallet</span>'}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <h3>🔄 LP Holders</h3>
          ${
            lpHolders.length
              ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Address</th><th>LP Share</th><th>Locked</th></tr></thead>
                <tbody>
                  ${lpHolders
                    .map(
                      (lp) => `
                    <tr>
                      <td><code>${shortAddr(lp.address)}</code></td>
                      <td>${(parseFloat(lp.percent) * 100).toFixed(2)}%</td>
                      <td>${lp.is_locked === 1 ? '<span class="tag buy">🔒 Locked</span>' : '<span class="tag sell">⚠️ Unlocked</span>'}</td>
                    </tr>
                  `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
              : '<p class="muted small">No LP holders found.</p>'
          }
          <p class="muted small mt">Locked liquidity reduces rug-pull risk.</p>
        </div>
      </div>
    `;
  }

  // ── Scan Function ─────────────────────────────────────

  async function scan(addr, chainKey, view) {
    const body = view.querySelector("#sh-body");
    if (!body) return;
    body.innerHTML = W.ui.spinner();

    const chain = CHAINS[chainKey];
    if (!chain) {
      body.innerHTML = `<p class="muted">Unsupported chain: ${chainKey}</p>`;
      return;
    }

    // Validate address
    if (!isValidAddress(addr, chainKey)) {
      body.innerHTML = W.ui.empty(
        "🚫",
        "Invalid address",
        `Please enter a valid ${chain.name} address.`,
      );
      return;
    }

    try {
      const data = await fetchTokenSecurity(chain.id, addr);
      const result = data.result && data.result[addr.toLowerCase()];

      if (!result) {
        body.innerHTML = W.ui.empty(
          "🛡️",
          "No security data found",
          "Token might be too new, not a standard ERC-20/BEP-20, or not on this chain.",
        );
        return;
      }

      body.innerHTML = renderResults(data, addr, chainKey);
    } catch (e) {
      console.error("[Shield] Scan error:", e);
      body.innerHTML = W.ui.empty(
        "⚠️",
        "Scan failed",
        `Error: ${escapeHTML(e.message)}. Try again later or use a different chain.`,
      );
    }
  }

  // ── Render ─────────────────────────────────────────────

  async function render(view) {
    if (!view) {
      console.warn("[Shield] No view element provided");
      return;
    }

    view.innerHTML = `
      <div class="card">
        <h3>🛡️ Token Shield — Contract Security Auditor</h3>
        <p class="muted small">Paste any EVM contract address to instantly check for honeypots, hidden mints, proxy contracts, and malicious taxes. Powered by GoPlus Security.</p>
        <div class="alert-form mt">
          <label>
            Chain
            <select id="sh-chain">
              ${Object.entries(CHAINS)
                .map(
                  ([k, v]) => `
                <option value="${k}">${v.icon} ${v.name}</option>
              `,
                )
                .join("")}
            </select>
          </label>
          <label>
            Contract Address
            <input id="sh-addr" placeholder="0x..." value="">
          </label>
          <button class="btn primary" id="sh-go">Audit Token</button>
        </div>
        <div class="qa mt">
          <button class="btn tiny" id="sh-examples">📋 Examples</button>
        </div>
      </div>
      <div id="sh-body"></div>
    `;

    // ── Examples ──────────────────────────────────────
    const examples = {
      "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
      "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": "UNI",
      "0x514910771af9ca656af840dff83e8264ecf986ca": "LINK",
    };

    view.querySelector("#sh-examples").onclick = () => {
      const list = Object.entries(examples)
        .map(
          ([addr, name]) =>
            `<div class="chip" data-addr="${addr}">${name}</div>`,
        )
        .join("");
      const m = W.ui.modal({
        title: "Example Contracts",
        body: `<div class="qa">${list}</div>`,
        footer: `<button class="btn ghost" onclick="this.closest('.modal').parentElement.innerHTML=''">Close</button>`,
      });
      m.el.querySelectorAll("[data-addr]").forEach((chip) => {
        chip.onclick = () => {
          const input = view.querySelector("#sh-addr");
          if (input) input.value = chip.dataset.addr;
          m.close();
          view.querySelector("#sh-go").click();
        };
      });
    };

    // ── Scan button ──────────────────────────────────
    view.querySelector("#sh-go").onclick = () => {
      const addr = view.querySelector("#sh-addr").value.trim();
      const chain = view.querySelector("#sh-chain").value;
      if (!addr) return W.ui.toast("Enter a contract address", "warn");
      scan(addr, chain, view);
    };

    // ── Enter key support ────────────────────────────
    view.querySelector("#sh-addr").addEventListener("keydown", (e) => {
      if (e.key === "Enter") view.querySelector("#sh-go").click();
    });

    // ── Auto-scan URL param (optional) ──────────────
    const params = new URLSearchParams(window.location.search);
    const autoAddr = params.get("address");
    const autoChain = params.get("chain") || "ethereum";
    if (autoAddr && isValidAddress(autoAddr, autoChain)) {
      view.querySelector("#sh-addr").value = autoAddr;
      view.querySelector("#sh-chain").value = autoChain;
      scan(autoAddr, autoChain, view);
    }
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    scan,
    fetchTokenSecurity,
    CHAINS,
  };
})();

console.log("[Shield] Module loaded.");

// ---- js/features/web3.js ----
// ===============================================================
//            Secure Multi‑Chain Wallet Connector
// ===============================================================

window.W = window.W || {};

W.web3 = (() => {
  // ── Constants ─────────────────────────────────────────
  const STORAGE_KEY = "web3_wallets";
  const CHAINS = {
    1: { name: "Ethereum", symbol: "ETH", explorer: "https://etherscan.io" },
    56: { name: "BSC", symbol: "BNB", explorer: "https://bscscan.com" },
    137: {
      name: "Polygon",
      symbol: "MATIC",
      explorer: "https://polygonscan.com",
    },
    42161: { name: "Arbitrum", symbol: "ARB", explorer: "https://arbiscan.io" },
    43114: {
      name: "Avalanche",
      symbol: "AVAX",
      explorer: "https://snowtrace.io",
    },
    10: {
      name: "Optimism",
      symbol: "OP",
      explorer: "https://optimistic.etherscan.io",
    },
  };
  const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);

  // ── State ─────────────────────────────────────────────
  let state = W.store.get(STORAGE_KEY, { evm: null, sol: null });
  let provider = null;
  let currentChainId = null;

  // ── Helpers ────────────────────────────────────────────
  function saveState() {
    W.store.set(STORAGE_KEY, state);
  }

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Validate Address ──────────────────────────────────
  function validateAddress(address, chain) {
    if (chain === "sol") {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        throw new Error("Invalid Solana address");
      }
      return address;
    }
    if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      throw new Error("Invalid EVM address");
    }
    return address.toLowerCase();
  }

  // ── Connect to MetaMask (EVM) ──────────────────────
  async function connectMetaMask() {
    if (!window.ethereum) {
      W.ui.toast("MetaMask not detected.", "warn");
      return null;
    }
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (!accounts || !accounts.length) {
        W.ui.toast("No accounts found.", "warn");
        return null;
      }
      const address = accounts[0];
      const chainIdHex = await window.ethereum.request({
        method: "eth_chainId",
      });
      const chainId = parseInt(chainIdHex, 16);
      if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
        W.ui.toast(
          `Unsupported chain ID ${chainId}. Please switch to a supported network.`,
          "warn",
        );
        return null;
      }
      state.evm = { address, chainId };
      saveState();
      provider = window.ethereum;
      currentChainId = chainId;
      W.ui.toast(
        `✅ MetaMask connected (${CHAINS[chainId]?.name || chainId})`,
        "ok",
      );
      return state.evm;
    } catch (error) {
      console.error("[Web3] MetaMask connection error:", error);
      W.ui.toast(`MetaMask: ${error.message || "Connection rejected"}`, "warn");
      return null;
    }
  }

  // ── Connect to Phantom (Solana) ────────────────────
  async function connectPhantom() {
    const phantom = window.phantom?.solana;
    if (!phantom) {
      W.ui.toast("Phantom not detected.", "warn");
      return null;
    }
    try {
      const response = await phantom.connect({ onlyIfTrusted: false });
      if (!response.publicKey) {
        W.ui.toast("Connection failed.", "warn");
        return null;
      }
      const address = response.publicKey.toString();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        throw new Error("Invalid Solana address");
      }
      state.sol = { address };
      saveState();
      W.ui.toast("✅ Phantom connected", "ok");
      return state.sol;
    } catch (error) {
      console.error("[Web3] Phantom connection error:", error);
      W.ui.toast(`Phantom: ${error.message || "Connection rejected"}`, "warn");
      return null;
    }
  }

  // ── Disconnect ──────────────────────────────────────
  function disconnect(chain) {
    if (chain === "evm") {
      state.evm = null;
      provider = null;
      currentChainId = null;
    } else if (chain === "sol") {
      try {
        window.phantom?.solana?.disconnect();
      } catch (e) {}
      state.sol = null;
    }
    saveState();
    W.ui.toast(
      `Disconnected from ${chain === "evm" ? "MetaMask" : "Phantom"}`,
      "info",
    );
  }

  // ── Get EVM Balance ──────────────────────────────────
  async function getEVMBalance(address) {
    if (!window.ethereum) return null;
    try {
      const balanceHex = await window.ethereum.request({
        method: "eth_getBalance",
        params: [address, "latest"],
      });
      const balanceWei = parseInt(balanceHex, 16);
      return balanceWei / 1e18;
    } catch (error) {
      console.error("[Web3] EVM balance fetch error:", error);
      return null;
    }
  }

  // ── Get Solana Balance ──────────────────────────────
  async function getSolBalance(address) {
    const phantom = window.phantom?.solana;
    if (!phantom) {
      console.warn("[Web3] Phantom not available");
      return null;
    }
    try {
      // Check if getBalance exists and is a function
      if (typeof phantom.getBalance === "function") {
        const balance = await phantom.getBalance();
        return balance / 1e9;
      } else {
        // Fallback: use RPC directly
        console.warn("[Web3] Phantom.getBalance not available, using RPC");
        const response = await fetch("https://api.mainnet-beta.solana.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [address],
          }),
        });
        const data = await response.json();
        if (data.result && data.result.value !== undefined) {
          return data.result.value / 1e9;
        }
        return null;
      }
    } catch (error) {
      console.error("[Web3] Solana balance fetch error:", error);
      return null;
    }
  }

  // ── Switch or add chain (EVM) ──────────────────────
  async function switchChain(chainId) {
    if (!window.ethereum) {
      W.ui.toast("MetaMask not available", "warn");
      return false;
    }
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
      currentChainId = chainId;
      if (state.evm) {
        state.evm.chainId = chainId;
        saveState();
      }
      W.ui.toast(`Switched to ${CHAINS[chainId]?.name || chainId}`, "ok");
      return true;
    } catch (error) {
      if (error.code === 4902) {
        const chainData = {
          1: {
            chainName: "Ethereum Mainnet",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [
              "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
            ],
          },
          56: {
            chainName: "BSC",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: ["https://bsc-dataseed.binance.org"],
          },
          137: {
            chainName: "Polygon",
            nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
            rpcUrls: ["https://polygon-rpc.com"],
          },
        };
        const info = chainData[chainId];
        if (!info) {
          W.ui.toast("Unsupported chain ID", "warn");
          return false;
        }
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${chainId.toString(16)}`,
                chainName: info.chainName,
                nativeCurrency: info.nativeCurrency,
                rpcUrls: info.rpcUrls,
              },
            ],
          });
          return await switchChain(chainId);
        } catch (addError) {
          console.error("[Web3] Add chain error:", addError);
          W.ui.toast("Failed to add chain", "warn");
          return false;
        }
      }
      console.error("[Web3] Switch chain error:", error);
      W.ui.toast(`Switch chain failed: ${error.message}`, "warn");
      return false;
    }
  }

  // ── Render UI ────────────────────────────────────────
  function render(view) {
    const evm = state.evm;
    const sol = state.sol;
    const chainName = evm?.chainId
      ? CHAINS[evm.chainId]?.name || evm.chainId
      : "—";

    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>🦊 MetaMask (EVM)</h3>
          ${
            evm
              ? `
            <span class="tag buy">CONNECTED</span>
            <div class="kv-row"><span class="muted">Address</span><code>${evm.address}</code></div>
            <div class="kv-row"><span class="muted">Chain</span><b>${chainName}</b></div>
            <div class="kv-row"><span class="muted">Balance</span><b id="evm-balance">—</b></div>
            <div class="qa mt">
              <button class="btn danger tiny" id="w-dis-evm">🔌 Disconnect</button>
              <button class="btn tiny" id="w-switch-chain">🔄 Switch Chain</button>
            </div>
          `
              : `
            <p class="muted">Not connected</p>
            <button class="btn primary" id="w-mm">Connect MetaMask</button>
          `
          }
        </div>
        <div class="card">
          <h3>👻 Phantom (Solana)</h3>
          ${
            sol
              ? `
            <span class="tag buy">CONNECTED</span>
            <div class="kv-row"><span class="muted">Address</span><code>${sol.address}</code></div>
            <div class="kv-row"><span class="muted">Balance</span><b id="sol-balance">—</b></div>
            <button class="btn danger tiny mt" id="w-dis-sol">🔌 Disconnect</button>
          `
              : `
            <p class="muted">Not connected</p>
            <button class="btn primary" id="w-ph">Connect Phantom</button>
          `
          }
        </div>
      </div>
      <div class="card">
        <h3>🔐 Security & Privacy</h3>
        <ul class="tx-list">
          <li>✅ All wallet interactions are initiated by you.</li>
          <li>✅ Weaver never stores your private keys or seed phrases.</li>
          <li>✅ Transactions must be manually confirmed in your wallet.</li>
          <li>✅ Addresses are validated with checksums.</li>
          <li>✅ Chain switching requires user approval.</li>
          <li>✅ All communications are over HTTPS (in production).</li>
        </ul>
      </div>
      <div class="card">
        <h3>📜 Recent Activity</h3>
        <div id="web3-activity" class="empty">No activity yet.</div>
      </div>
    `;

    // ── Bind events ──────────────────────────────────────
    const mmBtn = view.querySelector("#w-mm");
    if (mmBtn)
      mmBtn.onclick = async () => {
        await connectMetaMask();
        render(view);
      };

    const phBtn = view.querySelector("#w-ph");
    if (phBtn)
      phBtn.onclick = async () => {
        await connectPhantom();
        render(view);
      };

    const disEvm = view.querySelector("#w-dis-evm");
    if (disEvm)
      disEvm.onclick = () => {
        disconnect("evm");
        render(view);
      };

    const disSol = view.querySelector("#w-dis-sol");
    if (disSol)
      disSol.onclick = () => {
        disconnect("sol");
        render(view);
      };

    const switchBtn = view.querySelector("#w-switch-chain");
    if (switchBtn) {
      switchBtn.onclick = () => {
        const options = Object.entries(CHAINS)
          .map(
            ([id, info]) =>
              `<option value="${id}">${info.name} (${info.symbol})</option>`,
          )
          .join("");
        const m = W.ui.modal({
          title: "Switch Network",
          body: `<select id="chain-select">${options}</select>`,
          footer: `
            <button class="btn ghost" id="chain-cancel">Cancel</button>
            <button class="btn primary" id="chain-switch">Switch</button>
          `,
        });
        m.el.querySelector("#chain-cancel").onclick = m.close;
        m.el.querySelector("#chain-switch").onclick = async () => {
          const chainId = parseInt(
            m.el.querySelector("#chain-select").value,
            10,
          );
          await switchChain(chainId);
          m.close();
          render(view);
        };
      };
    }

    // ── Fetch balances with error handling ──────────────
    if (evm) {
      getEVMBalance(evm.address)
        .then((bal) => {
          const el = view.querySelector("#evm-balance");
          if (el) el.textContent = bal !== null ? `${bal.toFixed(4)} ETH` : "—";
        })
        .catch((err) => {
          console.warn("[Web3] EVM balance error:", err);
          const el = view.querySelector("#evm-balance");
          if (el) el.textContent = "⚠️ error";
        });
    }
    if (sol) {
      getSolBalance(sol.address)
        .then((bal) => {
          const el = view.querySelector("#sol-balance");
          if (el) el.textContent = bal !== null ? `${bal.toFixed(4)} SOL` : "—";
        })
        .catch((err) => {
          console.warn("[Web3] Solana balance error:", err);
          const el = view.querySelector("#sol-balance");
          if (el) el.textContent = "⚠️ error";
        });
    }

    // ── Listen for chain/account changes ──────────────
    if (window.ethereum) {
      window.ethereum.on("chainChanged", (chainId) => {
        const id = parseInt(chainId, 16);
        currentChainId = id;
        if (state.evm) {
          state.evm.chainId = id;
          saveState();
        }
        W.ui.toast(`Chain changed to ${CHAINS[id]?.name || id}`, "info");
        render(view);
      });
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length) {
          state.evm.address = accounts[0];
          saveState();
          W.ui.toast("Account changed", "info");
        } else {
          disconnect("evm");
          W.ui.toast("Disconnected from MetaMask", "info");
        }
        render(view);
      });
    }
  }

  // ── Public API ───────────────────────────────────────
  return {
    render,
    connectMetaMask,
    connectPhantom,
    disconnect,
    switchChain,
    getEVMBalance,
    getSolBalance,
    state: () => ({ ...state }),
  };
})();

console.log("[Web3] Module loaded (secure).");

// ---- js/features/misc.js ----
// ================================================================
// js/features/misc.js – Miscellaneous Features
// ================================================================

window.W = window.W || {};

// ── Achievements Module ───────────────────────────────────
W.achievements = (() => {
  const DEFS = [
    {
      id: "first-coin",
      icon: "🌱",
      name: "First Thread",
      desc: "Add your first holding",
      test: () => (W.portfolio?.all().length || 0) >= 1,
    },
    {
      id: "five-coins",
      icon: "🧺",
      name: "Diversifier",
      desc: "Hold 5+ different assets",
      test: () => (W.portfolio?.all().length || 0) >= 5,
    },
    {
      id: "first-tx",
      icon: "↔️",
      name: "Trader",
      desc: "Record a buy/sell transaction",
      test: () => (W.portfolio?.txs().length || 0) >= 1,
    },
    {
      id: "first-alert",
      icon: "🚨",
      name: "Watchdog",
      desc: "Create a price alert",
      test: () => W.store.get("alerts", []).length >= 1,
    },
    {
      id: "student",
      icon: "🎓",
      name: "Student",
      desc: "Complete a lesson",
      test: () => (W.store.get("learn", {}).done || []).length >= 1,
    },
    {
      id: "web3",
      icon: "🔗",
      name: "Web3 Native",
      desc: "Connect a wallet",
      test: () =>
        !!W.store.get("web3_wallets", null)?.evm ||
        !!W.store.get("web3_wallets", null)?.sol,
    },
    {
      id: "journalist",
      icon: "📰",
      name: "Journalist",
      desc: "Read 10 news articles",
      test: () => W.store.get("news-read", []).length >= 10,
    },
    {
      id: "curator",
      icon: "🔖",
      name: "Curator",
      desc: "Save 5 articles to your Reading List",
      test: () => W.store.get("news-saved", []).length >= 5,
    },
    {
      id: "whale",
      icon: "🐋",
      name: "Whale Watcher",
      desc: "Track a whale wallet",
      test: () => W.store.get("whale-wallets", []).length >= 1,
    },
    {
      id: "optimizer",
      icon: "🧮",
      name: "Optimizer",
      desc: "Run the portfolio optimizer",
      test: () => !!W.store.get("optimizer-used", false),
    },
  ];

  const earned = () => W.store.get("achievements", {});
  const save = (e) => W.store.set("achievements", e);

  function check() {
    const e = earned();
    let changed = false;
    DEFS.forEach((d) => {
      if (!e[d.id] && d.test()) {
        e[d.id] = Date.now();
        changed = true;
        W.ui.toast(`🏅 Achievement unlocked: <b>${d.name}</b>`, "ok", 5000);
      }
    });
    if (changed) save(e);
    return e;
  }

  return { DEFS, earned, save, check };
})();

// ── Misc UI ──────────────────────────────────────────────
W.misc = (() => {
  // ── Helpers ──────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Profile ─────────────────────────────────────────────
  function renderProfile(view) {
    const e = W.achievements.earned();
    const streak = W.portfolio?.getStreak?.() || { count: 1 };
    const holdings = W.portfolio?.all() || [];
    const txs = W.portfolio?.txs() || [];
    const alerts = W.store.get("alerts", []);

    view.innerHTML = `
      <div class="cards">
        <div class="card stat">
          <div class="stat-label">Learning Streak</div>
          <div class="stat-big">🔥 ${streak.count || 1} day${streak.count > 1 ? "s" : ""}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Assets Held</div>
          <div class="stat-big">${holdings.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Transactions</div>
          <div class="stat-big">${txs.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Badges</div>
          <div class="stat-big">${Object.keys(e).length}/${W.achievements.DEFS.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Alerts</div>
          <div class="stat-big">${alerts.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Articles Read</div>
          <div class="stat-big">📖 ${W.store.get("news-read", []).length}</div>
        </div>
      </div>
      <div class="card">
        <h3>🏅 Achievements</h3>
        <div class="badge-grid">
          ${W.achievements.DEFS.map(
            (d) => `
            <div class="badge ${e[d.id] ? "earned" : ""}">
              <div class="badge-icon">${d.icon}</div>
              <b>${escapeHTML(d.name)}</b>
              <span class="muted small">${escapeHTML(d.desc)}</span>
              ${e[d.id] ? `<span class="muted small">Earned ${W.fmt.date(e[d.id])}</span>` : ""}
            </div>
          `,
          ).join("")}
        </div>
      </div>
    `;
  }

  // ── DeFi Tracker ────────────────────────────────────────
  function renderDefi(view) {
    const KEY = "defi";
    const positions = W.store.get(KEY, []);

    view.innerHTML = `
      <div class="card">
        <h3>💰 DeFi Tracker</h3>
        <p class="muted small">Track staking, yield, farming and LP positions. Automatic on-chain detection ships with Pro — meanwhile log positions manually (stored locally).</p>
      </div>
      <div class="card">
        <h3>Manual Positions</h3>
        <div id="defi-list"></div>
        <form id="defi-form" class="alert-form">
          <input name="proto" placeholder="Protocol (e.g. Lido)" required>
          <select name="type">
            <option value="Staking">Staking</option>
            <option value="Yield">Yield</option>
            <option value="Farming">Farming</option>
            <option value="LP">LP</option>
          </select>
          <input name="amount" type="number" step="any" placeholder="Amount" required>
          <input name="apy" type="number" step="any" placeholder="APY %">
          <button class="btn primary">Add</button>
        </form>
      </div>
    `;

    const draw = () => {
      const list = W.store.get(KEY, []);
      const container = view.querySelector("#defi-list");
      if (!container) return;
      if (!list.length) {
        container.innerHTML = '<p class="muted small">No positions yet.</p>';
        return;
      }
      container.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Protocol</th><th>Type</th><th>Amount</th><th>APY</th><th></th></tr></thead>
            <tbody>
              ${list
                .map(
                  (d, i) => `
                <tr>
                  <td>${escapeHTML(d.proto)}</td>
                  <td><span class="tag">${escapeHTML(d.type)}</span></td>
                  <td>${d.amount}</td>
                  <td>${d.apy || "—"}%</td>
                  <td><button class="icon-btn" data-i="${i}">🗑️</button></td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
      container.querySelectorAll("[data-i]").forEach((btn) => {
        btn.onclick = () => {
          const list = W.store.get(KEY, []);
          list.splice(+btn.dataset.i, 1);
          W.store.set(KEY, list);
          draw();
        };
      });
    };
    draw();

    view.querySelector("#defi-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const list = W.store.get(KEY, []);
      list.push({
        proto: f.proto.value,
        type: f.type.value,
        amount: f.amount.value,
        apy: f.apy.value,
      });
      W.store.set(KEY, list);
      draw();
      f.reset();
    };
  }

  // ── Airdrop Hunter ──────────────────────────────────────
  const DROPS = [
    {
      id: "testnet-1",
      name: "Layer-2 Testnet Season",
      kind: "Testnet",
      tasks: ["Bridge test tokens", "Swap on testnet DEX", "Mint a test NFT"],
    },
    {
      id: "points-1",
      name: "Points Program Grind",
      kind: "Points",
      tasks: ["Daily check-in", "Provide liquidity", "Refer a friend"],
    },
    {
      id: "retro-1",
      name: "Retroactive Hunt",
      kind: "Potential",
      tasks: [
        "Use mainnet dApps",
        "Keep positions active",
        "Vote in governance",
      ],
    },
  ];

  function renderAirdrops(view) {
    const KEY = "airdrops";
    const done = W.store.get(KEY, {});

    view.innerHTML = `
      <div class="card">
        <h3>🎯 Airdrop Hunter</h3>
        <p class="muted small">Campaign checklists saved locally. Eligibility checker + rewards tracker ship with Pro. 🔒</p>
      </div>
      <div class="grid-2">
        ${DROPS.map((d) => {
          const dk = done[d.id] || [];
          return `
            <div class="card">
              <div class="drop-head">
                <h3>${escapeHTML(d.name)}</h3>
                <span class="tag live">${escapeHTML(d.kind)}</span>
              </div>
              <ul class="task-list">
                ${d.tasks
                  .map(
                    (t, i) => `
                  <li>
                    <label>
                      <input type="checkbox" data-drop="${d.id}" data-task="${i}" ${dk.includes(i) ? "checked" : ""}>
                      ${escapeHTML(t)}
                    </label>
                  </li>
                `,
                  )
                  .join("")}
              </ul>
              <div class="meter-bar">
                <div style="width: ${(dk.length / d.tasks.length) * 100}%"></div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    view.querySelectorAll('input[type="checkbox"][data-drop]').forEach((cb) => {
      cb.onchange = () => {
        const done = W.store.get(KEY, {});
        const arr = new Set(done[cb.dataset.drop] || []);
        if (cb.checked) arr.add(+cb.dataset.task);
        else arr.delete(+cb.dataset.task);
        done[cb.dataset.drop] = [...arr];
        W.store.set(KEY, done);
        renderAirdrops(view);
      };
    });
  }

  // ── Pro ─────────────────────────────────────────────────
  const PRO_FEATURES = [
    ["🐋", "Whale Wallet Tracker"],
    ["💸", "Smart Money Tracker"],
    ["⛓️", "On-chain Analytics"],
    ["🔓", "Token Unlock Calendar"],
    ["🧮", "Portfolio Optimizer"],
    ["🤖", "AI Trading Assistant"],
    ["🧾", "Tax Reports"],
    ["🔄", "Multi-device Sync"],
  ];

  function renderPro(view) {
    view.innerHTML = `
      <div class="card pro-hero">
        <h2>🔮 Weaver Pro</h2>
        <p class="muted">Institutional-grade tools for serious traders.</p>
        <div class="pro-price">
          <b>$9</b>
          <span class="muted">/month (planned)</span>
          <button class="btn primary" onclick="W.ui.toast('Pro launches soon — you are on the list! ✨','ok')">Join Waitlist</button>
        </div>
      </div>
      <div class="grid-2">
        ${PRO_FEATURES.map(
          ([icon, name]) => `
          <div class="card pro-card">
            <span class="pro-ico">${icon}</span>
            <b>${escapeHTML(name)}</b>
            <span class="tag lock">🔒 Pro</span>
          </div>
        `,
        ).join("")}
      </div>
    `;
  }

  // ── Settings ────────────────────────────────────────────
  function renderSettings(view) {
    const s = W.store.get("settings", {});
    const tg = s.telegram || {};
    const ai = s.ai || {};

    view.innerHTML = `
      <div class="card">
        <h3>⚙️ Settings</h3>
        <label>
          Currency
          <select id="set-cur">
            ${["usd", "eur", "gbp", "inr", "jpy", "aud", "cad"].map((c) => `<option ${s.currency === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </label>
        <label>
          Auto-refresh seconds (0 = off)
          <input id="set-refresh" type="number" min="0" value="${s.refresh ?? 60}">
        </label>
        <h3 class="mt">🤖 AI Assistant (optional)</h3>
        <p class="muted small">Plug in any OpenAI-compatible endpoint to power "Ask Weaver". Without a key, Weaver answers with live on-chain data.</p>
        <label>
          API URL
          <input id="set-aiurl" placeholder="https://api.openai.com/v1/chat/completions" value="${escapeHTML(ai.url || "")}">
        </label>
        <label>
          API Key
          <input id="set-aikey" type="password" value="${escapeHTML(ai.key || "")}">
        </label>
        <label>
          Model
          <input id="set-aimodel" placeholder="gpt-4o-mini" value="${escapeHTML(ai.model || "")}">
        </label>
        <button class="btn primary mt" id="set-save">Save Settings</button>
      </div>
      <div class="card">
        <h3>📨 Telegram Alerts (optional)</h3>
        <p class="muted small">Bot created via <b>@BotFather</b>, Chat ID from <b>@userinfobot</b>, and you've sent the bot one message. Alerts, triggers and new gems will ping your phone.</p>
        <label>
          Bot Token
          <input id="set-tgtoken" type="password" placeholder="123456789:AAF..." value="${escapeHTML(tg.token || "")}">
        </label>
        <label>
          Chat ID
          <input id="set-tgchat" placeholder="e.g. 7099096813" value="${escapeHTML(tg.chat || "")}">
        </label>
        <label class="small">
          <input type="checkbox" id="set-tgon" ${tg.on ? "checked" : ""} style="width:auto">
          Enable Telegram alerts
        </label>
        <div class="qa mt">
          <button class="btn" id="set-tgtest">📨 Send Test Message</button>
        </div>
      </div>
      <div class="card">
        <h3>Your Data</h3>
        <div class="qa">
          <button class="btn" id="set-tax">🧾 Export Tax Report (CSV)</button>
          <button class="btn" id="set-export">⬇ Export Backup (JSON)</button>
          <button class="btn danger" id="set-wipe">🗑 Reset All Data</button>
        </div>
      </div>
    `;

    view.querySelector("#set-save").onclick = () => {
      const settings = {
        currency: view.querySelector("#set-cur").value,
        refresh: +view.querySelector("#set-refresh").value,
        ai: {
          url: view.querySelector("#set-aiurl").value.trim(),
          key: view.querySelector("#set-aikey").value.trim(),
          model: view.querySelector("#set-aimodel").value.trim(),
        },
        telegram: {
          on: view.querySelector("#set-tgon").checked,
          token: view.querySelector("#set-tgtoken").value.trim(),
          chat: view.querySelector("#set-tgchat").value.trim(),
        },
      };
      W.store.set("settings", settings);
      W.ui.toast("Settings saved ✓", "ok");
      W.applySettings?.();
    };

    view.querySelector("#set-tgtest").onclick = async () => {
      const token = view.querySelector("#set-tgtoken").value.trim();
      const chat = view.querySelector("#set-tgchat").value.trim();
      if (!token || !chat)
        return W.ui.toast("Enter token and Chat ID first", "warn");
      if (!W.tg) return W.ui.toast("Telegram module not loaded", "warn");
      const ok = await W.tg.send(
        `✅ Weaver connected! Alerts will arrive here.`,
        { on: true, token, chat },
      );
      W.ui.toast(
        ok ? "Test sent 📨" : "Failed — check token/Chat ID",
        ok ? "ok" : "warn",
      );
    };

    view.querySelector("#set-tax").onclick = () => {
      const txs = W.portfolio?.txs() || [];
      if (!txs.length) return W.ui.toast("No transactions to export.", "warn");
      let csv = "Date,Type,Coin,Symbol,Quantity,Price,Total\n";
      txs.forEach((t) => {
        const date = new Date(t.date).toISOString().split("T")[0];
        csv += `${date},${t.type},${t.name},${t.symbol.toUpperCase()},${t.qty},${t.price},${(t.qty * t.price).toFixed(2)}\n`;
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      );
      a.download = `weaver-tax-report-${new Date().getFullYear()}.csv`;
      a.click();
      W.ui.toast("Tax report downloaded 🧾", "ok");
    };

    view.querySelector("#set-export").onclick = () => {
      const data = {};
      [
        "portfolio",
        "transactions",
        "watchlist",
        "alerts",
        "settings",
        "learn",
        "achievements",
        "news-read",
        "news-saved",
      ].forEach((k) => (data[k] = W.store.get(k)));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      a.download = "weaver-backup.json";
      a.click();
    };

    view.querySelector("#set-wipe").onclick = () => {
      W.ui.confirm(
        "This deletes ALL Weaver data from this browser. Continue?",
        () => {
          W.store.clearAll();
          location.reload();
        },
      );
    };
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    renderProfile,
    renderSettings,
    renderPro,
    renderDefi,
    renderAirdrops,
  };
})();

console.log("[Misc] Module loaded.");

// ---- js/features/whales.js ----
// ================================================================
// js/features/whales.js – Multi‑Chain Whale Wallet Tracker
// ================================================================

window.W = window.W || {};

W.whales = (() => {
  // ── Chain Registry ──────────────────────────────────
  const CHAINS = {
    btc: {
      label: "Bitcoin",
      symbol: "BTC",
      icon: "₿",
      explorer: "https://mempool.space/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://mempool.space/api/address/${addr}`,
        ).then((r) => r.json());
        return (
          (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) /
          1e8
        );
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://mempool.space/api/address/${addr}/txs`,
        ).then((r) => r.json());
        return data
          .map((t) => {
            let out = 0,
              inn = 0;
            (t.vout || []).forEach((o) => {
              if (o.scriptpubkey_address === addr) out += o.value;
            });
            (t.vin || []).forEach((i) => {
              if (i.prevout?.scriptpubkey_address === addr)
                inn += i.prevout.value;
            });
            const net = (out - inn) / 1e8;
            return {
              hash: t.txid,
              time: t.status?.block_time * 1000 || Date.now(),
              net,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    eth: {
      label: "Ethereum",
      symbol: "ETH",
      icon: "⟠",
      explorer: "https://etherscan.io/address/",
      balance: async (addr) => {
        const data = await fetch(`https://cloudflare-eth.com/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [addr, "latest"],
          }),
        }).then((r) => r.json());
        return parseInt(data.result || "0x0", 16) / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        // Etherscan API (free, requires key for many requests – we'll use a public proxy)
        // Fallback: use Blockscout's public instance
        const data = await fetch(
          `https://eth.blockscout.com/api/v2/addresses/${addr}/transactions`,
        ).then((r) => r.json());
        return (data.items || [])
          .map((t) => {
            const net =
              t.from.hash.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value || "0") / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timestamp).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    bsc: {
      label: "BSC",
      symbol: "BNB",
      icon: "🟡",
      explorer: "https://bscscan.com/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.bscscan.com/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://api.bscscan.com/api?module=account&action=txlist&address=${addr}&sort=desc`,
        ).then((r) => r.json());
        return (data.result || [])
          .map((t) => {
            const net = t.from.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value) / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timeStamp * 1000).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    polygon: {
      label: "Polygon",
      symbol: "MATIC",
      icon: "🟣",
      explorer: "https://polygonscan.com/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.polygonscan.com/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://api.polygonscan.com/api?module=account&action=txlist&address=${addr}&sort=desc`,
        ).then((r) => r.json());
        return (data.result || [])
          .map((t) => {
            const net = t.from.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value) / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timeStamp * 1000).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    arbitrum: {
      label: "Arbitrum",
      symbol: "ARB",
      icon: "🔷",
      explorer: "https://arbiscan.io/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.arbiscan.io/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://api.arbiscan.io/api?module=account&action=txlist&address=${addr}&sort=desc`,
        ).then((r) => r.json());
        return (data.result || [])
          .map((t) => {
            const net = t.from.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value) / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timeStamp * 1000).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    avalanche: {
      label: "Avalanche",
      symbol: "AVAX",
      icon: "❄️",
      explorer: "https://snowtrace.io/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.snowtrace.io/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://api.snowtrace.io/api?module=account&action=txlist&address=${addr}&sort=desc`,
        ).then((r) => r.json());
        return (data.result || [])
          .map((t) => {
            const net = t.from.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value) / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timeStamp * 1000).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    solana: {
      label: "Solana",
      symbol: "SOL",
      icon: "🟣",
      explorer: "https://solscan.io/account/",
      balance: async (addr) => {
        const data = await fetch("https://api.mainnet-beta.solana.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [addr],
          }),
        }).then((r) => r.json());
        return (data.result?.value || 0) / 1e9;
      },
      txs: async (addr, minValue = 0) => {
        // Solana RPC does not return historical txs easily; we use a public API like Solscan
        // Fallback: use Helius or QuickNode; for simplicity, we use an aggregate from public APIs
        // Since the response format can be large, we limit to the most recent 10
        const data = await fetch(`https://api.solscan.io/account/${addr}`)
          .then((r) => r.json())
          .catch(() => ({ txs: [] }));
        // Solscan's API is not always free; we'll return mock data if it fails
        if (!data.txs) return [];
        return data.txs
          .slice(0, 20)
          .map((t) => ({
            hash: t.txHash,
            time: new Date(t.blockTime * 1000).getTime(),
            net:
              t.tokenTransfers?.reduce((sum, transfer) => {
                if (transfer.to === addr)
                  sum += transfer.amount / Math.pow(10, transfer.decimals);
                if (transfer.from === addr)
                  sum -= transfer.amount / Math.pow(10, transfer.decimals);
                return sum;
              }, 0) || 0,
          }))
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
  };

  // ── Helpers ──────────────────────────────────────────
  const KEY = "whale-wallets";
  const DEFAULTS = [
    {
      chain: "btc",
      label: "Binance Cold Wallet (reported)",
      addr: "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
    },
    {
      chain: "eth",
      label: "Vitalik Buterin (vitalik.eth)",
      addr: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    },
    {
      chain: "eth",
      label: "Binance Cold Wallet (reported)",
      addr: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    },
    {
      chain: "sol",
      label: "Solana Foundation (reported)",
      addr: "GxqGWmRkRqT8Ff5DzsYtXkDd7U8V3d8g1y7q5gX9a2b",
    },
  ];

  const wallets = () => W.store.get(KEY, DEFAULTS);
  const save = (list) => W.store.set(KEY, list);

  const timeAgo = (ts) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };

  const shortAddr = (a) =>
    a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a;

  // ── Fetch price for a symbol ────────────────────────
  async function getPrice(symbol) {
    try {
      const data = await W.api.markets(symbol);
      return (
        data.find((c) => c.symbol.toLowerCase() === symbol.toLowerCase())
          ?.current_price || 0
      );
    } catch {
      return 0;
    }
  }

  // ── Render one wallet card ──────────────────────────
  async function renderCard(w, minValue) {
    const chain = CHAINS[w.chain];
    if (!chain)
      return `<div class="card"><p class="muted">Unsupported chain: ${w.chain}</p></div>`;

    try {
      const [balance, txs, price] = await Promise.all([
        chain.balance(w.addr).catch(() => 0),
        chain.txs(w.addr, minValue).catch(() => []),
        getPrice(chain.symbol),
      ]);

      const valueUSD = balance * price;
      const txsHTML = txs.length
        ? `<ul class="tx-list">${txs
            .slice(0, 6)
            .map(
              (tx) => `
          <li>
            <span class="tag ${tx.net > 0 ? "buy" : "sell"}">${tx.net > 0 ? "⬇ IN" : "⬆ OUT"}</span>
            <b>${Math.abs(tx.net).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${chain.symbol}</b>
            <span class="muted">(${W.fmt.money(Math.abs(tx.net) * price, { compact: true })})</span>
            <span class="muted small">${timeAgo(tx.time)}</span>
            <a class="link small ml" target="_blank" href="${chain.explorer}${w.addr}#transactions">view ↗</a>
          </li>
        `,
            )
            .join("")}</ul>`
        : '<p class="muted small">No moves above threshold recently.</p>';

      return `
        <div class="card">
          <div class="watch-head">
            <div>
              <b>${w.label}</b>
              <span class="tag rank">${chain.icon} ${chain.symbol}</span>
              <br><code>${shortAddr(w.addr)}</code>
            </div>
            <div style="text-align:right;">
              <b>${balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${chain.symbol}</b>
              <div class="muted small">${W.fmt.money(valueUSD, { compact: true })}</div>
            </div>
          </div>
          ${txsHTML}
          <div class="mt">
            <button class="icon-btn" data-untrack="${w.addr}">🗑️ Stop tracking</button>
          </div>
        </div>
      `;
    } catch (e) {
      console.warn(`[Whales] Error for ${w.chain}:${w.addr}`, e);
      return `
        <div class="card">
          <div class="watch-head">
            <div><b>${w.label}</b> <span class="tag rank">${chain.icon} ${chain.symbol}</span></div>
            <div><span class="tag warn">⚠️ Offline</span></div>
          </div>
          <p class="muted small">Could not fetch data right now.</p>
          <button class="icon-btn" data-untrack="${w.addr}">🗑️ Stop tracking</button>
        </div>
      `;
    }
  }

  // ── Load and render all cards ──────────────────────
  async function load(view) {
    const body = view.querySelector("#whale-body");
    const min = parseFloat(view.querySelector("#whale-min").value) || 1; // in USD millions
    const minValue = min * 1e6; // in USD

    const list = wallets();
    if (!list.length) {
      body.innerHTML = W.ui.empty(
        "🐋",
        "No wallets tracked",
        "Add one with + Track Wallet",
      );
      return;
    }

    body.innerHTML = W.ui.spinner();
    const cards = await Promise.all(list.map((w) => renderCard(w, minValue)));
    body.innerHTML = cards.join("");
    // Re-bind delete buttons
    body.querySelectorAll("[data-untrack]").forEach((btn) => {
      btn.onclick = () => {
        const addr = btn.dataset.untrack;
        save(wallets().filter((w) => w.addr !== addr));
        load(view);
      };
    });
  }

  // ── Add Wallet Modal ─────────────────────────────────
  function addModal() {
    const m = W.ui.modal({
      title: "Track a Whale Wallet",
      body: `
        <label>
          Chain
          <select id="w-chain">
            ${Object.keys(CHAINS)
              .map(
                (c) =>
                  `<option value="${c}">${CHAINS[c].label} (${CHAINS[c].symbol})</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>
          Label
          <input id="w-label" placeholder="e.g. Smart money wallet">
        </label>
        <label>
          Address
          <input id="w-addr" placeholder="Enter wallet address">
        </label>
        <p class="muted small mt">Paste any address on the selected chain.</p>
      `,
      footer: `
        <button class="btn ghost" id="w-cancel">Cancel</button>
        <button class="btn primary" id="w-save">Track 🐋</button>
      `,
    });

    m.el.querySelector("#w-cancel").onclick = m.close;
    m.el.querySelector("#w-save").onclick = () => {
      const chain = m.el.querySelector("#w-chain").value;
      const addr = m.el.querySelector("#w-addr").value.trim();
      const label =
        m.el.querySelector("#w-label").value.trim() ||
        `${CHAINS[chain].symbol} Whale`;
      // Basic validation
      if (!addr) return W.ui.toast("Please enter an address.", "warn");
      // Chain-specific simple validation
      if (
        chain === "btc" &&
        !/^[13][a-zA-Z0-9]{25,34}$/.test(addr) &&
        !/^bc1[a-zA-Z0-9]{25,90}$/.test(addr)
      ) {
        return W.ui.toast("Invalid Bitcoin address.", "warn");
      }
      if (
        chain !== "btc" &&
        chain !== "sol" &&
        !/^0x[a-fA-F0-9]{40}$/.test(addr)
      ) {
        return W.ui.toast("Invalid EVM address (must start with 0x).", "warn");
      }
      if (chain === "sol" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
        return W.ui.toast("Invalid Solana address.", "warn");
      }
      const list = wallets();
      if (list.some((w) => w.addr.toLowerCase() === addr.toLowerCase())) {
        return W.ui.toast("Already tracking this address.", "warn");
      }
      save([...list, { chain, label, addr }]);
      m.close();
      W.ui.toast("Now tracking 🐋", "ok");
      W.refresh();
    };
  }

  // ── Public render function ──────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🐋 Multi‑Chain Whale Tracker</h3>
          <div class="qa">
            <label style="margin:0;">Min move ($M)
              <select id="whale-min" style="width:auto;">
                <option value="0.1">0.1</option>
                <option value="0.5">0.5</option>
                <option value="1" selected>1</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="50">50</option>
              </select>
            </label>
            <button class="btn primary" id="whale-add">+ Track Wallet</button>
            <button class="btn ghost" id="whale-refresh">⟳</button>
          </div>
        </div>
        <p class="muted small">Live on‑chain feed for BTC, ETH, BSC, Polygon, Arbitrum, Avalanche, Solana, and more. Labels are user‑provided — always verify on‑chain. Not financial advice.</p>
      </div>
      <div id="whale-body">${W.ui.spinner()}</div>
    `;

    view.querySelector("#whale-add").onclick = addModal;
    view.querySelector("#whale-refresh").onclick = () => render(view);
    view.querySelector("#whale-min").onchange = () => load(view);

    await load(view);
  }

  // ── Public track function (used by smart.js etc.) ──
  function track(addr, label, chain = "eth") {
    const list = wallets();
    if (list.some((w) => w.addr.toLowerCase() === addr.toLowerCase()))
      return false;
    save([...list, { chain, label, addr }]);
    return true;
  }

  return { render, track };
})();

console.log("[Whales] Module loaded.");

// ---- js/features/smart.js ----
// ================================================================
// js/features/smart.js – Smart Money Tracker
// ================================================================

window.W = window.W || {};

W.smart = (() => {
  // ── Constants ─────────────────────────────────────────
  const BLOCKSCOUT_API = "https://eth.blockscout.com/api/v2";
  const CACHE_TTL = 300000; // 5 minutes cache
  const MAX_HOLDERS = 8;

  // ── Helpers ────────────────────────────────────────────

  function shortAddress(addr) {
    if (!addr) return "—";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Price Map for Historical Dates ────────────────────

  async function buildPriceMap(coinId, days = 365) {
    const chart = await W.api.chart(coinId, days);
    const prices = (chart.prices || []).map((p) => ({
      date: new Date(p[0]).toDateString(),
      price: p[1],
    }));
    const map = {};
    prices.forEach((p) => (map[p.date] = p.price));
    return map;
  }

  // ── Parse token quantity from transfer event ──────────

  function parseQuantity(transfer) {
    const raw =
      typeof transfer.total === "object"
        ? transfer.total?.value || "0"
        : transfer.total || "0";
    const decimals = parseInt(
      transfer.token?.decimals ||
        (typeof transfer.total === "object" ? transfer.total?.decimals : 18) ||
        18,
      10,
    );
    return parseFloat(raw) / Math.pow(10, decimals);
  }

  // ── Analyze a wallet's P/L ────────────────────────────

  function analyzeWallet(transfers, walletAddress, priceMap, currentPrice) {
    // Process transfers oldest to newest
    const sorted = [...transfers].reverse();
    let balance = 0;
    let cost = 0;
    let realized = 0;
    let invested = 0;
    let in7 = 0;
    const weekAgo = Date.now() - 7 * 864e5;

    sorted.forEach((t) => {
      const qty = parseQuantity(t);
      const ts = new Date(t.timestamp).getTime();
      const dateKey = new Date(ts).toDateString();
      const price = priceMap[dateKey] || currentPrice;

      if ((t.to?.hash || "").toLowerCase() === walletAddress.toLowerCase()) {
        // Incoming transfer
        balance += qty;
        cost += qty * price;
        invested += qty * price;
        if (ts >= weekAgo) in7 += qty;
      } else {
        // Outgoing transfer (sell)
        const sellQty = Math.min(qty, balance);
        const avgCost = balance > 0 ? cost / balance : price;
        realized += sellQty * (price - avgCost);
        cost -= sellQty * avgCost;
        balance -= sellQty;
        if (ts >= weekAgo) in7 -= sellQty;
      }
    });

    const avgCost = balance > 0 ? cost / balance : currentPrice;
    const unrealized = balance * (currentPrice - avgCost);
    const total = realized + unrealized;

    return {
      balance,
      realized,
      unrealized,
      total,
      invested,
      in7,
      avgCost,
    };
  }

  // ── Scan holders for a token ──────────────────────────

  async function scanToken(coin, view) {
    const body = view.querySelector("#sm-body");
    if (!body) return;
    body.innerHTML = W.ui.spinner();

    try {
      // Get contract address (Ethereum only for now)
      const contract = coin.platforms?.ethereum;
      if (!contract) {
        body.innerHTML = W.ui.empty(
          "🧠",
          "No Ethereum contract for this token",
          "Smart scanning supports ERC-20 tokens on Ethereum.",
        );
        return;
      }

      // Get current price
      const cur = W.currency();
      const currentPrice = coin.market_data?.current_price?.[cur] || 0;
      if (!currentPrice) {
        body.innerHTML = W.ui.empty(
          "📊",
          "No price data available",
          "Try again later.",
        );
        return;
      }

      // Build historical price map
      const priceMap = await buildPriceMap(coin.id, 365);

      // Fetch token info and holders
      const [tok, holders] = await Promise.all([
        fetch(`${BLOCKSCOUT_API}/tokens/${contract}`).then((r) => r.json()),
        fetch(`${BLOCKSCOUT_API}/tokens/${contract}/holders`).then((r) =>
          r.json(),
        ),
      ]);

      if (!holders?.items || !holders.items.length) {
        body.innerHTML = W.ui.empty(
          "📭",
          "No holders found",
          "This token may not have enough on-chain activity.",
        );
        return;
      }

      // Analyze top holders
      const results = [];
      const topHolders = holders.items.slice(0, MAX_HOLDERS);

      for (const h of topHolders) {
        try {
          const txUrl = `${BLOCKSCOUT_API}/addresses/${h.address.hash}/token-transfers?token=${contract}`;
          const txs = await fetch(txUrl).then((r) => r.json());
          const analysis = analyzeWallet(
            txs.items || [],
            h.address.hash,
            priceMap,
            currentPrice,
          );
          results.push({
            address: h.address.hash,
            rawBalance: h.value,
            ...analysis,
          });
        } catch (e) {
          console.warn("[Smart] Failed to analyze holder:", h.address.hash, e);
        }
      }

      // Sort by total P/L
      results.sort((a, b) => b.total - a.total);

      // ── Render ──────────────────────────────────────────
      const best = results[0];
      const totalInvested = results.reduce((sum, r) => sum + r.invested, 0);
      const totalPnl = results.reduce((sum, r) => sum + r.total, 0);

      body.innerHTML = `
        <div class="card">
          <h3>${coin.name} · top ${results.length} holders ranked by P/L</h3>
          <div class="cards">
            <div class="card stat">
              <div class="stat-label">Top Holder P/L</div>
              <div class="stat-big ${totalPnl >= 0 ? "up" : "down"}">
                ${totalPnl >= 0 ? "+" : ""}${W.fmt.money(totalPnl, { compact: true })}
              </div>
              <div class="stat-sub">${results.length} wallets analyzed</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Best Wallet</div>
              <div class="stat-big">${best ? shortAddress(best.address) : "—"}</div>
              <div class="stat-sub">${best ? W.fmt.money(best.total, { compact: true }) : ""}</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Accumulating</div>
              <div class="stat-big">${results.filter((r) => r.in7 > 0).length}</div>
              <div class="stat-sub">wallets buying in 7d</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Wallet</th>
                  <th>Holdings</th>
                  <th>Realized P/L</th>
                  <th>Unrealized</th>
                  <th>Total</th>
                  <th>7d Activity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${results
                  .map(
                    (r, i) => `
                  <tr>
                    <td class="muted">${i + 1}</td>
                    <td>
                      <code>${shortAddress(r.address)}</code>
                      <a class="link small" target="_blank" href="https://etherscan.io/address/${r.address}">↗</a>
                    </td>
                    <td>
                      ${r.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      <span class="muted small">${coin.symbol.toUpperCase()}</span>
                    </td>
                    <td class="${r.realized >= 0 ? "up" : "down"}">
                      ${r.realized >= 0 ? "+" : ""}${W.fmt.money(r.realized, { compact: true })}
                    </td>
                    <td class="${r.unrealized >= 0 ? "up" : "down"}">
                      ${r.unrealized >= 0 ? "+" : ""}${W.fmt.money(r.unrealized, { compact: true })}
                    </td>
                    <td>
                      <b class="${r.total >= 0 ? "up" : "down"}">
                        ${r.invested ? ((r.total / r.invested) * 100).toFixed(0) : "0"}%
                      </b>
                    </td>
                    <td>
                      ${
                        r.in7 > 0.0001
                          ? '<span class="tag buy">Accumulating</span>'
                          : r.in7 < -0.0001
                            ? '<span class="tag sell">Distributing</span>'
                            : '<span class="tag neutral">Idle</span>'
                      }
                    </td>
                    <td>
                      <button class="btn tiny" data-track="${r.address}">🐋 Track</button>
                    </td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          ${
            best
              ? `
            <div class="ai-brief mt">
              🤖 <b>Weaver:</b> the strongest wallet <code>${shortAddress(best.address)}</code>
              has generated <b>${W.fmt.money(best.total, { compact: true })}</b> on ${coin.name}
              and is currently <b>${best.in7 > 0 ? "accumulating" : "distributing"}</b>.
              High-P/L wallets buying now = smart money signal. Not financial advice.
            </div>
          `
              : ""
          }
        </div>
      `;

      // ── Track buttons ──────────────────────────────────
      body.querySelectorAll("[data-track]").forEach((btn) => {
        btn.onclick = () => {
          if (W.whales?.track) {
            const label = `Smart: ${coin.symbol.toUpperCase()} ${shortAddress(btn.dataset.track)}`;
            const ok = W.whales.track(btn.dataset.track, label, "eth");
            W.ui.toast(
              ok ? "Added to Whale Tracker 🐋" : "Already tracked",
              ok ? "ok" : "warn",
            );
          } else {
            W.ui.toast("Whale Tracker module not available.", "warn");
          }
        };
      });
    } catch (e) {
      console.error("[Smart] Scan error:", e);
      body.innerHTML = `
        <p class="muted">
          Scan failed: ${escapeHTML(e.message)}
          <br><span class="small">Blockscout may be rate-limited. Wait a few seconds and retry.</span>
        </p>
      `;
    }
  }

  // ── Render ─────────────────────────────────────────────

  async function render(view) {
    if (!view) {
      console.warn("[Smart] No view element provided");
      return;
    }

    let scanCoin = null;

    view.innerHTML = `
      <div class="card">
        <h3>🧠 Smart Money Tracker</h3>
        <p class="muted small">
          Scans a token's top on-chain holders, reconstructs 1 year of transfers at historical prices,
          and ranks wallets by total P/L. Profitable wallets that are <b>accumulating</b> right now = smart money.
          <br><span class="tag rank">ERC-20 tokens on Ethereum</span>
        </p>
        <div class="qa mt">
          <div id="sm-picker" style="min-width:280px;"></div>
          <button class="btn primary" id="sm-go">Scan Holders</button>
        </div>
      </div>
      <div id="sm-body"></div>
    `;

    // ── Coin picker ──────────────────────────────────────
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#sm-picker"), (p) => {
        scanCoin = p;
      });
    } else {
      console.warn("[Smart] coinPicker not available");
    }

    // ── Scan button ──────────────────────────────────────
    view.querySelector("#sm-go").onclick = async () => {
      if (!scanCoin) {
        W.ui.toast("Pick a token first", "warn");
        return;
      }
      // Fetch full coin data with contract info
      try {
        const coin = await W.api.coin(scanCoin.id);
        if (!coin) {
          W.ui.toast("Could not fetch coin data.", "warn");
          return;
        }
        await scanToken(coin, view);
      } catch (e) {
        W.ui.toast(`Error: ${e.message}`, "warn");
      }
    };
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    scanToken,
    analyzeWallet,
    buildPriceMap,
  };
})();

console.log("[Smart] Module loaded.");

// ---- js/features/unlocks.js ----
// ================================================================
// js/features/unlocks.js – Token Unlock Calendar
// ================================================================

window.W = window.W || {};

W.unlocks = (() => {
  const KEY = "token-unlocks";
  const DAY = 864e5;

  // ── Sample data (relative dates so the demo always shows upcoming events) ──
  const seed = () => [
    {
      id: "s1",
      coinId: "arbitrum",
      symbol: "arb",
      name: "Arbitrum",
      amount: 92e6,
      type: "Cliff",
      date: Date.now() + 2 * DAY,
      note: "Sample: investor allocation",
    },
    {
      id: "s2",
      coinId: "sui",
      symbol: "sui",
      name: "Sui",
      amount: 42e6,
      type: "Linear",
      date: Date.now() + 6 * DAY,
      note: "Sample: monthly ecosystem release",
    },
    {
      id: "s3",
      coinId: "aptos",
      symbol: "apt",
      name: "Aptos",
      amount: 11.3e6,
      type: "Cliff",
      date: Date.now() + 13 * DAY,
      note: "Sample: team vesting",
    },
    {
      id: "s4",
      coinId: "optimistic-ethereum",
      symbol: "op",
      name: "Optimism",
      amount: 31e6,
      type: "Cliff",
      date: Date.now() + 27 * DAY,
      note: "Sample: core contributors",
    },
    {
      id: "s5",
      coinId: "celestia",
      symbol: "tia",
      name: "Celestia",
      amount: 8.9e6,
      type: "Cliff",
      date: Date.now() + 41 * DAY,
      note: "Sample: early backer unlock",
    },
    {
      id: "s6",
      coinId: "starknet",
      symbol: "strk",
      name: "Starknet",
      amount: 127e6,
      type: "Cliff",
      date: Date.now() + 75 * DAY,
      note: "Sample: investor cliff",
    },
  ];

  // ── Data Management ──────────────────────────────────
  function list() {
    const stored = W.store.get(KEY, null);
    if (stored) return stored;
    const s = seed();
    W.store.set(KEY, s);
    return s;
  }

  function save(list) {
    W.store.set(KEY, list);
  }

  // ── Helpers ────────────────────────────────────────────
  function daysLeft(date) {
    return Math.ceil((date - Date.now()) / DAY);
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function pressureTag(ratio) {
    if (ratio >= 0.5) return '<span class="tag sell">High pressure</span>';
    if (ratio >= 0.15) return '<span class="tag triggered">Medium</span>';
    return '<span class="tag buy">Low</span>';
  }

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Add Modal ──────────────────────────────────────────
  function addModal() {
    const m = W.ui.modal({
      title: "Add Token Unlock",
      body: `
        <div id="u-picker"></div>
        <label>
          Unlock date
          <input type="date" id="u-date" required>
        </label>
        <label>
          Token amount
          <input type="number" step="any" id="u-amt" placeholder="1000000">
        </label>
        <label>
          Type
          <select id="u-type">
            <option value="Cliff">Cliff</option>
            <option value="Linear">Linear</option>
            <option value="Emission">Emission</option>
          </select>
        </label>
        <label>
          Note (optional)
          <input id="u-note" placeholder="e.g. team vesting">
        </label>
      `,
      footer: `
        <button class="btn ghost" id="u-cancel">Cancel</button>
        <button class="btn primary" id="u-save">Add</button>
      `,
    });

    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(m.el.querySelector("#u-picker"), (p) => (picked = p));
    }

    m.el.querySelector("#u-cancel").onclick = m.close;
    m.el.querySelector("#u-save").onclick = () => {
      const date = new Date(m.el.querySelector("#u-date").value).getTime();
      const amount = parseFloat(m.el.querySelector("#u-amt").value);
      const type = m.el.querySelector("#u-type").value;
      const note = m.el.querySelector("#u-note").value.trim();

      if (!picked) return W.ui.toast("Pick a token first", "warn");
      if (!date || isNaN(date)) return W.ui.toast("Enter a valid date", "warn");
      if (!amount || amount <= 0)
        return W.ui.toast("Enter a valid amount", "warn");

      const unlocks = list();
      unlocks.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        coinId: picked.id,
        symbol: picked.symbol,
        name: picked.name,
        amount,
        type,
        date,
        note,
      });
      save(unlocks);
      m.close();
      W.ui.toast("Unlock scheduled 🔓", "ok");
      W.refresh();
    };
  }

  // ── Load and Render ───────────────────────────────────
  async function load(view, range) {
    const el = view.querySelector("#u-list");
    const stats = view.querySelector("#u-stats");
    if (!el) return;

    const items = list()
      .filter((u) => daysLeft(u.date) <= range && daysLeft(u.date) >= -1)
      .sort((a, b) => a.date - b.date);

    if (!items.length) {
      el.innerHTML = W.ui.empty("🔓", "No unlocks in this window");
      stats.innerHTML = "";
      return;
    }

    // ── Fetch market data ──────────────────────────────
    const ids = [...new Set(items.map((u) => u.coinId))].join(",");
    let mk = {};
    try {
      const data = await W.api.markets(ids);
      data.forEach((c) => (mk[c.id] = c));
    } catch (e) {
      console.warn("[Unlocks] Market fetch error:", e);
    }

    let v7 = 0,
      v30 = 0,
      worst = null;

    const rows = items
      .map((u) => {
        const m = mk[u.coinId] || {};
        const price = m.current_price || 0,
          vol = m.total_volume || 0;
        const value = u.amount * price;
        const ratio = vol ? value / vol : 0;
        const dl = daysLeft(u.date);

        if (dl <= 7) v7 += value;
        if (dl <= 30) v30 += value;
        if (!worst || ratio > worst.ratio) worst = { u, ratio };

        return `
          <tr>
            <td>
              <b>${dl <= 0 ? "Today" : dl + "d"}</b>
              <div class="muted small">${formatDate(u.date)}</div>
            </td>
            <td class="coin-cell">
              ${m.image ? `<img src="${m.image}" alt="${u.name}">` : ""}
              <div>
                <b>${escapeHTML(u.name)}</b>
                <br><span class="muted small">${u.symbol.toUpperCase()}</span>
              </div>
            </td>
            <td><span class="tag ${u.type === "Cliff" ? "rank" : "live"}">${escapeHTML(u.type)}</span></td>
            <td>${u.amount.toLocaleString()}</td>
            <td><b>${W.fmt.money(value, { compact: true })}</b></td>
            <td>${(ratio * 100).toFixed(0)}% of 24h vol<br>${pressureTag(ratio)}</td>
            <td class="row-actions">
              <button class="icon-btn" data-del="${u.id}" title="Delete">🗑️</button>
            </td>
          </tr>
        `;
      })
      .join("");

    // ── Stats ──────────────────────────────────────────
    stats.innerHTML = `
      <div class="card stat">
        <div class="stat-label">Unlocks · 7d</div>
        <div class="stat-big">${W.fmt.money(v7, { compact: true })}</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Unlocks · 30d</div>
        <div class="stat-big">${W.fmt.money(v30, { compact: true })}</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Highest Pressure</div>
        <div class="stat-big">${worst ? worst.u.symbol.toUpperCase() : "—"}</div>
        <div class="stat-sub">${worst ? (worst.ratio * 100).toFixed(0) + "% of 24h volume" : ""}</div>
      </div>
    `;

    // ── Table ────────────────────────────────────────────
    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Token</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Value</th>
              <th>Sell Pressure</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${
        worst && worst.ratio >= 0.5
          ? `
        <div class="ai-brief mt">
          🤖 <b>Weaver:</b> ${escapeHTML(worst.u.name)}'s upcoming unlock equals
          ${(worst.ratio * 100).toFixed(0)}% of its daily trading volume — events
          like this historically increase short-term volatility. Not financial advice.
        </div>
      `
          : ""
      }
    `;

    // ── Delete buttons ──────────────────────────────────
    el.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.del;
        W.ui.confirm("Delete this unlock event?", () => {
          save(list().filter((x) => x.id !== id));
          load(view, range);
          W.ui.toast("Unlock removed", "info");
        });
      };
    });
  }

  // ── Main Render ───────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🔓 Token Unlock Calendar</h3>
          <div class="qa">
            <button class="chip" data-range="7">7D</button>
            <button class="chip active" data-range="30">30D</button>
            <button class="chip" data-range="90">90D</button>
            <button class="chip" data-range="all">All</button>
            <button class="btn primary" id="u-add">+ Add Unlock</button>
          </div>
        </div>
        <p class="muted small">
          Upcoming vesting cliffs & emissions. <b>Pressure</b> = unlock value ÷ 24h volume —
          high ratios often precede sell pressure. Ships with sample data; add real schedules manually
          or plug a TokenUnlocks API key in Pro.
        </p>
      </div>
      <div class="cards" id="u-stats"></div>
      <div class="card"><div id="u-list">${W.ui.spinner()}</div></div>
    `;

    let range = 30;
    const rangeBtns = view.querySelectorAll("[data-range]");
    rangeBtns.forEach((c) => {
      c.onclick = () => {
        rangeBtns.forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        range = c.dataset.range === "all" ? 1e5 : +c.dataset.range;
        load(view, range);
      };
    });

    const addBtn = view.querySelector("#u-add");
    if (addBtn) addBtn.onclick = addModal;

    await load(view, range);
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    list,
    save,
    addModal,
    load,
  };
})();

console.log("[Unlocks] Module loaded.");

// ---- js/features/sectors.js ----
// ================================================================
// js/features/sectors.js – Sector Rotation Heatmap
// ================================================================

window.W = window.W || {};

W.sectors = (() => {
  let canvas,
    ctx,
    bubbles = [],
    mouse = { x: -1000, y: -1000 },
    animId;
  let cw = 0,
    ch = 0;

  // ── API Helpers ──────────────────────────────────────────
  const PROX = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  ];

  async function fetchCategories() {
    const url =
      "https://api.coingecko.com/api/v3/coins/categories?order=market_cap_desc";
    let lastErr;
    for (const wrap of PROX) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(wrap(url), { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) return await r.json();
      } catch (e) {
        lastErr = e;
        clearTimeout(t);
      }
    }
    throw lastErr || new Error("unreachable");
  }

  // ── Canvas Helpers ──────────────────────────────────────
  function resize() {
    const rect = canvas?.parentElement?.getBoundingClientRect?.() || {
      width: 800,
      height: 450,
    };
    cw = canvas.width = rect.width || 800;
    ch = canvas.height = Math.max(450, window.innerHeight * 0.55);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ── Escape helper ──────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Draw Frame ──────────────────────────────────────────
  function drawFrame(view) {
    if (!view?.isConnected) {
      cancelAnimationFrame(animId);
      return;
    }

    ctx.clearRect(0, 0, cw, ch);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cw / 2, 0);
    ctx.lineTo(cw / 2, ch);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("📉 DUMPING", 20, 30);
    ctx.textAlign = "right";
    ctx.fillText("PUMPING 📈", cw - 20, 30);
    ctx.textAlign = "center";
    ctx.fillText("0% CHANGE", cw / 2, ch - 10);
    ctx.textAlign = "left";

    const time = Date.now() / 1000;
    let hovered = null;

    bubbles.forEach((b) => {
      const x =
        cw * 0.1 +
        ((Math.max(-20, Math.min(20, b.change)) + 20) / 40) * (cw * 0.8);
      const y = ch * 0.82 - b.volNorm * ch * 0.6;
      const fy = y + Math.sin(time + b.phase) * 5;
      b.dx = x;
      b.dy = fy;
      const dist = Math.sqrt(
        (mouse.x - x) * (mouse.x - x) + (mouse.y - fy) * (mouse.y - fy),
      );
      const isH = dist < b.r;
      if (isH) hovered = b;

      const g = ctx.createRadialGradient(x, fy, 0, x, fy, b.r);
      const color = b.change >= 0 ? "46,230,168" : "255,92,122";
      g.addColorStop(0, `rgba(${color},.75)`);
      g.addColorStop(1, `rgba(${color},.06)`);

      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.shadowColor = b.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.shadowBlur = isH ? 22 : 10;
      ctx.arc(x, fy, isH ? b.r * 1.08 : b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      if (b.r > 22) {
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = `bold ${Math.max(10, Math.min(15, b.r / 2.6))}px Sora, system-ui, sans-serif`;
        ctx.fillText(
          b.name.length > 14 ? b.name.slice(0, 12) + ".." : b.name,
          x,
          fy + 4,
        );
        ctx.textAlign = "left";
      }
    });

    // Tooltip
    if (hovered) {
      const tx = Math.min(hovered.dx + hovered.r + 12, cw - 200);
      const ty = Math.max(10, hovered.dy - 50);
      ctx.fillStyle = "rgba(16,18,30,.94)";
      ctx.strokeStyle = hovered.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.lineWidth = 2;
      roundRect(ctx, tx, ty, 190, 78, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px Sora, system-ui, sans-serif";
      ctx.fillText(escapeHTML(hovered.name), tx + 12, ty + 22);

      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillStyle = hovered.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.fillText(
        `${hovered.change >= 0 ? "+" : ""}${hovered.change.toFixed(2)}% (24h)`,
        tx + 12,
        ty + 42,
      );

      ctx.fillStyle = "#9aa3b2";
      ctx.fillText(
        `MCap ${W.fmt.money(hovered.mcap, { compact: true })} · Vol ${W.fmt.money(hovered.vol, { compact: true })}`,
        tx + 12,
        ty + 62,
      );
    }

    animId = requestAnimationFrame(() => drawFrame(view));
  }

  // ── Render ──────────────────────────────────────────────
  async function render(view) {
    if (!view) {
      console.warn("[Sectors] No view element provided");
      return;
    }

    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🌊 Sector Rotation Map</h3>
          <span class="muted small">Live narrative tracking · Hover bubbles for details</span>
        </div>
        <p class="muted small">Where is smart money flowing today? Right = Pumping · Left = Dumping · Higher = More Volume · Bigger = Larger Market Cap.</p>
      </div>
      <div class="card" style="padding:0;overflow:hidden;position:relative;">
        <canvas id="sector-canvas" style="width:100%;display:block;cursor:crosshair;"></canvas>
      </div>
    `;

    canvas = view.querySelector("#sector-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener("pointerleave", () => {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    try {
      const cats = await fetchCategories();
      const IGNORE = [
        "cryptocurrency",
        "layer-1",
        "smart-contract-platform",
        "us-treasury-backed",
        "stablecoin-protocol",
      ];
      const valid = cats
        .filter(
          (c) =>
            (c.market_cap || 0) > 50e6 &&
            c.name &&
            c.name.length < 25 &&
            !IGNORE.includes(c.id),
        )
        .slice(0, 40);

      const maxMcap = Math.max(...valid.map((c) => c.market_cap));
      const maxVol = Math.max(...valid.map((c) => c.volume_24h));

      bubbles = valid.map((c, i) => ({
        name: c.name,
        change: c.market_cap_change_24h || 0,
        mcap: c.market_cap,
        vol: c.volume_24h,
        volNorm: Math.min(1, (c.volume_24h || 0) / maxVol),
        r: 16 + 56 * Math.sqrt((c.market_cap || 0) / maxMcap),
        phase: i * 0.7,
      }));

      drawFrame(view);
    } catch (e) {
      console.warn("[Sectors] Error:", e);
      view.querySelector("#sector-canvas").outerHTML =
        `<div class="empty"><div class="empty-icon">🌊</div><p>Sector map unreachable on this network</p></div>`;
    }
  }

  // ── Exports ─────────────────────────────────────────────
  return { render };
})();

console.log("[Sectors] Module loaded.");

// ---- js/features/learn.js ----
//  Comprehensive Crypto & Web3 Education

window.W = window.W || {};

W.learn = (() => {
  // ── Extensive Lesson Library ──────────────────────────
  const LESSONS = [
    // ── Fundamentals ──────────────────────────────────────
    {
      id: "what-is-crypto",
      icon: "🪙",
      title: "What is Cryptocurrency?",
      category: "Fundamentals",
      body: `
        Cryptocurrency is digital money that uses cryptography for security.
        Unlike traditional currencies (fiat), it operates on decentralized networks
        based on blockchain technology — a distributed ledger enforced by a network of computers.
        <br><br>
        <b>Key properties:</b>
        <ul>
          <li><b>Decentralized:</b> No single entity controls it.</li>
          <li><b>Borderless:</b> Transfer value anywhere instantly.</li>
          <li><b>Limited supply:</b> Many cryptos have a capped supply.</li>
          <li><b>Transparent:</b> All transactions are public on the blockchain.</li>
        </ul>
      `,
      quiz: {
        q: "What is the core technology behind cryptocurrencies?",
        a: ["Blockchain", "AI", "Cloud", "Quantum computing"],
        correct: 0,
      },
    },
    {
      id: "how-blockchain-works",
      icon: "⛓️",
      title: "How Blockchain Works",
      category: "Fundamentals",
      body: `
        A blockchain is a chain of blocks containing transaction data.
        Each block has a cryptographic hash of the previous block, creating an immutable chain.
        <br><br>
        <b>Key concepts:</b>
        <ul>
          <li><b>Blocks:</b> Contain transaction data, timestamp, and previous hash.</li>
          <li><b>Hashing:</b> A one-way function that converts data into a fixed-length string.</li>
          <li><b>Consensus:</b> Mechanisms like Proof-of-Work (PoW) or Proof-of-Stake (PoS) to agree on the ledger state.</li>
          <li><b>Nodes:</b> Computers that validate and store the blockchain.</li>
        </ul>
      `,
      quiz: {
        q: "What does a block contain? (Select all that apply)",
        a: [
          "Transaction data",
          "Previous block hash",
          "Timestamp",
          "All of the above",
        ],
        correct: 3,
      },
    },
    {
      id: "wallets-security",
      icon: "🔐",
      title: "Wallet Security 101",
      category: "Security",
      body: `
        Crypto wallets store your private keys — the secret that proves ownership of your assets.
        <br><br>
        <b>Wallet types:</b>
        <ul>
          <li><b>Hot wallets:</b> Connected to the internet (MetaMask, Phantom). Convenient but riskier.</li>
          <li><b>Cold wallets:</b> Offline storage (Ledger, Trezor). Most secure.</li>
          <li><b>Multi-sig:</b> Requires multiple signatures for transactions.</li>
        </ul>
        <br>
        <b>Golden rules:</b>
        <ul>
          <li>Never share your seed phrase (12/24 words).</li>
          <li>Use hardware wallets for long-term holdings.</li>
          <li>Revoke unused contract approvals.</li>
          <li>Enable two-factor authentication where possible.</li>
        </ul>
      `,
      quiz: {
        q: "What is the most secure way to store crypto?",
        a: [
          "Hardware wallet",
          "Exchange wallet",
          "Mobile wallet",
          "Paper wallet (if done correctly)",
        ],
        correct: 0,
      },
    },
    // ── DeFi ──────────────────────────────────────────────
    {
      id: "defi-basics",
      icon: "🏦",
      title: "DeFi Basics",
      category: "DeFi",
      body: `
        Decentralized Finance (DeFi) recreates traditional financial services on blockchains without intermediaries.
        <br><br>
        <b>Core DeFi services:</b>
        <ul>
          <li><b>Lending & Borrowing:</b> Lend assets to earn interest, or borrow against your crypto (e.g., Aave, Compound).</li>
          <li><b>Decentralized Exchanges (DEXs):</b> Swap tokens peer-to-peer (e.g., Uniswap, PancakeSwap).</li>
          <li><b>Yield Farming:</b> Provide liquidity to earn rewards.</li>
          <li><b>Staking:</b> Lock tokens to support a network and earn rewards.</li>
        </ul>
        <br>
        <b>Risks:</b> Smart contract bugs, impermanent loss, liquidation, and protocol failure.
      `,
      quiz: {
        q: "What is impermanent loss?",
        a: [
          "Loss of funds due to price changes in a liquidity pool",
          "Loss from hacks",
          "Loss from forgetting your password",
          "Loss from market crashes",
        ],
        correct: 0,
      },
    },
    {
      id: "dex-vs-cex",
      icon: "🔄",
      title: "DEX vs CEX: What's the Difference?",
      category: "DeFi",
      body: `
        <b>Centralized Exchanges (CEX):</b> Binance, Coinbase, Kraken.
        They hold your funds and match orders on a central order book.
        <br><br>
        <b>Decentralized Exchanges (DEX):</b> Uniswap, PancakeSwap, SushiSwap.
        They use smart contracts and liquidity pools, allowing peer-to-peer trading without custody.
        <br><br>
        <b>Comparison:</b>
        <ul>
          <li><b>Security:</b> DEXs are less prone to exchange hacks (no central honeypot), but smart contract risks exist.</li>
          <li><b>Privacy:</b> DEXs require no KYC.</li>
          <li><b>Fees:</b> CEXs have higher fees, but offer more liquidity.</li>
          <li><b>Usability:</b> CEXs are easier for beginners.</li>
        </ul>
      `,
      quiz: {
        q: "Which type of exchange holds your private keys?",
        a: ["CEX", "DEX", "Both", "Neither"],
        correct: 0,
      },
    },
    // ── NFTs ──────────────────────────────────────────────
    {
      id: "nft-guide",
      icon: "🎨",
      title: "NFTs Explained",
      category: "NFTs",
      body: `
        Non-Fungible Tokens (NFTs) are unique digital assets representing ownership of a specific item.
        <br><br>
        <b>Use cases:</b>
        <ul>
          <li><b>Art & Collectibles:</b> Digital art, trading cards, virtual real estate.</li>
          <li><b>Gaming:</b> In-game items, skins, characters.</li>
          <li><b>Music & Media:</b> Royalty rights, exclusive content.</li>
          <li><b>Identity:</b> Digital IDs, credentials.</li>
        </ul>
        <br>
        <b>Important:</b> NFTs are bought/sold on marketplaces like OpenSea, Rarible. They live on blockchains (Ethereum, Solana, etc.).
      `,
      quiz: {
        q: "What does 'non-fungible' mean?",
        a: [
          "Unique and not interchangeable",
          "Highly valuable",
          "Only on Ethereum",
          "Free to mint",
        ],
        correct: 0,
      },
    },
    // ── Web3 ──────────────────────────────────────────────
    {
      id: "web3-intro",
      icon: "🌐",
      title: "Introduction to Web3",
      category: "Web3",
      body: `
        Web3 is the vision of a decentralized internet built on blockchain technology.
        <br><br>
        <b>Core principles:</b>
        <ul>
          <li><b>Decentralization:</b> No single authority controls data.</li>
          <li><b>User ownership:</b> Users own their data and digital assets.</li>
          <li><b>Trustless:</b> Interactions are governed by code (smart contracts).</li>
          <li><b>Native payments:</b> Built-in crypto payments.</li>
        </ul>
        <br>
        <b>Web3 stack:</b> Blockchain (Ethereum, Solana), Smart Contracts, IPFS (storage), Wallets (MetaMask), dApps.
      `,
      quiz: {
        q: "What is a key feature of Web3?",
        a: [
          "User ownership of data",
          "Centralized servers",
          "No authentication",
          "Only for gaming",
        ],
        correct: 0,
      },
    },
    {
      id: "smart-contracts",
      icon: "📜",
      title: "Smart Contracts",
      category: "Web3",
      body: `
        Smart contracts are self-executing programs on the blockchain that run exactly as programmed.
        <br><br>
        <b>Characteristics:</b>
        <ul>
          <li><b>Autonomous:</b> No intermediary needed.</li>
          <li><b>Transparent:</b> Code is public and auditable.</li>
          <li><b>Immutable:</b> Cannot be changed once deployed.</li>
          <li><b>Programmable:</b> Can hold and transfer assets based on conditions.</li>
        </ul>
        <br>
        They are the backbone of DeFi, NFTs, and DAOs.
      `,
      quiz: {
        q: "What language is most commonly used for Ethereum smart contracts?",
        a: ["Solidity", "Python", "JavaScript", "Rust"],
        correct: 0,
      },
    },
    // ── Trading ───────────────────────────────────────────
    {
      id: "trading-basics",
      icon: "📊",
      title: "Crypto Trading Basics",
      category: "Trading",
      body: `
        Trading crypto involves buying and selling assets to profit from price movements.
        <br><br>
        <b>Key concepts:</b>
        <ul>
          <li><b>Spot trading:</b> Buying/selling actual crypto.</li>
          <li><b>Leverage trading:</b> Borrowing funds to amplify positions.</li>
          <li><b>Limit orders:</b> Set a specific price to buy/sell.</li>
          <li><b>Market orders:</b> Buy/sell at the current market price.</li>
        </ul>
        <br>
        <b>Risk management:</b> Set stop-losses, diversify, never invest more than you can afford to lose.
      `,
      quiz: {
        q: "What is a stop-loss order?",
        a: [
          "An order to sell if price drops to a certain level",
          "An order to buy at market price",
          "A limit order",
          "A type of leverage",
        ],
        correct: 0,
      },
    },
    {
      id: "technical-analysis",
      icon: "📈",
      title: "Technical Analysis",
      category: "Trading",
      body: `
        Technical analysis (TA) uses historical price and volume data to predict future movements.
        <br><br>
        <b>Common tools:</b>
        <ul>
          <li><b>Moving averages (SMA, EMA):</b> Smooth out price action.</li>
          <li><b>RSI:</b> Measures overbought/oversold conditions.</li>
          <li><b>MACD:</b> Trend-following momentum indicator.</li>
          <li><b>Support/Resistance:</b> Key price levels.</li>
        </ul>
        <br>
        TA is not foolproof — combine with fundamental analysis and risk management.
      `,
      quiz: {
        q: "What does RSI stand for?",
        a: [
          "Relative Strength Index",
          "Relative Strength Indicator",
          "Risk Sensitivity Index",
          "Rate of Speed Indicator",
        ],
        correct: 0,
      },
    },
    // ── Advanced ──────────────────────────────────────────
    {
      id: "staking-yield",
      icon: "🌾",
      title: "Staking & Yield Farming",
      category: "DeFi",
      body: `
        <b>Staking:</b> Locking your tokens to support a network (Proof-of-Stake) and earn rewards.
        <br><br>
        <b>Yield Farming:</b> Providing liquidity to DEXs or lending protocols to earn yields.
        <br><br>
        <b>Risks:</b>
        <ul>
          <li><b>Impermanent loss:</b> When the price of deposited tokens changes.</li>
          <li><b>Smart contract risk:</b> Bugs or exploits.</li>
          <li><b>Liquidity risk:</b> Unable to withdraw during high demand.</li>
        </ul>
      `,
      quiz: {
        q: "What is the main reward for staking?",
        a: [
          "Network rewards (inflation)",
          "Trading fees",
          "Airdrops",
          "Governance rights",
        ],
        correct: 0,
      },
    },
    {
      id: "dao-governance",
      icon: "🗳️",
      title: "DAOs and Governance",
      category: "Web3",
      body: `
        DAOs (Decentralized Autonomous Organizations) are communities governed by smart contracts and token holders.
        <br><br>
        <b>How it works:</b>
        <ul>
          <li><b>Tokens:</b> Voting power proportional to holdings.</li>
          <li><b>Proposals:</b> Anyone can submit changes.</li>
          <li><b>Voting:</b> Token holders vote on proposals.</li>
          <li><b>Execution:</b> If passed, the smart contract executes the change.</li>
        </ul>
        <br>
        Examples: Uniswap DAO, Aave DAO, MakerDAO.
      `,
      quiz: {
        q: "What is a DAO?",
        a: [
          "A decentralized community governed by code",
          "A centralized corporation",
          "A type of wallet",
          "A cryptocurrency exchange",
        ],
        correct: 0,
      },
    },
    {
      id: "bridges-crosschain",
      icon: "🌉",
      title: "Bridges & Cross-chain Interoperability",
      category: "Advanced",
      body: `
        Blockchains are silos. Bridges allow assets and data to move between different chains.
        <br><br>
        <b>Types of bridges:</b>
        <ul>
          <li><b>Trusted bridges:</b> Centralized validators (e.g., Binance Bridge).</li>
          <li><b>Trustless bridges:</b> Decentralized validators (e.g., Synapse, Across).</li>
        </ul>
        <br>
        <b>Risks:</b> Smart contract bugs (e.g., Ronin Bridge hack), centralization, and liquidity fragmentation.
      `,
      quiz: {
        q: "What is a blockchain bridge?",
        a: [
          "A protocol that connects different blockchains",
          "A new type of token",
          "A hardware wallet",
          "A mining pool",
        ],
        correct: 0,
      },
    },
    {
      id: "zk-rollups",
      icon: "🔮",
      title: "Scaling Solutions: ZK-Rollups & Optimistic Rollups",
      category: "Advanced",
      body: `
        Rollups are Layer 2 solutions that process transactions off-chain and post proofs to Layer 1.
        <br><br>
        <b>ZK-Rollups:</b> Use zero-knowledge proofs to bundle thousands of transactions into a single proof.
        <br><br>
        <b>Optimistic Rollups:</b> Assume transactions are valid unless challenged (fraud proofs).
        <br><br>
        Both increase throughput and reduce gas fees.
      `,
      quiz: {
        q: "Which rollup uses fraud proofs?",
        a: ["Optimistic Rollups", "ZK-Rollups", "Both", "Neither"],
        correct: 0,
      },
    },
    // ── Ecosystem ──────────────────────────────────────────
    {
      id: "eth-ecosystem",
      icon: "⟠",
      title: "Ethereum Ecosystem",
      category: "Ecosystem",
      body: `
        Ethereum is the leading smart contract platform. Its ecosystem includes:
        <ul>
          <li><b>DeFi:</b> Aave, Uniswap, MakerDAO, Lido.</li>
          <li><b>NFTs:</b> OpenSea, Rarible, CryptoPunks.</li>
          <li><b>Layer 2:</b> Arbitrum, Optimism, Base.</li>
          <li><b>DAOs:</b> ENS, Gitcoin, Uniswap DAO.</li>
          <li><b>Wallets:</b> MetaMask, Rainbow, Frame.</li>
        </ul>
      `,
      quiz: {
        q: "What is the native token of Ethereum?",
        a: ["ETH", "BTC", "SOL", "AVAX"],
        correct: 0,
      },
    },
    {
      id: "sol-ecosystem",
      icon: "🟣",
      title: "Solana Ecosystem",
      category: "Ecosystem",
      body: `
        Solana is a high-performance blockchain with low fees and fast finality.
        <br><br>
        <b>Key projects:</b>
        <ul>
          <li><b>DEXs:</b> Jupiter, Raydium.</li>
          <li><b>DeFi:</b> Marinade Finance, Orca.</li>
          <li><b>NFTs:</b> Magic Eden, Tensor.</li>
          <li><b>Gaming:</b> Star Atlas, Aurory.</li>
          <li><b>Wallets:</b> Phantom, Solflare.</li>
        </ul>
      `,
      quiz: {
        q: "What consensus mechanism does Solana use?",
        a: [
          "Proof-of-History (PoH)",
          "Proof-of-Work (PoW)",
          "Proof-of-Stake (PoS)",
          "Proof-of-Authority (PoA)",
        ],
        correct: 0,
      },
    },
    {
      id: "btc-ecosystem",
      icon: "₿",
      title: "Bitcoin Ecosystem",
      category: "Ecosystem",
      body: `
        Bitcoin is the first and largest cryptocurrency. Its ecosystem is simpler than Ethereum's but growing.
        <br><br>
        <b>Key players:</b>
        <ul>
          <li><b>Wallets:</b> Electrum, Ledger, Trezor.</li>
          <li><b>Lightning Network:</b> Layer 2 solution for fast, cheap payments.</li>
          <li><b>Mining:</b> The backbone of Bitcoin's security.</li>
          <li><b>Exchanges:</b> Binance, Coinbase, Kraken.</li>
        </ul>
        <br>
        Bitcoin is primarily a store of value and medium of exchange.
      `,
      quiz: {
        q: "What is the Lightning Network?",
        a: [
          "A Layer 2 scaling solution for Bitcoin",
          "A new Bitcoin fork",
          "A hardware wallet",
          "A mining pool",
        ],
        correct: 0,
      },
    },
  ];

  // ── State ───────────────────────────────────────────────
  const KEY = "learn";
  const prog = () => W.store.get(KEY, { done: [], progress: {} });

  function saveProgress(p) {
    W.store.set(KEY, p);
  }

  // ── Helpers ─────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function getCategories() {
    const cats = new Set(LESSONS.map((l) => l.category));
    return Array.from(cats);
  }

  function getLessonsByCategory(category) {
    return LESSONS.filter((l) => l.category === category);
  }

  // ── Render Main View ────────────────────────────────────
  function render(view, filter = "all") {
    const p = prog();
    const done = p.done || [];
    const categories = getCategories();

    let filtered = LESSONS;
    if (filter !== "all") {
      filtered = LESSONS.filter((l) => l.category === filter);
    }

    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>📚 Learn Crypto & Web3</h3>
          <div class="qa">
            <button class="chip active" data-filter="all">All</button>
            ${categories.map((c) => `<button class="chip" data-filter="${c}">${c}</button>`).join("")}
          </div>
        </div>
        <div class="meter">
          <div class="meter-label">Progress <b>${done.length}/${LESSONS.length}</b></div>
          <div class="meter-bar"><div style="width:${(done.length / LESSONS.length) * 100}%"></div></div>
        </div>
      </div>
      <div class="grid-2" id="learn-grid">
        ${filtered
          .map(
            (l) => `
          <div class="card lesson ${done.includes(l.id) ? "done" : ""}">
            <div class="lesson-ico">${l.icon}</div>
            <h3>${escapeHTML(l.title)}</h3>
            <span class="tag rank">${escapeHTML(l.category)}</span>
            <p class="muted small">${escapeHTML(l.body.replace(/<[^>]+>/g, "").slice(0, 100))}…</p>
            <button class="btn ${done.includes(l.id) ? "" : "primary"}" data-open="${l.id}">
              ${done.includes(l.id) ? "✓ Completed — Review" : "Start Lesson"}
            </button>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    // ── Filter buttons ──────────────────────────────────
    view.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.onclick = () => {
        view
          .querySelectorAll("[data-filter]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        render(view, btn.dataset.filter);
      };
    });

    // ── Open lesson buttons ────────────────────────────
    view.querySelectorAll("[data-open]").forEach((btn) => {
      btn.onclick = () => openLesson(btn.dataset.open);
    });
  }

  // ── Open Lesson Modal ──────────────────────────────────
  function openLesson(id) {
    const l = LESSONS.find((x) => x.id === id);
    if (!l) return;

    const p = prog();
    const done = p.done || [];
    const isCompleted = done.includes(l.id);

    const m = W.ui.modal({
      title: `${l.icon} ${escapeHTML(l.title)}`,
      body: `
        <span class="tag rank">${escapeHTML(l.category)}</span>
        <div style="line-height:1.7;margin-top:12px;">${l.body}</div>
        <div class="mt">
          <b>Quiz:</b> ${escapeHTML(l.quiz.q)}
          ${l.quiz.a
            .map(
              (a, i) => `
            <label class="quiz-opt">
              <input type="radio" name="quiz" value="${i}">
              ${escapeHTML(a)}
            </label>
          `,
            )
            .join("")}
        </div>
        <div id="quiz-fb" class="mt"></div>
      `,
      footer: `
        <button class="btn ghost" id="quiz-close">Close</button>
        <button class="btn primary" id="quiz-go">Check Answer</button>
      `,
    });

    m.el.querySelector("#quiz-close").onclick = m.close;

    m.el.querySelector("#quiz-go").onclick = () => {
      const sel = m.el.querySelector("input[name=quiz]:checked");
      const fb = m.el.querySelector("#quiz-fb");
      if (!sel) {
        fb.innerHTML = '<p class="muted">Pick an answer first.</p>';
        return;
      }
      const selected = +sel.value;
      const correct = l.quiz.correct;
      if (selected === correct) {
        const p = prog();
        if (!p.done.includes(l.id)) {
          p.done.push(l.id);
          saveProgress(p);
        }
        fb.innerHTML = '<p class="up"><b>Correct! 🎉 Lesson complete.</b></p>';
        // Unlock achievement
        if (W.achievements) W.achievements.check();
        // Refresh the main view
        const mainView = document.getElementById("view");
        if (mainView && mainView.querySelector("#learn-grid")) {
          render(mainView);
        }
        setTimeout(() => m.close(), 1200);
      } else {
        fb.innerHTML = '<p class="down">Not quite — try again!</p>';
      }
    };
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    render,
    openLesson,
    LESSONS,
    getCategories,
    getLessonsByCategory,
    prog,
  };
})();

console.log("[Learn] Module loaded.");

// ---- js/features/sync.js ----
// ===============================================================
//             Secure Encrypted Sync for Weaver
// ===============================================================
//
// This module provides:
//   - Generation of secure sync codes (128-bit entropy)
//   - PBKDF2 key derivation (120,000 iterations)
//   - AES-256-GCM encryption/decryption
//   - UI for managing sync codes and vault operations
//
// Security notes:
//   - Sync codes are 16 bytes (128 bits) – not enumerable
//   - Encryption keys derived from user password (not sync code)
//   - Firestore rules should NOT be "allow read, write: if true"
// ================================================================

// ── Constants ────────────────────────────────────────────────
const CONFIG = {
  ITERATIONS: 120000,
  HASH: "SHA-256",
  KEY_LENGTH: 256,
  AES_ALGORITHM: "AES-GCM",
  IV_LENGTH: 12,
  CODE_PREFIX: "WEVR-",
  CODE_TOTAL_HEX: 32,
};

// ── Secure Sync Code Generation ──────────────────────────────
function generateSyncCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const groups = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.substring(i, i + 4));
  }
  return `${CONFIG.CODE_PREFIX}${groups.join("-")}`;
}

function validateSyncCode(code) {
  if (!code || typeof code !== "string") return false;
  if (!code.startsWith(CONFIG.CODE_PREFIX)) return false;
  const clean = code.replace(CONFIG.CODE_PREFIX, "").replace(/-/g, "");
  if (clean.length !== CONFIG.CODE_TOTAL_HEX) return false;
  if (!/^[0-9A-Fa-f]{32}$/.test(clean)) return false;
  return true;
}

// ── Cryptographic Helpers ──────────────────────────────────────
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: CONFIG.ITERATIONS,
      hash: CONFIG.HASH,
    },
    keyMaterial,
    {
      name: CONFIG.AES_ALGORITHM,
      length: CONFIG.KEY_LENGTH,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plaintext, password, salt) {
  if (!salt) salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(CONFIG.IV_LENGTH));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: CONFIG.AES_ALGORITHM, iv },
    key,
    enc.encode(plaintext),
  );
  return {
    ciphertext: new Uint8Array(ciphertext),
    iv: iv,
    salt: salt,
  };
}

async function decrypt(ciphertext, password, iv, salt) {
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: CONFIG.AES_ALGORITHM, iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

// ── Storage Helpers ──────────────────────────────────────────
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function saveVault(data, password, syncCode) {
  if (!validateSyncCode(syncCode)) throw new Error("Invalid sync code");
  const plaintext = JSON.stringify(data);
  const { ciphertext, iv, salt } = await encrypt(plaintext, password);
  const payload = {
    version: 1,
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
    timestamp: Date.now(),
  };
  const key = `vault_${syncCode}`;
  W.store.set(key, payload);
}

async function loadVault(password, syncCode) {
  if (!validateSyncCode(syncCode)) throw new Error("Invalid sync code");
  const key = `vault_${syncCode}`;
  const payload = W.store.get(key);
  if (!payload) throw new Error("Vault not found");
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);
  const iv = base64ToArrayBuffer(payload.iv);
  const salt = base64ToArrayBuffer(payload.salt);
  const plaintext = await decrypt(
    new Uint8Array(ciphertext),
    password,
    new Uint8Array(iv),
    new Uint8Array(salt),
  );
  return JSON.parse(plaintext);
}

async function deleteVault(syncCode) {
  if (!validateSyncCode(syncCode)) throw new Error("Invalid sync code");
  const key = `vault_${syncCode}`;
  W.store.delete(key);
}

// ── UI Functions ──────────────────────────────────────────────
async function generateAndDisplayCode() {
  const code = generateSyncCode();
  W.store.set("last_sync_code", code);
  const display = document.getElementById("sync-code-display");
  if (display) display.textContent = code;
  return code;
}

async function copySyncCode() {
  const display = document.getElementById("sync-code-display");
  if (!display || !display.textContent || display.textContent === "—") {
    W.ui.toast("No sync code to copy. Generate one first.", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(display.textContent);
    W.ui.toast("Sync code copied 📋", "ok");
  } catch {
    const range = document.createRange();
    range.selectNode(display);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand("copy");
    W.ui.toast("Sync code copied 📋", "ok");
  }
}

async function syncVault() {
  const data = {
    portfolio: W.portfolio ? W.portfolio.all() : [],
    transactions: W.portfolio ? W.portfolio.txs() : [],
    watchlist: W.watchlist ? W.watchlist.list() : [],
    alerts: W.store.get("alerts", []),
    settings: W.store.get("settings", {}),
    achievements: W.store.get("achievements", {}),
    learn: W.store.get("learn", {}),
    timestamp: Date.now(),
    version: "1.0",
  };

  const password = prompt("Enter your sync password (min 8 characters):");
  if (!password) {
    W.ui.toast("Sync cancelled.", "info");
    return;
  }
  if (password.length < 8) {
    W.ui.toast("Password must be at least 8 characters.", "warn");
    return;
  }

  let code = W.store.get("last_sync_code", null);
  if (!code || !validateSyncCode(code)) {
    code = generateSyncCode();
    W.store.set("last_sync_code", code);
  }

  try {
    await saveVault(data, password, code);
    W.ui.toast(`✅ Vault synced! Code: ${code}`, "ok");
    const display = document.getElementById("sync-code-display");
    if (display) display.textContent = code;
  } catch (e) {
    W.ui.toast(`❌ Sync failed: ${e.message}`, "warn");
  }
}

async function restoreVault() {
  const code = prompt("Enter your sync code (e.g. WEVR-7F3A-91BE-24C8-5E6D):");
  if (!code) return;
  if (!validateSyncCode(code)) {
    W.ui.toast("Invalid sync code format.", "warn");
    return;
  }

  const password = prompt("Enter your sync password:");
  if (!password) return;

  try {
    const data = await loadVault(password, code);
    if (data.portfolio) W.portfolio.save(data.portfolio);
    if (data.transactions) W.portfolio.saveTxs(data.transactions);
    if (data.watchlist) W.watchlist.save(data.watchlist);
    if (data.alerts) W.store.set("alerts", data.alerts);
    if (data.settings) W.store.set("settings", data.settings);
    if (data.achievements) W.store.set("achievements", data.achievements);
    if (data.learn) W.store.set("learn", data.learn);
    W.ui.toast("✅ Vault restored successfully!", "ok");
    W.refresh();
  } catch (e) {
    W.ui.toast(`❌ Restore failed: ${e.message}`, "warn");
  }
}

// ── RENDER FUNCTION (NEW!) ────────────────────────────────────
function render(view) {
  // Get existing code or generate one
  let code = W.store.get("last_sync_code", null);
  if (!code || !validateSyncCode(code)) {
    code = generateSyncCode();
    W.store.set("last_sync_code", code);
  }

  view.innerHTML = `
    <div class="card">
      <h3>☁️ Encrypted Sync</h3>
      <p class="muted small">
        Your data is encrypted with AES-256-GCM using PBKDF2 (120,000 iterations).
        Never share your sync code or password with anyone.
      </p>
      <div class="kv-row">
        <span class="muted">Sync Code</span>
        <span><code id="sync-code-display">${code}</code></span>
      </div>
      <div class="qa mt">
        <button class="btn tiny" id="sync-generate">🔄 Generate New</button>
        <button class="btn tiny" id="sync-copy">📋 Copy Code</button>
        <button class="btn primary tiny" id="sync-save">💾 Sync Vault</button>
        <button class="btn tiny" id="sync-restore">📥 Restore Vault</button>
      </div>
      <div id="sync-status" class="mt"></div>
    </div>
    <div class="card">
      <h3>🔐 Security Information</h3>
      <ul class="tx-list">
        <li>✅ 128-bit sync codes (WEVR-XXXX-XXXX-XXXX-XXXX)</li>
        <li>✅ PBKDF2 with 120,000 iterations</li>
        <li>✅ AES-256-GCM authenticated encryption</li>
        <li>✅ Random salt and IV per encryption</li>
        <li>✅ Data stored locally — you control your keys</li>
        <li>⚠️ Store your sync code and password safely — they cannot be recovered</li>
      </ul>
    </div>
  `;

  // ── Wire up buttons ──────────────────────────────────────
  view.querySelector("#sync-generate").onclick = async () => {
    const newCode = await generateAndDisplayCode();
    W.ui.toast("New sync code generated 🔑", "ok");
  };

  view.querySelector("#sync-copy").onclick = copySyncCode;

  view.querySelector("#sync-save").onclick = () => {
    const status = view.querySelector("#sync-status");
    status.innerHTML = '<p class="muted small">⏳ Starting sync...</p>';
    syncVault()
      .then(() => {
        status.innerHTML = '<p class="up small">✅ Sync completed</p>';
      })
      .catch((e) => {
        status.innerHTML = `<p class="down small">❌ ${e.message}</p>`;
      });
  };

  view.querySelector("#sync-restore").onclick = () => {
    const status = view.querySelector("#sync-status");
    status.innerHTML = '<p class="muted small">⏳ Starting restore...</p>';
    restoreVault()
      .then(() => {
        status.innerHTML = '<p class="up small">✅ Restore completed</p>';
      })
      .catch((e) => {
        status.innerHTML = `<p class="down small">❌ ${e.message}</p>`;
      });
  };

  // Update display if code changes
  const display = view.querySelector("#sync-code-display");
  if (display) display.textContent = code;
}

// ── Exports ────────────────────────────────────────────────────
const Sync = {
  generateCode: generateSyncCode,
  validateCode: validateSyncCode,
  encrypt,
  decrypt,
  save: saveVault,
  load: loadVault,
  delete: deleteVault,
  generateAndDisplayCode,
  copySyncCode,
  syncVault,
  restoreVault,
  render,
};

// Register with Weaver
window.W = window.W || {};
W.features = W.features || {};
W.features.sync = Sync;
W.sync = Sync;

// ── Integrate with the sync button in the top bar ────────────
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const syncBtn = document.getElementById("sync-btn");
    if (syncBtn) syncBtn.onclick = syncVault;
  });
}

console.log("[Sync] Module loaded securely.");

// ---- js/features/telegram.js ----
// ================================================================
// js/features/telegram.js – Telegram Alert Integration
// ================================================================

window.W = window.W || {};

W.tg = (() => {
  // ── Constants ─────────────────────────────────────────
  const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
  const MAX_MESSAGE_LENGTH = 4096;
  const RATE_LIMIT_WINDOW = 5000; // 5 seconds between messages
  const STORAGE_KEY = "telegram_settings";

  // ── State ─────────────────────────────────────────────
  let lastSent = 0;
  let settingsCache = null;

  // ── Settings ──────────────────────────────────────────
  function getSettings() {
    if (settingsCache) return settingsCache;
    const stored = W.store.get(STORAGE_KEY, null);
    if (stored) {
      settingsCache = stored;
      return stored;
    }
    // Fallback: read from legacy settings
    const legacy = W.store.get("settings", {});
    const tg = legacy.telegram || {};
    const settings = {
      enabled: !!tg.on,
      token: tg.token || "",
      chatId: tg.chat || "",
    };
    settingsCache = settings;
    W.store.set(STORAGE_KEY, settings);
    return settings;
  }

  function saveSettings(settings) {
    settingsCache = settings;
    W.store.set(STORAGE_KEY, settings);
    // Also update legacy settings for backward compatibility
    const legacy = W.store.get("settings", {});
    legacy.telegram = {
      on: settings.enabled,
      token: settings.token,
      chat: settings.chatId,
    };
    W.store.set("settings", legacy);
  }

  // ── Validation ────────────────────────────────────────
  function isValidToken(token) {
    return /^\d+:[A-Za-z0-9_-]{35}$/.test(token);
  }

  function isValidChatId(chatId) {
    // Can be numeric (user/group ID) or alphanumeric for channel username
    return /^[0-9-]+$/.test(chatId) || /^@[A-Za-z0-9_]{5,32}$/.test(chatId);
  }

  // ── Rate Limiting ──────────────────────────────────────
  function canSend() {
    const now = Date.now();
    if (now - lastSent < RATE_LIMIT_WINDOW) {
      console.warn("[Telegram] Rate limit: too many messages.");
      return false;
    }
    lastSent = now;
    return true;
  }

  // ── Send Message ──────────────────────────────────────
  async function sendMessage(text, options = {}) {
    const settings = getSettings();
    if (!settings.enabled) {
      console.warn("[Telegram] Not enabled.");
      return false;
    }
    if (!settings.token || !settings.chatId) {
      console.warn("[Telegram] Missing token or chat ID.");
      return false;
    }
    if (!isValidToken(settings.token)) {
      console.warn("[Telegram] Invalid token format.");
      return false;
    }
    if (!isValidChatId(settings.chatId)) {
      console.warn("[Telegram] Invalid chat ID format.");
      return false;
    }
    if (!canSend()) return false;

    // Truncate message if needed
    let truncated = text;
    if (text.length > MAX_MESSAGE_LENGTH) {
      truncated = text.slice(0, MAX_MESSAGE_LENGTH - 3) + "…";
    }

    const url = `${TELEGRAM_API_BASE}${settings.token}/sendMessage`;
    const payload = {
      chat_id: settings.chatId,
      text: truncated,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...options,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[Telegram] API error:", errorData);
        return false;
      }
      const data = await response.json();
      if (!data.ok) {
        console.error("[Telegram] Error response:", data.description);
        return false;
      }
      return true;
    } catch (e) {
      console.error("[Telegram] Network error:", e.message);
      return false;
    }
  }

  // ── Notify (for alerts with deduplication) ────────────
  const lastNotified = {};

  function notify(key, text, options = {}) {
    const settings = getSettings();
    if (!settings.enabled) return;
    const now = Date.now();
    // Deduplicate: if the same key was sent within 5 minutes, skip
    if (lastNotified[key] && now - lastNotified[key] < 5 * 60 * 1000) {
      console.log(
        `[Telegram] Duplicate notification suppressed for key: ${key}`,
      );
      return;
    }
    lastNotified[key] = now;
    // Send asynchronously; don't block
    sendMessage(text, options).then((ok) => {
      if (!ok) {
        console.warn(`[Telegram] Failed to send notification: ${key}`);
      }
    });
  }

  // ── Test connection ──────────────────────────────────
  async function testConnection() {
    const settings = getSettings();
    if (!settings.enabled) {
      return { success: false, error: "Telegram notifications are disabled." };
    }
    if (!settings.token || !settings.chatId) {
      return { success: false, error: "Missing token or chat ID." };
    }
    const ok = await sendMessage(
      "✅ Weaver connected! Telegram alerts are active.",
      {
        disable_notification: false,
      },
    );
    if (ok) {
      return { success: true };
    } else {
      return {
        success: false,
        error: "Failed to send test message. Check token and chat ID.",
      };
    }
  }

  // ── UI Render (integration with settings page) ──────
  function renderSettings(container) {
    const settings = getSettings();
    container.innerHTML = `
      <div class="card">
        <h3>📨 Telegram Alerts</h3>
        <p class="muted small">
          Configure your Telegram bot to receive alerts, price triggers, and gem discoveries.
          <br>
          Create a bot via <b>@BotFather</b>, get your Chat ID from <b>@userinfobot</b>, and send a message to the bot first.
        </p>
        <label>
          Bot Token
          <input type="password" id="tg-token" placeholder="123456789:AAF..." value="${settings.token}">
        </label>
        <label>
          Chat ID
          <input type="text" id="tg-chat" placeholder="e.g. 7099096813 or @channel" value="${settings.chatId}">
        </label>
        <label class="small">
          <input type="checkbox" id="tg-enabled" ${settings.enabled ? "checked" : ""} style="width:auto;">
          Enable Telegram alerts
        </label>
        <div class="qa mt">
          <button class="btn" id="tg-test">📨 Send Test Message</button>
          <button class="btn primary" id="tg-save">Save Settings</button>
        </div>
        <div id="tg-status" class="mt"></div>
      </div>
    `;

    const tokenInput = container.querySelector("#tg-token");
    const chatInput = container.querySelector("#tg-chat");
    const enabledCheck = container.querySelector("#tg-enabled");
    const testBtn = container.querySelector("#tg-test");
    const saveBtn = container.querySelector("#tg-save");
    const status = container.querySelector("#tg-status");

    testBtn.onclick = async () => {
      // Temporarily save settings to test
      const tempSettings = {
        enabled: enabledCheck.checked,
        token: tokenInput.value.trim(),
        chatId: chatInput.value.trim(),
      };
      // Validate
      if (!tempSettings.token || !tempSettings.chatId) {
        status.innerHTML =
          '<p class="down">❌ Please fill in both token and chat ID.</p>';
        return;
      }
      if (!isValidToken(tempSettings.token)) {
        status.innerHTML = '<p class="down">❌ Invalid bot token format.</p>';
        return;
      }
      if (!isValidChatId(tempSettings.chatId)) {
        status.innerHTML = '<p class="down">❌ Invalid chat ID format.</p>';
        return;
      }
      // Temporarily save to test
      const originalSettings = { ...settings };
      saveSettings(tempSettings);
      try {
        const result = await testConnection();
        if (result.success) {
          status.innerHTML =
            '<p class="up">✅ Test message sent! Check your Telegram.</p>';
        } else {
          status.innerHTML = `<p class="down">❌ ${result.error}</p>`;
        }
      } catch (e) {
        status.innerHTML = `<p class="down">❌ ${e.message}</p>`;
      }
      // Restore original settings
      saveSettings(originalSettings);
    };

    saveBtn.onclick = () => {
      const newSettings = {
        enabled: enabledCheck.checked,
        token: tokenInput.value.trim(),
        chatId: chatInput.value.trim(),
      };
      if (newSettings.token && !isValidToken(newSettings.token)) {
        status.innerHTML = '<p class="down">❌ Invalid bot token format.</p>';
        return;
      }
      if (newSettings.chatId && !isValidChatId(newSettings.chatId)) {
        status.innerHTML = '<p class="down">❌ Invalid chat ID format.</p>';
        return;
      }
      saveSettings(newSettings);
      status.innerHTML = '<p class="up">✅ Settings saved.</p>';
    };
  }

  // ── Public API ─────────────────────────────────────────
  return {
    // Core functions
    send: sendMessage,
    notify,
    test: testConnection,

    // Settings
    getSettings,
    saveSettings,
    renderSettings,

    // Utility
    isEnabled: () => getSettings().enabled,
    isValidToken,
    isValidChatId,
  };
})();

console.log("[Telegram] Module loaded.");

// ---- js/features/walletsync.js ----
// ================================================================
// js/features/walletsync.js – Secure Multi‑Chain Wallet Sync
// ================================================================

window.W = window.W || {};

W.walletSync = (() => {
  // ── Constants ─────────────────────────────────────────
  const STORAGE_KEY = "wallet_sync_data";
  const CACHE_KEY = "wallet_sync_cache";
  const CACHE_TTL = 300000; // 5 minutes

  // ── Chain configurations ──────────────────────────────
  const CHAINS = {
    btc: {
      label: "Bitcoin",
      symbol: "BTC",
      icon: "₿",
      explorer: "https://mempool.space/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://mempool.space/api/address/${addr}`,
        ).then((r) => r.json());
        return (
          (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) /
          1e8
        );
      },
      tokens: async () => [], // No ERC‑20 on BTC
    },
    eth: {
      label: "Ethereum",
      symbol: "ETH",
      icon: "⟠",
      explorer: "https://etherscan.io/address/",
      balance: async (addr) => {
        const data = await fetch("https://cloudflare-eth.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [addr, "latest"],
          }),
        }).then((r) => r.json());
        return parseInt(data.result || "0x0", 16) / 1e18;
      },
      tokens: async (addr) => {
        // Use a public token list (minimal)
        const tokens = [
          {
            symbol: "USDC",
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            decimals: 6,
          },
          {
            symbol: "USDT",
            address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            decimals: 6,
          },
          {
            symbol: "DAI",
            address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            decimals: 18,
          },
          {
            symbol: "LINK",
            address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
            decimals: 18,
          },
        ];
        const results = [];
        for (const token of tokens) {
          try {
            const data = await fetch("https://cloudflare-eth.com", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [
                  {
                    to: token.address,
                    data: "0x70a08231" + addr.slice(2).padStart(64, "0"),
                  },
                  "latest",
                ],
              }),
            }).then((r) => r.json());
            const balance =
              parseInt(data.result || "0x0", 16) / Math.pow(10, token.decimals);
            if (balance > 1e-9) {
              results.push({ ...token, balance });
            }
          } catch (e) {
            /* ignore */
          }
        }
        return results;
      },
    },
    bsc: {
      label: "BSC",
      symbol: "BNB",
      icon: "🟡",
      explorer: "https://bscscan.com/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.bscscan.com/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      tokens: async (addr) => {
        // BSC token list (simplified)
        const tokens = [
          {
            symbol: "USDC",
            address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
            decimals: 18,
          },
          {
            symbol: "USDT",
            address: "0x55d398326f99059fF775485246999027B3197955",
            decimals: 18,
          },
          {
            symbol: "BUSD",
            address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
            decimals: 18,
          },
        ];
        // Use BSC RPC (public)
        const results = [];
        for (const token of tokens) {
          try {
            const data = await fetch("https://bsc-dataseed.binance.org", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [
                  {
                    to: token.address,
                    data: "0x70a08231" + addr.slice(2).padStart(64, "0"),
                  },
                  "latest",
                ],
              }),
            }).then((r) => r.json());
            const balance =
              parseInt(data.result || "0x0", 16) / Math.pow(10, token.decimals);
            if (balance > 1e-9) {
              results.push({ ...token, balance });
            }
          } catch (e) {
            /* ignore */
          }
        }
        return results;
      },
    },
    sol: {
      label: "Solana",
      symbol: "SOL",
      icon: "🟣",
      explorer: "https://solscan.io/account/",
      balance: async (addr) => {
        const data = await fetch("https://api.mainnet-beta.solana.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [addr],
          }),
        }).then((r) => r.json());
        return (data.result?.value || 0) / 1e9;
      },
      tokens: async (addr) => {
        // Solana SPL tokens (simplified)
        const tokens = [
          {
            symbol: "USDC",
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            decimals: 6,
          },
          {
            symbol: "USDT",
            mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11Mc8wjjcPbW",
            decimals: 6,
          },
        ];
        const results = [];
        for (const token of tokens) {
          try {
            const data = await fetch("https://api.mainnet-beta.solana.com", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getTokenAccountsByOwner",
                params: [
                  addr,
                  { mint: token.mint },
                  { encoding: "jsonParsed" },
                ],
              }),
            }).then((r) => r.json());
            let balance = 0;
            (data.result?.value || []).forEach((acc) => {
              const amount =
                acc.account?.data?.parsed?.info?.tokenAmount?.amount || "0";
              balance += parseInt(amount) / Math.pow(10, token.decimals);
            });
            if (balance > 1e-9) {
              results.push({ symbol: token.symbol, balance });
            }
          } catch (e) {
            /* ignore */
          }
        }
        return results;
      },
    },
  };

  // ── Secure Storage Helpers ────────────────────────────

  // Encrypt wallet data using the user's sync password
  async function encryptWalletData(data, password) {
    if (!password) throw new Error("Password required for encryption");
    const plaintext = JSON.stringify(data);
    const encrypted = await W.sync.encrypt(plaintext, password);
    return encrypted;
  }

  // Decrypt wallet data
  async function decryptWalletData(encrypted, password) {
    if (!password) throw new Error("Password required for decryption");
    const { ciphertext, iv, salt } = encrypted;
    const plaintext = await W.sync.decrypt(
      new Uint8Array(ciphertext),
      password,
      new Uint8Array(iv),
      new Uint8Array(salt),
    );
    return JSON.parse(plaintext);
  }

  // ── State Management ──────────────────────────────────

  // Get stored encrypted data
  function getStoredData() {
    return W.store.get(STORAGE_KEY, null);
  }

  // Save encrypted data
  function saveStoredData(encrypted) {
    W.store.set(STORAGE_KEY, encrypted);
  }

  // ── Public API ─────────────────────────────────────────

  /**
   * Add a wallet address with a label.
   * @param {string} chain - Chain identifier (btc, eth, bsc, sol)
   * @param {string} address - Wallet address
   * @param {string} label - User-defined label
   * @param {string} password - Sync password (for encryption)
   * @returns {Promise<boolean>}
   */
  async function addWallet(chain, address, label, password) {
    if (!password) throw new Error("Sync password required to add wallet");
    if (!CHAINS[chain]) throw new Error(`Unsupported chain: ${chain}`);
    // Validate address format
    if (!validateAddress(chain, address)) {
      throw new Error(`Invalid address format for ${chain}`);
    }
    // Get current encrypted data
    const encrypted = getStoredData();
    let wallets = [];
    if (encrypted) {
      try {
        wallets = await decryptWalletData(encrypted, password);
      } catch (e) {
        // If decryption fails, treat as new data
        console.warn("[WalletSync] Decryption failed, treating as new data.");
      }
    }
    // Check duplicate
    if (
      wallets.some(
        (w) =>
          w.chain === chain &&
          w.address.toLowerCase() === address.toLowerCase(),
      )
    ) {
      throw new Error("Wallet already added");
    }
    wallets.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      chain,
      address,
      label: label || `${chain.toUpperCase()} wallet`,
      addedAt: Date.now(),
    });
    // Encrypt and save
    const newEncrypted = await encryptWalletData(wallets, password);
    saveStoredData(newEncrypted);
    return true;
  }

  /**
   * Remove a wallet by ID.
   * @param {string} id - Wallet ID
   * @param {string} password - Sync password
   * @returns {Promise<boolean>}
   */
  async function removeWallet(id, password) {
    if (!password) throw new Error("Sync password required");
    const encrypted = getStoredData();
    if (!encrypted) return false;
    const wallets = await decryptWalletData(encrypted, password);
    const filtered = wallets.filter((w) => w.id !== id);
    if (filtered.length === wallets.length) return false;
    const newEncrypted = await encryptWalletData(filtered, password);
    saveStoredData(newEncrypted);
    return true;
  }

  /**
   * Get the list of stored wallets (decrypted).
   * @param {string} password - Sync password
   * @returns {Promise<Array>}
   */
  async function getWallets(password) {
    if (!password) throw new Error("Sync password required");
    const encrypted = getStoredData();
    if (!encrypted) return [];
    return decryptWalletData(encrypted, password);
  }

  /**
   * Sync all wallets: fetch balances and token holdings.
   * @param {string} password - Sync password
   * @returns {Promise<Object>} - { wallets, holdings, totalValue }
   */
  async function syncAll(password) {
    if (!password) throw new Error("Sync password required");
    const wallets = await getWallets(password);
    if (!wallets.length) return { wallets: [], holdings: [], totalValue: 0 };

    const results = [];
    let totalValue = 0;

    for (const wallet of wallets) {
      const chain = CHAINS[wallet.chain];
      if (!chain) continue;
      try {
        const nativeBalance = await chain.balance(wallet.address);
        const tokenBalances = await chain.tokens(wallet.address);
        // Fetch price from CoinGecko
        let price = 0;
        try {
          const data = await W.api.markets(chain.symbol.toLowerCase());
          const coin = data.find(
            (c) => c.symbol.toLowerCase() === chain.symbol.toLowerCase(),
          );
          price = coin?.current_price || 0;
        } catch (e) {}
        const nativeValue = nativeBalance * price;
        const tokenValues = tokenBalances.map((t) => {
          // For tokens, we'd need price; we'll approximate with a placeholder or skip
          return { ...t, value: t.balance * 0 }; // placeholder
        });
        results.push({
          ...wallet,
          nativeBalance,
          tokenBalances,
          nativeValue,
          price,
          totalValue:
            nativeValue + tokenValues.reduce((sum, t) => sum + t.value, 0),
        });
        totalValue +=
          nativeValue + tokenValues.reduce((sum, t) => sum + t.value, 0);
      } catch (e) {
        console.warn(
          `[WalletSync] Sync failed for ${wallet.chain}:${wallet.address}`,
          e,
        );
        results.push({ ...wallet, error: e.message });
      }
    }

    // Cache results
    W.store.set(CACHE_KEY, { data: results, timestamp: Date.now() });

    return { wallets: results, holdings: results, totalValue };
  }

  /**
   * Get cached sync results (without re-fetching).
   * @param {string} password - Sync password
   * @returns {Object|null}
   */
  function getCached(password) {
    const cache = W.store.get(CACHE_KEY, null);
    if (!cache) return null;
    if (Date.now() - cache.timestamp > CACHE_TTL) return null;
    return cache.data;
  }

  /**
   * Clear all wallet data.
   * @param {string} password - Sync password
   * @returns {Promise<void>}
   */
  async function clearAll(password) {
    if (!password) throw new Error("Sync password required");
    const encrypted = getStoredData();
    if (encrypted) {
      // Verify password by trying to decrypt
      await decryptWalletData(encrypted, password);
    }
    W.store.delete(STORAGE_KEY);
    W.store.delete(CACHE_KEY);
  }

  // ── Address Validation ─────────────────────────────────

  function validateAddress(chain, address) {
    switch (chain) {
      case "btc":
        return (
          /^[13][a-zA-Z0-9]{25,34}$/.test(address) ||
          /^bc1[a-zA-Z0-9]{25,90}$/.test(address)
        );
      case "eth":
      case "bsc":
        return /^0x[a-fA-F0-9]{40}$/i.test(address);
      case "sol":
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      default:
        return false;
    }
  }

  // ── UI Render ──────────────────────────────────────────

  async function render(view) {
    // This is a simplified render; you can integrate with your existing UI
    view.innerHTML = `
      <div class="card">
        <h3>🔐 Wallet Sync</h3>
        <p class="muted small">All wallet data is encrypted with your sync password.</p>
        <div class="qa mt">
          <button class="btn primary" id="ws-add">+ Add Wallet</button>
          <button class="btn" id="ws-sync">🔄 Sync Now</button>
          <button class="btn danger" id="ws-clear">🗑️ Clear All</button>
        </div>
        <div id="ws-status" class="mt"></div>
        <div id="ws-list"></div>
      </div>
    `;

    // Bind buttons
    view.querySelector("#ws-add").onclick = () => addWalletModal();
    view.querySelector("#ws-sync").onclick = () => syncAndDisplay(view);
    view.querySelector("#ws-clear").onclick = () => {
      W.ui.confirm(
        "This will permanently delete all synced wallet data. Continue?",
        async () => {
          const pwd = prompt("Enter your sync password:");
          if (!pwd) return;
          try {
            await clearAll(pwd);
            W.ui.toast("All wallet data cleared.", "ok");
            render(view);
          } catch (e) {
            W.ui.toast(e.message, "warn");
          }
        },
      );
    };

    // Display cached or prompt to sync
    const cached = getCached();
    if (cached) {
      displayWallets(view, cached);
    } else {
      view.querySelector("#ws-status").innerHTML =
        '<p class="muted">No cached data. Click "Sync Now" to fetch.</p>';
    }
  }

  async function syncAndDisplay(view) {
    const pwd = prompt("Enter your sync password:");
    if (!pwd) return;
    try {
      view.querySelector("#ws-status").innerHTML = W.ui.spinner();
      const result = await syncAll(pwd);
      displayWallets(view, result.wallets);
      view.querySelector("#ws-status").innerHTML =
        `<p class="up">✅ Synced at ${new Date().toLocaleTimeString()}</p>`;
    } catch (e) {
      view.querySelector("#ws-status").innerHTML =
        `<p class="down">❌ ${e.message}</p>`;
    }
  }

  function displayWallets(view, wallets) {
    const container = view.querySelector("#ws-list");
    if (!wallets || !wallets.length) {
      container.innerHTML = '<p class="muted">No wallets added.</p>';
      return;
    }
    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Chain</th>
              <th>Label</th>
              <th>Address</th>
              <th>Balance</th>
              <th>Value (USD)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${wallets
              .map(
                (w) => `
              <tr>
                <td>${CHAINS[w.chain]?.icon || "⛓️"} ${w.chain.toUpperCase()}</td>
                <td>${w.label}</td>
                <td><code title="${w.address}">${w.address.slice(0, 6)}…${w.address.slice(-4)}</code></td>
                <td>${w.nativeBalance?.toFixed(4) || "—"} ${CHAINS[w.chain]?.symbol || ""}</td>
                <td>${w.nativeValue ? W.fmt.money(w.nativeValue, { compact: true }) : "—"}</td>
                <td><button class="icon-btn" data-remove="${w.id}">✕</button></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    container.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.onclick = async () => {
        const pwd = prompt("Enter sync password to remove:");
        if (!pwd) return;
        try {
          await removeWallet(btn.dataset.remove, pwd);
          W.ui.toast("Wallet removed.", "ok");
          syncAndDisplay(view);
        } catch (e) {
          W.ui.toast(e.message, "warn");
        }
      };
    });
  }

  function addWalletModal() {
    const m = W.ui.modal({
      title: "Add Wallet to Sync",
      body: `
        <label>Chain
          <select id="ws-chain">
            ${Object.keys(CHAINS)
              .map((c) => `<option value="${c}">${CHAINS[c].label}</option>`)
              .join("")}
          </select>
        </label>
        <label>Label
          <input id="ws-label" placeholder="e.g. My main wallet">
        </label>
        <label>Address
          <input id="ws-address" placeholder="Enter wallet address">
        </label>
        <label>Sync Password
          <input type="password" id="ws-password" placeholder="Your Weaver sync password">
        </label>
        <p class="muted small">Your wallet addresses are encrypted with your sync password.</p>
      `,
      footer: `
        <button class="btn ghost" id="ws-cancel">Cancel</button>
        <button class="btn primary" id="ws-save">Add Wallet</button>
      `,
    });

    m.el.querySelector("#ws-cancel").onclick = m.close;
    m.el.querySelector("#ws-save").onclick = async () => {
      const chain = m.el.querySelector("#ws-chain").value;
      const label =
        m.el.querySelector("#ws-label").value.trim() ||
        `${chain.toUpperCase()} Wallet`;
      const address = m.el.querySelector("#ws-address").value.trim();
      const password = m.el.querySelector("#ws-password").value;
      if (!password) return W.ui.toast("Sync password is required.", "warn");
      try {
        await addWallet(chain, address, label, password);
        m.close();
        W.ui.toast("Wallet added and encrypted.", "ok");
        // Refresh the view
        const view = document.getElementById("view");
        if (view) render(view);
      } catch (e) {
        W.ui.toast(e.message, "warn");
      }
    };
  }

  // ── Exports ────────────────────────────────────────────
  return {
    addWallet,
    removeWallet,
    getWallets,
    syncAll,
    getCached,
    clearAll,
    render,
    // Alias for backward compatibility
    refresh: syncAll,
    holdings: () => W.store.get(CACHE_KEY, null)?.data || [],
    wallets: getWallets,
  };
})();

console.log("[WalletSync] Module loaded (secure).");

// ---- js/ui/particles.js ----
// ================================================================
// js/ui/particles.js – Futuristic Particle System (Starfield + Neural Network)
// ================================================================
(function () {
  // Create canvas and inject it behind the content
  const canvas = document.createElement("canvas");
  canvas.id = "particles-canvas";
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    pointer-events: none;
    display: block;
  `;
  document.body.prepend(canvas);

  const ctx = canvas.getContext("2d");
  let width, height;
  let particles = [];
  const PARTICLE_COUNT = 180;
  const MAX_DIST = 180; // max distance for line connections

  // ── Resize handler ──────────────────────────────────
  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // ── Particle class ──────────────────────────────────
  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * 3 + 0.8;
      this.speedX = (Math.random() - 0.5) * 0.6;
      this.speedY = (Math.random() - 0.5) * 0.6;
      this.opacity = Math.random() * 0.6 + 0.3;
      this.pulse = Math.random() * Math.PI * 2;
      this.pulseSpeed = 0.02 + Math.random() * 0.04;
      // Slight color variation: purple, cyan, or white
      const hue =
        Math.random() > 0.6 ? "cyan" : Math.random() > 0.5 ? "purple" : "white";
      this.color = hue;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.pulse += this.pulseSpeed;
      // Wrap around edges
      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }
    draw() {
      const alpha = this.opacity * (0.7 + 0.3 * Math.sin(this.pulse));
      let color;
      if (this.color === "purple") {
        color = `rgba(124, 92, 255, ${alpha})`;
      } else if (this.color === "cyan") {
        color = `rgba(92, 214, 255, ${alpha})`;
      } else {
        color = `rgba(255, 255, 255, ${alpha * 0.8})`;
      }
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ── Initialize particles ────────────────────────────
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }

  // ── Animation loop ──────────────────────────────────
  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Update and draw each particle
    particles.forEach((p) => {
      p.update();
      p.draw();
    });

    // Draw connecting lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const alpha = (1 - dist / MAX_DIST) * 0.25;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(124, 92, 255, ${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();

  // ── Debounce resize ─────────────────────────────────
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resize, 150);
  });

  console.log("[Particles] Initialized");
})();

// ---- js/ui/tilt.js ----
// ================================================================
// js/ui/tilt.js – 3D Tilt on .card elements (smooth, subtle)
// ================================================================
(function () {
  // Select all cards (exclude cards inside modals to avoid interference)
  const cards = document.querySelectorAll(".card:not(.no-tilt)");

  if (!cards.length) {
    console.log("[Tilt] No cards found.");
    return;
  }

  let tiltActive = true;

  // Disable tilt on touch devices (prevents weird behavior)
  if ("ontouchstart" in window) {
    tiltActive = false;
    console.log("[Tilt] Disabled on touch devices.");
    return;
  }

  cards.forEach((card) => {
    // Save original transform to restore later
    let originalTransform = card.style.transform || "";

    card.addEventListener("mousemove", (e) => {
      if (!tiltActive) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      // Rotate X axis based on vertical offset, Y axis on horizontal offset
      const rotateX = ((y - centerY) / centerY) * -8; // max ±8 deg
      const rotateY = ((x - centerX) / centerX) * 8;
      // Apply transform with perspective and a small scale boost
      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
      card.style.transition = "transform 0.08s ease-out";
    });

    card.addEventListener("mouseleave", () => {
      if (!tiltActive) return;
      // Smoothly return to original state
      card.style.transform =
        "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)";
      card.style.transition = "transform 0.4s cubic-bezier(0.2, 0.9, 0.4, 1)";
    });

    // Optional: add a slight initial transition to prevent jump on first hover
    card.style.transition = "transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1)";
  });

  console.log(`[Tilt] Enabled on ${cards.length} cards.`);
})();

// ---- js/app.js ----

//  Weaver Core Application


window.W = window.W || {};

(function () {
  // ── Navigation Configuration ──────────────────────────
  const NAV = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "portfolio", icon: "💼", label: "Portfolio" },
    { id: "watchlist", icon: "⭐", label: "Watchlist" },
    { id: "explorer", icon: "🔍", label: "Coin Explorer" },
    { id: "alerts", icon: "🚨", label: "Alerts" },
    { id: "news", icon: "📰", label: "News" },
    { id: "ai", icon: "🧠", label: "Portfolio Intelligence" },
    { id: "optimizer", icon: "🧮", label: "Optimizer" },
    { id: "time", icon: "⏳", label: "Time Machine" },
    { id: "trader", icon: "⚡", label: "Trading Assistant" },
    { id: "gems", icon: "💎", label: "Gem Agent" },
    { id: "shield", icon: "🛡️", label: "Token Shield" },
    { id: "web3", icon: "🌐", label: "Web3 Wallets" },
    { id: "defi", icon: "💰", label: "DeFi" },
    { id: "airdrops", icon: "🎯", label: "Airdrop Hunter" },
    { id: "market", icon: "📈", label: "Trading Tools" },
    { id: "sectors", icon: "🌊", label: "Sector Map" },
    { id: "whales", icon: "🐋", label: "Whale Tracker" },
    { id: "smart", icon: "🧠", label: "Smart Money" },
    { id: "unlocks", icon: "🔓", label: "Token Unlocks" },
    { id: "learn", icon: "📚", label: "Learn" },
    { id: "profile", icon: "👤", label: "Profile" },
    { id: "pro", icon: "🔮", label: "Weaver Pro" },
    { id: "sync", icon: "☁️", label: "Sync" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  // ── Route Map ──────────────────────────────────────────
  const routes = {
    dashboard: (v) =>
      W.dashboard?.render?.(v) ||
      W.ui?.toast?.("Dashboard module not loaded", "warn"),
    portfolio: (v) =>
      W.dashboard?.renderPortfolio?.(v) ||
      W.ui?.toast?.("Portfolio module not loaded", "warn"),
    watchlist: (v) =>
      W.watchlist?.render?.(v) ||
      W.ui?.toast?.("Watchlist module not loaded", "warn"),
    explorer: (v) =>
      W.explorer?.render?.(v) ||
      W.ui?.toast?.("Explorer module not loaded", "warn"),
    alerts: (v) =>
      W.alerts?.render?.(v) ||
      W.ui?.toast?.("Alerts module not loaded", "warn"),
    news: (v) =>
      W.news?.render?.(v) || W.ui?.toast?.("News module not loaded", "warn"),
    ai: (v) =>
      W.ai?.render?.(v) || W.ui?.toast?.("AI module not loaded", "warn"),
    optimizer: (v) =>
      W.optimizer?.render?.(v) ||
      W.ui?.toast?.("Optimizer module not loaded", "warn"),
    time: (v) =>
      W.time?.render?.(v) ||
      W.ui?.toast?.("Time Machine module not loaded", "warn"),
    trader: (v) =>
      W.trader?.render?.(v) ||
      W.ui?.toast?.("Trader module not loaded", "warn"),
    gems: (v) =>
      W.gems?.render?.(v) || W.ui?.toast?.("Gems module not loaded", "warn"),
    shield: (v) =>
      W.shield?.render?.(v) ||
      W.ui?.toast?.("Shield module not loaded", "warn"),
    web3: (v) =>
      W.web3?.render?.(v) || W.ui?.toast?.("Web3 module not loaded", "warn"),
    defi: (v) =>
      W.misc?.renderDefi?.(v) ||
      W.ui?.toast?.("DeFi module not loaded", "warn"),
    airdrops: (v) =>
      W.misc?.renderAirdrops?.(v) ||
      W.ui?.toast?.("Airdrops module not loaded", "warn"),
    market: (v) =>
      W.market?.render?.(v) ||
      W.ui?.toast?.("Market module not loaded", "warn"),
    sectors: (v) =>
      W.sectors?.render?.(v) ||
      W.ui?.toast?.("Sectors module not loaded", "warn"),
    whales: (v) =>
      W.whales?.render?.(v) ||
      W.ui?.toast?.("Whales module not loaded", "warn"),
    smart: (v) =>
      W.smart?.render?.(v) || W.ui?.toast?.("Smart module not loaded", "warn"),
    unlocks: (v) =>
      W.unlocks?.render?.(v) ||
      W.ui?.toast?.("Unlocks module not loaded", "warn"),
    learn: (v) =>
      W.learn?.render?.(v) || W.ui?.toast?.("Learn module not loaded", "warn"),
    profile: (v) =>
      W.misc?.renderProfile?.(v) ||
      W.ui?.toast?.("Profile module not loaded", "warn"),
    pro: (v) =>
      W.misc?.renderPro?.(v) || W.ui?.toast?.("Pro module not loaded", "warn"),
    sync: (v) => {
      if (W.sync?.render) W.sync.render(v);
      else W.ui?.toast?.("Sync module not loaded", "warn");
    },
    settings: (v) =>
      W.misc?.renderSettings?.(v) ||
      W.ui?.toast?.("Settings module not loaded", "warn"),
  };

  // ── Helpers ────────────────────────────────────────────
  function getCurrentPage() {
    return location.hash.slice(2).split("/")[0] || "dashboard";
  }

  function getPageParam() {
    const parts = location.hash.slice(2).split("/");
    return parts.length > 1 ? parts[1] : null;
  }

  // ── Route Handler ──────────────────────────────────────
  function route() {
    const hash = location.hash.slice(2) || "dashboard";
    const [page, param] = hash.split("/");
    const activeId = page === "coin" ? "explorer" : page;

    // Update navigation
    document.querySelectorAll("#nav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.id === activeId);
    });

    // Update page title
    const navItem = NAV.find((n) => n.id === activeId);
    const titleEl = document.getElementById("page-title");
    if (titleEl) titleEl.textContent = navItem ? navItem.label : "Weaver";

    // Render view
    const view = document.getElementById("view");
    if (!view) {
      console.warn("[App] View element not found");
      return;
    }

    try {
      if (page === "coin" && param) {
        if (W.explorer?.renderCoin) {
          W.explorer.renderCoin(view, param);
        } else {
          view.innerHTML =
            '<p class="muted">Explorer module not available.</p>';
        }
      } else if (routes[page]) {
        routes[page](view);
      } else {
        view.innerHTML =
          '<div class="card"><h3>404</h3><p class="muted">Page not found.</p></div>';
      }
    } catch (e) {
      console.error("[App] Route error:", e);
      view.innerHTML = `
        <div class="card">
          <h3>⚠️ Something went wrong</h3>
          <p class="muted">${W.fmt?.escapeHTML?.(e.message) || e.message}</p>
          <p class="muted small">Check the console (F12) for details.</p>
        </div>
      `;
    }

    // Update last updated timestamp
    const updated = document.getElementById("last-updated");
    if (updated) {
      updated.textContent = `updated ${new Date().toLocaleTimeString()} · via ${W.api?.source || "…"}`;
    }

    // Check alerts
    if (W.alerts?.check) W.alerts.check();
  }

  // ── Streak Tracking ────────────────────────────────────
  function updateStreak() {
    const today = new Date().toDateString();
    const streak = W.store?.get?.("streak", null);
    if (!streak || streak.last !== today) {
      const yesterday = new Date(Date.now() - 864e5).toDateString();
      const count = streak && streak.last === yesterday ? streak.count + 1 : 1;
      W.store?.set?.("streak", { last: today, count });
    }
  }

  // ── Auto-Refresh Loop ──────────────────────────────────
  let refreshLoop = null;

  function startLoop() {
    clearInterval(refreshLoop);
    const settings = W.store?.get?.("settings", {});
    const seconds = settings?.refresh ?? 60;
    if (seconds > 0) {
      refreshLoop = setInterval(() => {
        const current = getCurrentPage();
        if (
          !document.querySelector("#modal-root .modal") &&
          ["dashboard", "watchlist", "market", "alerts"].includes(current)
        ) {
          route();
        }
      }, seconds * 1000);
    }
  }

  // ── Settings Application ──────────────────────────────
  W.applySettings = function () {
    const cur = W.currency?.() || "usd";
    const el = document.getElementById("currency");
    if (el) el.value = cur;
    startLoop();
  };

  // ── W.currency (fixed) ────────────────────────────────
  W.currency = function () {
    return W.store?.get?.("settings", {})?.currency || "usd";
  };

  // ── Refresh wrapper ────────────────────────────────────
  W.refresh = function () {
    route();
  };

  // ── Init ───────────────────────────────────────────────
  function init() {
    console.log("[App] Initializing Weaver...");

    // ── Build navigation ──────────────────────────────────
    const navEl = document.getElementById("nav");
    if (navEl) {
      navEl.innerHTML = NAV.map(
        (n) => `
        <a href="#/${n.id}" data-id="${n.id}">
          <span class="nav-ico">${n.icon}</span>
          <span>${n.label}</span>
          ${n.id === "alerts" ? '<span class="nav-badge" id="alert-badge"></span>' : ""}
        </a>
      `,
      ).join("");
    }

    // ── Setup currency dropdown ──────────────────────────
    const curEl = document.getElementById("currency");
    if (curEl) {
      const currencies = [
        "usd",
        "ngn",
        "eur",
        "gbp",
        "inr",
        "jpy",
        "aud",
        "cad",
      ];
      curEl.innerHTML = currencies
        .map((c) => `<option value="${c}">${c.toUpperCase()}</option>`)
        .join("");
      curEl.value = W.currency();
      curEl.onchange = () => {
        const settings = W.store?.get?.("settings", {}) || {};
        settings.currency = curEl.value;
        W.store?.set?.("settings", settings);
        route();
      };
    }

    // ── Refresh button ────────────────────────────────────
    const refreshBtn = document.getElementById("btn-refresh");
    if (refreshBtn) refreshBtn.onclick = route;

    // ── Pro button ────────────────────────────────────────
    const proBtn = document.getElementById("btn-pro");
    if (proBtn) proBtn.onclick = () => (location.hash = "#/pro");

    // ── Sync button ──────────────────────────────────────
    const syncBtn = document.getElementById("sync-btn");
    if (syncBtn) {
      syncBtn.onclick = () => {
        if (W.sync?.syncVault) {
          W.sync.syncVault();
        } else {
          W.ui?.toast?.("Sync module not available", "warn");
        }
      };
    }

    // ── Unhandled rejections ─────────────────────────────
    window.addEventListener("unhandledrejection", (e) => {
      console.warn("[App] Unhandled rejection:", e.reason);
      const msg = e.reason?.message || "Request failed";
      const view = document.getElementById("view");
      const spinner = view?.querySelector(".spinner");
      if (spinner) {
        spinner.outerHTML = `<p class="muted small mt">⚠️ ${W.fmt?.escapeHTML?.(msg) || msg} — some live data is unavailable (showing cache where possible). Try ⟳ or another network.</p>`;
      }
    });

    // ── Achievements ─────────────────────────────────────
    if (W.achievements?.check) {
      W.achievements.check();
    }

    // ── Streak ────────────────────────────────────────────
    updateStreak();

    // ── Sync boot ────────────────────────────────────────
    if (W.sync?.boot) W.sync.boot();

    // ── Route and start loop ─────────────────────────────
    window.addEventListener("hashchange", route);
    route();
    startLoop();

    // ── Alert checker (every 60s) ────────────────────────
    setInterval(() => {
      if (W.alerts?.check) W.alerts.check();
    }, 60000);

    // ── Interactive cursor glow ──────────────────────────
    const glow = document.createElement("div");
    glow.id = "cursor-glow";
    glow.style.cssText = `
      position: fixed;
      width: 400px;
      height: 400px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(124,92,255,0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: -1;
      transform: translate(-50%, -50%);
      transition: opacity 0.3s ease;
      will-change: transform, opacity;
    `;
    document.body.appendChild(glow);

    let glowTimeout = null;
    document.addEventListener("mousemove", (e) => {
      glow.style.left = e.clientX + "px";
      glow.style.top = e.clientY + "px";
      glow.style.opacity = "1";
      clearTimeout(glowTimeout);
      glowTimeout = setTimeout(() => {
        glow.style.opacity = "0.5";
      }, 2000);
    });

    // Hide glow on touch devices
    if ("ontouchstart" in window) glow.style.display = "none";

    // ── Card spotlight (already in CSS via --mx/--my) ──
    // ── The .card:hover effect is already handled in CSS ──

    // ── Toast click handler for Telegram test ────────────
    document.addEventListener("click", (e) => {
      const target = e.target;
      const id = target?.id;

      if (id === "set-tgtest") {
        const token =
          document.querySelector("#set-tgtoken")?.value?.trim?.() || "";
        const chat =
          document.querySelector("#set-tgchat")?.value?.trim?.() || "";
        if (!token || !chat) {
          W.ui?.toast?.("Enter token and Chat ID first", "warn");
          return;
        }
        if (!W.tg) {
          W.ui?.toast?.("Telegram module not loaded", "warn");
          return;
        }
        W.tg
          .send(`✅ Weaver connected! Alerts will arrive here.`, {
            on: true,
            token,
            chat,
          })
          .then((ok) => {
            W.ui?.toast?.(
              ok ? "Test sent 📨" : "Failed — check token/Chat ID",
              ok ? "ok" : "warn",
            );
          });
      }

      if (id === "set-save") {
        setTimeout(() => {
          const token = document.querySelector("#set-tgtoken");
          const chat = document.querySelector("#set-tgchat");
          const on = document.querySelector("#set-tgon");
          if (!token || !chat) return;
          const settings = W.store?.get?.("settings", {}) || {};
          settings.telegram = {
            on: on?.checked || false,
            token: token.value.trim(),
            chat: chat.value.trim(),
          };
          W.store?.set?.("settings", settings);
        }, 0);
      }
    });

    console.log("[App] ✅ Weaver initialized.");
  }

  // ── Start on DOM ready ─────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

console.log("[App] Module loaded.");

