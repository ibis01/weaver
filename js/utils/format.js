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
  W.fmt.money = function (amount, options = {}) {
    if (amount === null || amount === undefined || isNaN(amount))
      return "$0.00";
    const currency = W.store?.get("settings", {})?.currency || "usd";
    const config = CURRENCIES[currency] || CURRENCIES.usd;

    try {
      return new Intl.NumberFormat(config.locale, {
        style: "currency",
        currency: currency.toUpperCase(),
        minimumFractionDigits: options.compact ? 0 : 2,
        maximumFractionDigits: options.compact ? 0 : 2,
      }).format(amount);
    } catch (e) {
      return `$${Number(amount).toFixed(2)}`;
    }
  };

  /**
   * Format a number as price (crypto)
   */
  W.fmt.price = function (price) {
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
    if (!str || typeof str !== "string") return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
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
  W.fmt.maskAddress = function(address) {
    if (!address || typeof address !== 'string') return '';
    if (address.length <= 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  console.log("[Format] Utilities loaded.");
})();
