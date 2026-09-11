// ===============================================================
//         Initialization Script for Weaver
// ===============================================================

(function () {
  // Ensure W is defined
  window.W = window.W || {};

  // ── One-time cleanup: purge legacy plaintext Telegram credentials ──
  // Older versions stored the Telegram bot token in plaintext under
  // "telegram_settings" and inside settings.telegram.token. Both paths
  // are now removed in favor of the encrypted_settings store (see
  // js/lib/crypto/secure-session.js). This runs once per device to
  // scrub any plaintext token left over from before the fix, without
  // requiring a passphrase prompt at boot.
  (function purgeLegacyPlaintextTelegramToken() {
    let purged = false;

    if (W.store?.get?.("telegram_settings", null)) {
      W.store.delete("telegram_settings");
      purged = true;
    }

    const settings = W.store?.get?.("settings", {}) || {};
    if (settings.telegram && settings.telegram.token) {
      delete settings.telegram.token;
      W.store.set("settings", settings);
      purged = true;
    }

    if (purged) {
      console.warn(
        "[Init] Removed legacy plaintext Telegram token from storage. " +
          "Re-enter your bot token in Settings to re-enable alerts.",
      );
      W.store?.set?.("telegram_migration_notice_pending", true);
    }
  })();

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

  // Migrate legacy holdings to canonical assetId (one-time)
  if (W.portfolio && W.portfolio.migrateLegacyHoldings) {
    W.portfolio.migrateLegacyHoldings().then((count) => {
      if (count > 0) {
        console.log(
          `[Init] Migrated ${count} legacy holdings to canonical assetId.`,
        );
      }
    });
  }
  // ── Run All Initializations ──────────────────────────────
  function runInit() {
    // Wait for W.store to be available
    if (!W.store) {
      setTimeout(runInit, 100);
      return;
    }

    // ── Sentry Integration  ──
    if (window.Sentry && typeof Sentry.init === "function") {
      // Read via W.store, not raw localStorage — it prefixes/JSON-encodes
      // keys, so this must match how the Settings UI saves it (see
      // js/features/misc.js) or the two would silently never agree.
      const dsn = W.store?.get?.("sentry_dsn", "") || "";
      if (dsn) {
        Sentry.init({
          dsn,
          environment: "production",
          release: "weaver@2.0.0",
          tracesSampleRate: 0.1,
        });
        W.logger?.info("Sentry", "Sentry initialized");
      }
    }

    updateClock();
    initCurrency();
    initRefresh();
    initSyncButton();
    initTheme();

    if (W.store?.get?.("telegram_migration_notice_pending", false)) {
      W.store.delete("telegram_migration_notice_pending");
      W.ui?.toast?.(
        "Telegram alerts were reset for security — please re-enter your bot token in Settings.",
        "info",
        8000,
      );
    }

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
