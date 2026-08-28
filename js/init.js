// ===============================================================
//         Initialization Script for Weaver 
// ===============================================================

(function () {
  // Ensure W is defined
  window.W = window.W || {};

  // ── Clock Updates ────────────────────────────────────────
  function updateClock() {
    const clockEl = document.getElementById("clock");
    if (clockEl) {
      clockEl.textContent = new Date().toLocaleTimeString();
    }
  }

  // ── Currency Initialization ──────────────────────────────
  function initCurrency() {
    const curEl = document.getElementById("currency");
    if (!curEl) return;

    // Get stored currency or default to USD
    const settings = W.store?.get?.("settings", {}) || {};
    const storedCurrency = settings.currency || "usd";

    // Update dropdown
    curEl.value = storedCurrency;

    // Add change handler if not already set
    if (!curEl._listenerAttached) {
      curEl._listenerAttached = true;
      curEl.addEventListener("change", function () {
        const settings = W.store?.get?.("settings", {}) || {};
        settings.currency = this.value;
        W.store?.set?.("settings", settings);
        // Refresh the view to update prices
        if (W.refresh) W.refresh();
        if (W.ui?.toast)
          W.ui.toast(`Currency changed to ${this.value.toUpperCase()}`, "info");
      });
    }
  }

  // ── Auto-Refresh Initialization ──────────────────────────
  function initRefresh() {
    const settings = W.store?.get?.("settings", {}) || {};
    const seconds = settings.refresh ?? 60;

    // Clear existing interval
    if (window._refreshInterval) {
      clearInterval(window._refreshInterval);
      window._refreshInterval = null;
    }

    if (seconds > 0) {
      window._refreshInterval = setInterval(() => {
        // Only refresh if no modal is open
        if (!document.querySelector("#modal-root .modal")) {
          if (W.refresh) W.refresh();
        }
      }, seconds * 1000);
    }
  }

  // ── Sync Button Handler ──────────────────────────────────
  function initSyncButton() {
    const syncBtn = document.getElementById("sync-btn");
    if (!syncBtn) return;

    if (!syncBtn._listenerAttached) {
      syncBtn._listenerAttached = true;
      syncBtn.onclick = () => {
        if (W.sync?.syncVault) {
          W.sync.syncVault();
        } else if (W.ui?.toast) {
          W.ui.toast("Sync module not available", "warn");
        }
      };
    }
  }

  // ── Theme Initialization ─────────────────────────────────
  function initTheme() {
    // Check for saved theme preference
    const settings = W.store?.get?.("settings", {}) || {};
    const theme = settings.theme || "dark";

    // Apply theme
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  // ── Run All Initializations ──────────────────────────────
  function runInit() {
    // Wait for W.store to be available
    if (!W.store) {
      setTimeout(runInit, 100);
      return;
    }

    updateClock();
    initCurrency();
    initRefresh();
    initSyncButton();
    initTheme();

    console.log("✅ Weaver initialization complete.");
  }

  // ── Start ─────────────────────────────────────────────────
  // Update clock immediately, then every second
  updateClock();
  setInterval(updateClock, 1000);

  // Run full initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runInit);
  } else {
    runInit();
  }

  // ── Expose refresh initializer ───────────────────────────
  window._initRefresh = initRefresh;
})();
