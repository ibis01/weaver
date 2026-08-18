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
