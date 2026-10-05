// ===============================================================
//         Formatting Utilities for Weaver
// ===============================================================

// CRITICAL: Initialize W.fmt namespace FIRST
window.W = window.W || {};
W.fmt = W.fmt || {};

(function () {
  const CURRENCIES = {
    usd: { symbol: "$", locale: "en-US" },
    ngn: { symbol: "₦", locale: "en-NG" },
    eur: { symbol: "€", locale: "de-DE" },
    gbp: { symbol: "£", locale: "en-GB" },
    inr: { symbol: "₹", locale: "en-IN" },
    jpy: { symbol: "¥", locale: "ja-JP" },
    aud: { symbol: "A$", locale: "en-AU" },
    cad: { symbol: "C$", locale: "en-CA" },
    btc: { symbol: "₿", locale: "en-US" },
    eth: { symbol: "Ξ", locale: "en-US" },
  };

  /**
   * Format a number as currency
   */

  // -------------------------------------------------------------
  // FX rate state and helpers
  // -------------------------------------------------------------

  const FX_API = "https://api.frankfurter.dev/v2/rates";
  const FX_TTL_MS = 6 * 60 * 60 * 1000;

  let fxRates = { USD: 1 };
  let fxDate = null;
  let fxLoadedAt = 0;
  let fxLoading = null;

  W.fmt.getCurrency = function () {
    try {
      const settings = W.store?.get?.("settings", {});
      if (
        settings &&
        typeof settings === "object" &&
        !Array.isArray(settings) &&
        typeof settings.currency === "string"
      ) {
        const currency = settings.currency.toLowerCase();
        if (CURRENCIES[currency]) {
          return currency;
        }
      }
    } catch (e) {
      console.warn("[Format] Failed to read currency:", e?.message);
    }
    return "usd";
  };

  W.fmt.getCurrencyConfig = function () {
    const currency = W.fmt.getCurrency();
    return { ...(CURRENCIES[currency] || CURRENCIES.usd) };
  };

  W.fmt.getFxState = function () {
    return {
      rates: { ...fxRates },
      date: fxDate,
      loadedAt: fxLoadedAt,
      stale: !fxLoadedAt || Date.now() - fxLoadedAt > FX_TTL_MS,
    };
  };

  W.fmt.loadFxRates = async function (options = {}) {
    const force = options.force === true;
    if (!force && fxLoadedAt && Date.now() - fxLoadedAt < FX_TTL_MS) {
      return W.fmt.getFxState();
    }
    if (fxLoading) {
      return fxLoading;
    }
    fxLoading = (async () => {
      try {
        const targets = ["EUR", "GBP", "NGN", "INR", "JPY", "AUD", "CAD"].join(
          ",",
        );
        const url = `${FX_API}?base=USD&quotes=${encodeURIComponent(targets)}`;
        const fxController = new AbortController();
        const fxTimer = setTimeout(() => fxController.abort(), 10000);
        let response;
        try {
          response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            credentials: "omit",
            cache: "no-store",
            signal: fxController.signal,
          });
        } finally {
          clearTimeout(fxTimer);
        }
        if (!response.ok) {
          throw new Error(`FX provider returned HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload)) {
          throw new Error("FX provider returned invalid data");
        }
        const nextRates = { USD: 1 };
        for (const row of payload) {
          if (
            !row ||
            typeof row.quote !== "string" ||
            typeof row.rate !== "number" ||
            !Number.isFinite(row.rate) ||
            row.rate <= 0
          ) {
            continue;
          }
          const code = row.quote.toUpperCase();
          if (CURRENCIES[code.toLowerCase()]) {
            nextRates[code] = row.rate;
          }
        }
        if (Object.keys(nextRates).length < 2) {
          throw new Error("FX provider returned no usable rates");
        }
        fxRates = nextRates;
        const firstDate = payload.find(
          (row) => typeof row?.date === "string",
        );
        fxDate = firstDate?.date || null;
        fxLoadedAt = Date.now();
        console.info(
          `[Format] FX rates loaded${fxDate ? ` for ${fxDate}` : ""}.`,
        );
        return W.fmt.getFxState();
      } catch (error) {
        console.warn(
          "[Format] FX rate loading failed:",
          error?.message || error,
        );
        return W.fmt.getFxState();
      } finally {
        fxLoading = null;
      }
    })();
    return fxLoading;
  };

  W.fmt.refreshFxRates = function () {
    return W.fmt.loadFxRates({ force: true });
  };

  W.fmt.money = function (amount, options = {}) {
    // No false precision: a missing value is not zero.
    if (
      amount === null ||
      amount === undefined ||
      amount === "" ||
      (typeof amount === "number" && !Number.isFinite(amount))
    ) {
      return "\u2014";
    }
    if (amount === null || amount === undefined || isNaN(amount)) {
      return "$0.00";
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) {
      return "$0.00";
    }
    const currency = W.fmt.getCurrency();
    const config = CURRENCIES[currency] || CURRENCIES.usd;
    const code = currency.toUpperCase();
    let convertedAmount = numericAmount;
    // BTC and ETH are not fiat. Do not convert via FX rates.
    if (code !== "USD" && code !== "BTC" && code !== "ETH") {
      const rate = fxRates[code];
      if (Number.isFinite(rate) && rate > 0) {
        convertedAmount = numericAmount * rate;
      }
    }
    try {
      return new Intl.NumberFormat(config.locale, {
        style: "currency",
        currency: code,
        minimumFractionDigits: options.compact ? 0 : 2,
        maximumFractionDigits: options.compact ? 0 : 2,
      }).format(convertedAmount);
    } catch (e) {
      return `${config.symbol}${convertedAmount.toFixed(2)}`;
    }
  };

  /**
   * Format a number as price (crypto)
   */
  W.fmt.price = function (price) {
    // No false precision: a missing value is not zero.
    if (
      amount === null ||
      amount === undefined ||
      amount === "" ||
      (typeof amount === "number" && !Number.isFinite(amount))
    ) {
      return "\u2014";
    }
    if (price === null || price === undefined || isNaN(price)) return "$0.00";
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  /**
   * Format percentage
   */
  W.fmt.pct = function (value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return "0.00%";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(decimals)}%`;
  };

  /**
   * Format compact numbers (1.2M, 3.4B)
   */
  W.fmt.compact = function (num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

    W.fmt.num = function (n) {
      if (n == null || isNaN(n)) return "—";
      const num = Number(n);
      const abs = Math.abs(num);
      if (abs >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
      if (abs >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
      return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
    };

  /**
   * Get currency symbol
   */
  W.fmt.getSymbol = function () {
    const currency = W.store?.get("settings", {})?.currency || "usd";
    return CURRENCIES[currency]?.symbol || "$";
  };

  /**
   * Escape HTML to prevent XSS
   */
  W.fmt.escapeHTML = function (str) {
    // Escapes &, <, >, ", '. Attribute-safe: the output can be used
    // in text and quoted-attribute positions.
    //
    // The prior implementation used the textContent → innerHTML
    // trick, which escapes only &, <, > — unsafe in any attribute
    // context where a payload containing a quote could break out.
    if (str === null || str === undefined) return "";
    let value;
    try {
      value = String(str);
    } catch (e) {
      return "";
    }
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  };

  /**
   * Format timestamp to readable date
   */
  W.fmt.date = function (timestamp, options = {}) {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    if (options.short) {
      return date.toLocaleDateString();
    }
    return date.toLocaleString();
  };

  /**
   * Format relative time (e.g., "5 minutes ago")
   */
  W.fmt.relativeTime = function (timestamp) {
    if (!timestamp) return "N/A";
    const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return W.fmt.date(timestamp, { short: true });
  };

  /**
   * Mask a wallet address for privacy.
   * e.g., "0x1234567890abcdef1234567890abcdef12345678" -> "0x1234...5678"
   */
  W.fmt.maskAddress = function (address) {
    if (!address || typeof address !== "string") return "";
    if (address.length <= 10) return address;
    return `${address.substring(0, 6)}…${address.substring(address.length - 4)}`;
  };

  console.log("[Format] Utilities loaded.");

  // ── Boot: load FX rates once the page is interactive ──────────
  // The prior hook lived inside W.applySettings in app.js, which is
  // defined but never called — so FX rates were never fetched at
  // boot, and every currency switch showed the USD number with a
  // different symbol. This block self-boots: it kicks off the load
  // on DOM ready (or immediately if readyState is already past
  // loading), then triggers a re-render if W.refresh is available
  // and the rates actually arrived.
  function bootFx() {
    const before = W.fmt.getFxState();
    W.fmt
      .loadFxRates()
      .then(() => {
        const after = W.fmt.getFxState();
        if (after && before && after.loadedAt !== before.loadedAt) {
          try {
            if (typeof W.refresh === "function") W.refresh();
          } catch (e) {
            console.warn("[Format] FX re-render failed:", e?.message || e);
          }
        }
      })
      .catch((e) => {
        console.warn("[Format] FX boot load failed:", e?.message || e);
      });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootFx, { once: true });
    } else {
      // Deferred one tick so app.js can finish defining W.refresh.
      setTimeout(bootFx, 0);
    }
  }
})();
