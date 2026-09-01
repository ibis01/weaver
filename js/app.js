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
    // ── NEW: Token Analysis ──────────────────────────────
    { id: "token", icon: "🔍", label: "Token Analysis" },
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
    theses: (v) =>
      W.theses?.render?.(v) ||
      W.ui?.toast?.("Theses module not loaded", "warn"),
    journal: (v) =>
      W.journal?.render?.(v) ||
      W.ui?.toast?.("Journal module not loaded", "warn"),
    sync: (v) => {
      if (W.sync?.render) W.sync.render(v);
      else W.ui?.toast?.("Sync module not loaded", "warn");
    },
    settings: (v) =>
      W.misc?.renderSettings?.(v) ||
      W.ui?.toast?.("Settings module not loaded", "warn"),
    // ── NEW: Token Analysis route ───────────────────────────
    token: async (v) => {
      const param = getPageParam();
      if (W.tokenAnalysis) {
        if (param) {
          await W.tokenAnalysis.render(v, param);
        } else {
          await W.tokenAnalysis.render(v);
        }
      } else {
        W.ui?.toast?.("Token Analysis module not loaded", "warn");
      }
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
