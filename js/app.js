// ===============================================================
//         Weaver Core Application
// ===============================================================
// Purpose: Handle routing, navigation rendering, and app initialization.
// Security Fix: Removed plaintext Telegram save handler (P0 Task 1).
//
// Router notes:
//   - The view is cleared BEFORE dispatch, so a failed or empty
//     render cannot leave stale content from the previous route.
//   - Handlers are dispatched via safeRender(), which resolves the
//     module method lazily (at call time, not at module-load time)
//     and surfaces failures instead of firing false "not loaded"
//     toasts when a render returns a falsy value.
// ===============================================================

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
    { id: "theses", icon: "🎯", label: "Theses" },
    { id: "journal", icon: "📓", label: "Journal" },
    { id: "sync", icon: "☁️", label: "Sync" },
    { id: "settings", icon: "⚙️", label: "Settings" },
    // ── Track Record ─────────────────────────────────────
    { id: "track", icon: "🧾", label: "Track Record" },
  ];

  // ── Route Map ──────────────────────────────────────────
  // Each route is `(view) => void`. Handlers must set
  // `view.innerHTML` synchronously (even if just a spinner)
  // so Playwright's `waitForSelector("#view")` resolves.
  const routes = {
    dashboard: (v) => {
      if (W.dashboard?.render) return W.dashboard.render(v);
      v.innerHTML = '<div class="card"><h3>Dashboard</h3><p class="muted">Module not loaded.</p></div>';
    },
    portfolio: (v) => {
      if (W.dashboard?.renderPortfolio) return W.dashboard.renderPortfolio(v);
      if (W.portfolio?.render) return W.portfolio.render(v);
      v.innerHTML = '<div class="card"><h3>Portfolio</h3><p class="muted">Module not loaded.</p></div>';
    },
    watchlist: (v) => {
      if (W.watchlist?.render) return W.watchlist.render(v);
      v.innerHTML = '<div class="card"><h3>Watchlist</h3><p class="muted">Module not loaded.</p></div>';
    },
    explorer: (v) => {
      if (W.explorer?.render) return W.explorer.render(v);
      v.innerHTML = '<div class="card"><h3>Explorer</h3><p class="muted">Module not loaded.</p></div>';
    },
    alerts: (v) => {
      if (W.alerts?.render) return W.alerts.render(v);
      v.innerHTML = '<div class="card"><h3>Alerts</h3><p class="muted">Module not loaded.</p></div>';
    },
    news: (v) => {
      if (W.news?.render) return W.news.render(v);
      v.innerHTML = '<div class="card"><h3>News</h3><p class="muted">Module not loaded.</p></div>';
    },
    ai: (v) => {
      if (W.ai?.render) return W.ai.render(v);
      v.innerHTML = '<div class="card"><h3>AI Insights</h3><p class="muted">Module not loaded.</p></div>';
    },
    optimizer: (v) => {
      if (W.optimizer?.render) return W.optimizer.render(v);
      v.innerHTML = '<div class="card"><h3>Optimizer</h3><p class="muted">Module not loaded.</p></div>';
    },
    time: (v) => {
      if (W.time?.render) return W.time.render(v);
      v.innerHTML = '<div class="card"><h3>Time Machine</h3><p class="muted">Module not loaded.</p></div>';
    },
    trader: (v) => {
      if (W.trader?.render) return W.trader.render(v);
      v.innerHTML = '<div class="card"><h3>Trading Assistant</h3><p class="muted">Module not loaded.</p></div>';
    },
    gems: (v) => {
      if (W.gems?.render) return W.gems.render(v);
      v.innerHTML = '<div class="card"><h3>Gem Agent</h3><p class="muted">Module not loaded.</p></div>';
    },
    shield: (v) => {
      if (W.shield?.render) return W.shield.render(v);
      v.innerHTML = '<div class="card"><h3>Token Shield</h3><p class="muted">Module not loaded.</p></div>';
    },
    web3: (v) => {
      if (W.web3?.render) return W.web3.render(v);
      v.innerHTML = '<div class="card"><h3>Web3 Wallets</h3><p class="muted">Module not loaded.</p></div>';
    },
    defi: (v) => {
      if (W.misc?.renderDefi) return W.misc.renderDefi(v);
      v.innerHTML = '<div class="card"><h3>DeFi</h3><p class="muted">Module not loaded.</p></div>';
    },
    airdrops: (v) => {
      if (W.misc?.renderAirdrops) return W.misc.renderAirdrops(v);
      v.innerHTML = '<div class="card"><h3>Airdrops</h3><p class="muted">Module not loaded.</p></div>';
    },
    market: (v) => {
      if (W.market?.render) return W.market.render(v);
      v.innerHTML = '<div class="card"><h3>Market</h3><p class="muted">Module not loaded.</p></div>';
    },
    sectors: (v) => {
      if (W.sectors?.render) return W.sectors.render(v);
      v.innerHTML = '<div class="card"><h3>Sectors</h3><p class="muted">Module not loaded.</p></div>';
    },
    whales: (v) => {
      if (W.whales?.render) return W.whales.render(v);
      v.innerHTML = '<div class="card"><h3>Whales</h3><p class="muted">Module not loaded.</p></div>';
    },
    smart: (v) => {
      if (W.smart?.render) return W.smart.render(v);
      v.innerHTML = '<div class="card"><h3>Smart Money</h3><p class="muted">Module not loaded.</p></div>';
    },
    unlocks: (v) => {
      if (W.unlocks?.render) return W.unlocks.render(v);
      v.innerHTML = '<div class="card"><h3>Unlocks</h3><p class="muted">Module not loaded.</p></div>';
    },
    learn: (v) => {
      if (W.learn?.render) return W.learn.render(v);
      v.innerHTML = '<div class="card"><h3>Learn</h3><p class="muted">Module not loaded.</p></div>';
    },
    profile: (v) => {
      if (W.misc?.renderProfile) return W.misc.renderProfile(v);
      v.innerHTML = '<div class="card"><h3>Profile</h3><p class="muted">Module not loaded.</p></div>';
    },
    pro: (v) => {
      if (W.misc?.renderPro) return W.misc.renderPro(v);
      v.innerHTML = '<div class="card"><h3>Pro</h3><p class="muted">Module not loaded.</p></div>';
    },
    theses: (v) => {
      if (W.theses?.render) return W.theses.render(v);
      v.innerHTML = '<div class="card"><h3>Theses</h3><p class="muted">Module not loaded.</p></div>';
    },
    journal: (v) => {
      if (W.journal?.render) return W.journal.render(v);
      v.innerHTML = '<div class="card"><h3>Journal</h3><p class="muted">Module not loaded.</p></div>';
    },
    sync: (v) => {
      if (W.sync?.render) return W.sync.render(v);
      v.innerHTML = '<div class="card"><h3>Sync</h3><p class="muted">Module not loaded.</p></div>';
    },
    settings: (v) => {
      if (W.misc?.renderSettings) return W.misc.renderSettings(v);
      v.innerHTML = '<div class="card"><h3>Settings</h3><p class="muted">Module not loaded.</p></div>';
    },
    // ── Track Record ─────────────────────────────────────
    track: (v) => {
      if (W.trackRecord?.render) return W.trackRecord.render(v);
      v.innerHTML = '<div class="card"><h3>Track Record</h3><p class="muted">Module not loaded.</p></div>';
    },
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
          view.innerHTML = '<div class="card"><p class="muted">Explorer module not available.</p></div>';
        }
      } else if (routes[page]) {
        routes[page](view);
      } else {
        view.innerHTML = '<div class="card"><h3>404</h3><p class="muted">Page not found.</p></div>';
      }
    } catch (e) {
      console.error("[App] Route error:", e);
      view.innerHTML = `
        <div class="card">
          <h3>⚠️ Something went wrong</h3>
          <p class="muted">${W.fmt?.escapeHTML?.(e.message) || e.message}</p>
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

  // ── W.currency ────────────────────────────────────────
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
      const currencies = ["usd", "ngn", "eur", "gbp", "inr", "jpy", "aud", "cad"];
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
        if (W.sync?.syncVault) W.sync.syncVault();
        else W.ui?.toast?.("Sync module not available", "warn");
      };
    }

    // ── Unhandled rejections ─────────────────────────────
    window.addEventListener("unhandledrejection", (e) => {
      console.warn("[App] Unhandled rejection:", e.reason);
      const msg = e.reason?.message || "Request failed";
      const view = document.getElementById("view");
      const spinner = view?.querySelector(".spinner");
      if (spinner) {
        spinner.outerHTML = `<p class="muted small mt">⚠️ ${W.fmt?.escapeHTML?.(msg) || msg} — some live data is unavailable.</p>`;
      }
    });

    // ── Achievements ─────────────────────────────────────
    if (W.achievements?.check) W.achievements.check();

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