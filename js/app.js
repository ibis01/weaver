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

  // ── Shared route dispatcher ────────────────────────────────
  // Resolves the module method at dispatch time (not at script-load
  // time, which matters because modules load in order). Catches
  // failures and renders an honest error card instead of silently
  // leaving the view empty or firing a false "not loaded" toast.
  async function safeRender(view, name, getMethod) {
    const method = getMethod();
    if (typeof method !== "function") {
      W.ui?.toast?.(`${name} module not loaded`, "warn");
      view.innerHTML = `<div class="card"><p class="muted">${name} module not available.</p></div>`;
      return;
    }
    try {
      await method(view);
    } catch (e) {
      console.warn(`[Router] ${name} render failed:`, e);
      view.innerHTML = `<div class="card"><p class="muted">Failed to load ${name}: ${W.fmt?.escapeHTML?.(e.message) || "unknown error"}</p></div>`;
    }
  }

  const routes = {
    dashboard: (v) => safeRender(v, "dashboard", () => W.dashboard?.render),
    portfolio: (v) =>
      safeRender(v, "portfolio", () => W.dashboard?.renderPortfolio),
    watchlist: (v) => safeRender(v, "watchlist", () => W.watchlist?.render),
    explorer: (v) => safeRender(v, "explorer", () => W.explorer?.render),
    alerts: (v) => safeRender(v, "alerts", () => W.alerts?.render),
    news: (v) => safeRender(v, "news", () => W.news?.render),
    ai: (v) => safeRender(v, "ai", () => W.ai?.render),
    optimizer: (v) => safeRender(v, "optimizer", () => W.optimizer?.render),
    time: (v) => safeRender(v, "time", () => W.time?.render),
    trader: (v) => safeRender(v, "trader", () => W.trader?.render),
    gems: (v) => safeRender(v, "gems", () => W.gems?.render),
    shield: (v) => safeRender(v, "shield", () => W.shield?.render),
    web3: (v) => safeRender(v, "web3", () => W.web3?.render),
    defi: (v) => safeRender(v, "defi", () => W.misc?.renderDefi),
    airdrops: (v) => safeRender(v, "airdrops", () => W.misc?.renderAirdrops),
    market: (v) => safeRender(v, "market", () => W.market?.render),
    sectors: (v) => safeRender(v, "sectors", () => W.sectors?.render),
    whales: (v) => safeRender(v, "whales", () => W.whales?.render),
    smart: (v) => safeRender(v, "smart", () => W.smart?.render),
    unlocks: (v) => safeRender(v, "unlocks", () => W.unlocks?.render),
    learn: (v) => safeRender(v, "learn", () => W.learn?.render),
    profile: (v) => safeRender(v, "profile", () => W.misc?.renderProfile),
    pro: (v) => safeRender(v, "pro", () => W.misc?.renderPro),
    theses: (v) => safeRender(v, "theses", () => W.theses?.render),
    journal: (v) => safeRender(v, "journal", () => W.journal?.render),
    sync: (v) => safeRender(v, "sync", () => W.sync?.render),
    settings: (v) => safeRender(v, "settings", () => W.misc?.renderSettings),
    token: async (v) => {
      const param = getPageParam();
      if (!W.tokenAnalysis?.render) {
        W.ui?.toast?.("Token Analysis module not loaded", "warn");
        v.innerHTML = `<div class="card"><p class="muted">Token Analysis module not available.</p></div>`;
        return;
      }
      try {
        await W.tokenAnalysis.render(v, param || undefined);
      } catch (e) {
        console.warn("[Router] token render failed:", e);
        v.innerHTML = `<div class="card"><p class="muted">Failed to load token analysis: ${W.fmt?.escapeHTML?.(e.message) || "unknown error"}</p></div>`;
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

    // Clear previous route's DOM before dispatch. Without this, a
    // failed or empty render leaves the previous route's content on
    // screen (e.g. clicking News showed stale Sync content).
    view.innerHTML = "";

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
