// ===============================================================
//         Weaver Core Application
// ===============================================================
// Purpose: Handle routing, navigation rendering, and app initialization.
// Security Fix: Removed plaintext Telegram save handler (P0 Task 1).
// ===============================================================

window.W = window.W || {};

(function () {
  const NAV_GROUPS = [
    {
      label: "PRIMARY",
      items: [
        {
          id: "dashboard",
          icon: "📊",
          label: "Dashboard",
          route: "#/dashboard",
        },
        { id: "explorer", icon: "🔍", label: "Discover", route: "#/explorer" },
        { id: "token", icon: "📈", label: "Analyze", route: "#/token" },
        {
          id: "portfolio",
          icon: "💼",
          label: "Portfolio",
          route: "#/portfolio",
        },
      ],
    },
    {
      label: "MONITOR",
      items: [
        {
          id: "watchlist",
          icon: "⭐",
          label: "Watchlist",
          route: "#/watchlist",
        },
        { id: "alerts", icon: "🚨", label: "Alerts", route: "#/alerts" },
        { id: "market", icon: "📡", label: "Signals", route: "#/market" },
      ],
    },
    {
      label: "INTELLIGENCE",
      items: [
        { id: "news", icon: "📰", label: "News", route: "#/news" },
        { id: "whales", icon: "🐋", label: "Whale Tracker", route: "#/whales" },
        { id: "smart", icon: "🧠", label: "Smart Money", route: "#/smart" },
        { id: "theses", icon: "🎯", label: "Theses", route: "#/theses" },
        { id: "journal", icon: "📓", label: "Journal", route: "#/journal" },
      ],
    },
    {
      label: "TOOLS",
      items: [
        { id: "shield", icon: "🛡️", label: "Token Shield", route: "#/shield" },
        {
          id: "optimizer",
          icon: "🧮",
          label: "Optimizer",
          route: "#/optimizer",
        },
        {
          id: "unlocks",
          icon: "🔓",
          label: "Token Unlocks",
          route: "#/unlocks",
        },
        { id: "ai", icon: "🧠", label: "AI Insights", route: "#/ai" },
        { id: "settings", icon: "⚙️", label: "Settings", route: "#/settings" },
      ],
    },
  ];

  const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

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
    token: async (v) => {
      const param = getPageParam();
      if (W.tokenAnalysis) {
        if (param) await W.tokenAnalysis.render(v, param);
        else await W.tokenAnalysis.render(v);
      } else {
        W.ui?.toast?.("Token Analysis module not loaded", "warn");
      }
    },
  };

  function getCurrentPage() {
    return location.hash.slice(2).split("/")[0] || "dashboard";
  }
  function getPageParam() {
    const parts = location.hash.slice(2).split("/");
    return parts.length > 1 ? parts[1] : null;
  }

  function route() {
    const hash = location.hash.slice(2) || "dashboard";
    const [page, param] = hash.split("/");
    const activeId = page === "coin" ? "explorer" : page;

    document.querySelectorAll("#nav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.id === activeId);
    });

    const navItem = ALL_NAV_ITEMS.find((n) => n.id === activeId);
    const titleEl = document.getElementById("page-title");
    if (titleEl) titleEl.textContent = navItem ? navItem.label : "Weaver";

    const view = document.getElementById("view");
    if (!view) {
      console.warn("[App] View element not found");
      return;
    }

    try {
      if (page === "coin" && param) {
        if (W.explorer?.renderCoin) W.explorer.renderCoin(view, param);
        else
          view.innerHTML =
            '<p class="muted">Explorer module not available.</p>';
      } else if (routes[page]) {
        routes[page](view);
      } else {
        view.innerHTML =
          '<div class="card"><h3>404</h3><p class="muted">Page not found.</p></div>';
      }
    } catch (e) {
      console.error("[App] Route error:", e);
      view.innerHTML = `<div class="card"><h3>⚠️ Something went wrong</h3><p class="muted">${W.fmt?.escapeHTML?.(e.message) || e.message}</p><p class="muted small">Check the console (F12) for details.</p></div>`;
    }

    const updated = document.getElementById("last-updated");
    if (updated)
      updated.textContent = `updated ${new Date().toLocaleTimeString()} · via ${W.api?.source || "…"}`;
    if (W.alerts?.check) W.alerts.check();
  }

  function updateStreak() {
    const today = new Date().toDateString();
    const streak = W.store?.get?.("streak", null);
    if (!streak || streak.last !== today) {
      const yesterday = new Date(Date.now() - 864e5).toDateString();
      const count = streak && streak.last === yesterday ? streak.count + 1 : 1;
      W.store?.set?.("streak", { last: today, count });
    }
  }

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

  W.applySettings = function () {
    const cur = W.currency?.() || "usd";
    const el = document.getElementById("currency");
    if (el) el.value = cur;
    startLoop();
  };

  W.currency = function () {
    return W.store?.get?.("settings", {})?.currency || "usd";
  };
  W.refresh = function () {
    route();
  };

  function init() {
    console.log("[App] Initializing Weaver...");

    const navEl = document.getElementById("nav");
    if (navEl) {
      navEl.innerHTML = NAV_GROUPS.map((group) => {
        const groupHtml = `<div class="nav-group-label">${group.label}</div>`;
        const itemsHtml = group.items
          .map(
            (n) => `
          <a href="${n.route}" data-id="${n.id}">
            <span class="nav-ico">${n.icon}</span>
            <span>${n.label}</span>
            ${n.id === "alerts" ? '<span class="nav-badge" id="alert-badge"></span>' : ""}
          </a>
        `,
          )
          .join("");
        return groupHtml + itemsHtml;
      }).join("");
    }

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

    const refreshBtn = document.getElementById("btn-refresh");
    if (refreshBtn) refreshBtn.onclick = route;

    const proBtn = document.getElementById("btn-pro");
    if (proBtn) proBtn.onclick = () => (location.hash = "#/pro");

    const syncBtn = document.getElementById("sync-btn");
    if (syncBtn) {
      syncBtn.onclick = () => {
        if (W.sync?.syncVault) W.sync.syncVault();
        else W.ui?.toast?.("Sync module not available", "warn");
      };
    }

    window.addEventListener("unhandledrejection", (e) => {
      console.warn("[App] Unhandled rejection:", e.reason);
      const msg = e.reason?.message || "Request failed";
      const view = document.getElementById("view");
      const spinner = view?.querySelector(".spinner");
      if (spinner) {
        spinner.outerHTML = `<p class="muted small mt">⚠️ ${W.fmt?.escapeHTML?.(msg) || msg} — some live data is unavailable (showing cache where possible). Try ⟳ or another network.</p>`;
      }
    });

    if (W.achievements?.check) W.achievements.check();
    updateStreak();
    if (W.sync?.boot) W.sync.boot();

    window.addEventListener("hashchange", route);
    route();
    startLoop();

    setInterval(() => {
      if (W.alerts?.check) W.alerts.check();
    }, 60000);

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

      // SECURITY FIX: Removed plaintext `if (id === "set-save")` handler.
      // Credential saving is now exclusively handled by the secure vault in `W.misc.renderSettings`.
    });

    console.log("[App] ✅ Weaver initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

console.log("[App] Module loaded.");
