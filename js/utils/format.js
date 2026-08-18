
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
