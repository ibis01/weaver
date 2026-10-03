// ===============================================================
//         Weaver Core Application 
// ===============================================================


window.W = window.W || {};

(function () {
  const MODULE_VERSION = "app-v2";

  // ── Local escaping ─────────────────────────────────────────
  // Independent of W.fmt so a partial load cannot leave the router
  // interpolating unescaped strings. Safe in both text and attribute
  // contexts.
  function localEsc(v) {
    if (v === null || v === undefined) return "";
    let s;
    try {
      s = String(v);
    } catch {
      return "";
    }
    if (!/[&<>"']/.test(s)) return s;
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const esc =
    W.fmt && typeof W.fmt.escapeHTML === "function"
      ? function (v) {
          try {
            return String(W.fmt.escapeHTML(String(v ?? "")));
          } catch {
            return localEsc(v);
          }
        }
      : localEsc;

  const MAX_HASH_LEN = 512;

  const NAV_GROUPS = [
    {
      label: "OVERVIEW",
      items: [
        {
          id: "dashboard",
          icon: "📊",
          label: "Dashboard",
          route: "#/dashboard",
        },
      ],
    },
    {
      label: "PORTFOLIO",
      items: [
        {
          id: "portfolio",
          icon: "💼",
          label: "Portfolio",
          route: "#/portfolio",
        },
        {
          id: "watchlist",
          icon: "⭐",
          label: "Watchlist",
          route: "#/watchlist",
        },
        { id: "alerts", icon: "🚨", label: "Alerts", route: "#/alerts" },
        {
          id: "walletsync",
          icon: "👛",
          label: "Synced Wallets",
          route: "#/walletsync",
        },
        {
          id: "optimizer",
          icon: "🧮",
          label: "Optimizer",
          route: "#/optimizer",
        },
      ],
    },
    {
      label: "RESEARCH",
      items: [
        { id: "gems", icon: "🔍", label: "Discover", route: "#/gems" },
        { id: "token", icon: "📈", label: "Analyze", route: "#/token" },
        {
          id: "shield",
          icon: "🛡️",
          label: "Token Shield",
          route: "#/shield",
        },
        {
          id: "unlocks",
          icon: "🔓",
          label: "Token Unlocks",
          route: "#/unlocks",
        },
      ],
    },
    {
      label: "INTELLIGENCE",
      items: [
        { id: "market", icon: "📡", label: "Signals", route: "#/market" },
        { id: "news", icon: "📰", label: "News", route: "#/news" },
        {
          id: "whales",
          icon: "🐋",
          label: "Whale Tracker",
          route: "#/whales",
        },
        { id: "smart", icon: "🧠", label: "Smart Money", route: "#/smart" },
      ],
    },
    {
      label: "DECISIONS",
      items: [
        { id: "theses", icon: "🎯", label: "Theses", route: "#/theses" },
        { id: "journal", icon: "📓", label: "Journal", route: "#/journal" },
        { id: "track", icon: "🧾", label: "Track Record", route: "#/track" },
      ],
    },
    {
      label: "SYSTEM",
      items: [
        { id: "ai", icon: "🧠", label: "AI Insights", route: "#/ai" },
        { id: "sync", icon: "☁️", label: "Encrypted Sync", route: "#/sync" },
        {
          id: "settings",
          icon: "⚙️",
          label: "Settings",
          route: "#/settings",
        },
      ],
    },
  ];

  const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

  // Bumped on every route() call. safeRender() reads it to detect
  // that a newer navigation happened while an async render was still
  // in flight, so a stale render cannot overwrite the current view.
  let routeGeneration = 0;

  // ── Shared route dispatcher ────────────────────────────────
  async function safeRender(view, name, getMethod) {
    const generation = routeGeneration;
    if (view.dataset.route !== name) return;

    let method;
    try {
      method = getMethod();
    } catch (e) {
      console.warn(`[Router] ${name} dispatch failed:`, e && e.message);
      method = null;
    }

    if (typeof method !== "function") {
      W.ui?.toast?.(`${name} module not loaded`, "warn");
      view.innerHTML = `<div class="card"><p class="muted">${esc(name)} module not available.</p></div>`;
      return;
    }

    try {
      if (generation !== routeGeneration || view.dataset.route !== name) return;
      await method(view);
      if (generation !== routeGeneration || view.dataset.route !== name) return;
    } catch (e) {
      if (generation !== routeGeneration || view.dataset.route !== name) return;
      console.warn(`[Router] ${name} render failed:`, e);
      view.innerHTML = `<div class="card"><p class="muted">Failed to load ${esc(name)}: ${esc(e && e.message)}</p></div>`;
    }
  }

  const routes = {
    dashboard: (v) => safeRender(v, "dashboard", () => W.dashboard?.render),
    portfolio: (v) =>
      safeRender(v, "portfolio", () => W.dashboard?.renderPortfolio),
    walletsync: (v) => safeRender(v, "walletsync", () => W.walletSync?.render),
    watchlist: (v) => safeRender(v, "watchlist", () => W.watchlist?.render),
    explorer: (v) => safeRender(v, "explorer", () => W.explorer?.render),
    alerts: (v) => safeRender(v, "alerts", () => W.alerts?.render),
    news: (v) => safeRender(v, "news", () => W.news?.render),
    ai: (v) => safeRender(v, "ai", () => W.ai?.render),
    optimizer: (v) => safeRender(v, "optimizer", () => W.optimizer?.render),
    time: (v) => safeRender(v, "time", () => W.time?.render),
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
    "track-record": (v) =>
      safeRender(v, "track-record", () => W.trackRecord?.render),
    track: (v) => safeRender(v, "track", () => W.trackRecord?.render),
    sync: (v) => safeRender(v, "sync", () => W.sync?.render),
    settings: (v) => safeRender(v, "settings", () => W.misc?.renderSettings),
    unlock: (v) => safeRender(v, "unlock", () => W.vaultUnlock?.render),
    token: (v) =>
      safeRender(v, "token", () => {
        if (typeof W.tokenAnalysis?.render !== "function") return null;
        const param = getPageParam();
        return (view) => W.tokenAnalysis.render(view, param || undefined);
      }),
    coin: (v) =>
      safeRender(v, "coin", () => {
        if (typeof W.explorer?.renderCoin !== "function") return null;
        const param = getPageParam();
        if (!param) return null;
        return (view) => W.explorer.renderCoin(view, param);
      }),
  };

  function getCurrentPage() {
    const raw = location.hash.slice(2);
    if (!raw) return "dashboard";
    return raw.split("/")[0] || "dashboard";
  }
  function getPageParam() {
    const parts = location.hash.slice(2).split("/");
    if (parts.length <= 1 || !parts[1]) return null;
    try {
      return decodeURIComponent(parts[1]);
    } catch {
      return parts[1];
    }
  }

  function route() {
    try {
      routeGeneration += 1;

      // Cap the hash before parsing. A pathological fragment should
      // not flow into dataset attributes or route lookups.
      if (location.hash.length > MAX_HASH_LEN) {
        location.hash = "#/dashboard";
        return;
      }

      const hash = location.hash.slice(2) || "dashboard";
      const [pageRaw, param] = hash.split("/");
      const page =
        typeof pageRaw === "string" && pageRaw.length <= 128
          ? pageRaw
          : "dashboard";
      const activeId = page === "coin" ? "gems" : page;

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

      // Vault gate — the only route reachable while locked is
      // #/unlock. A user navigating to #/dashboard (or any other
      // route) while locked is redirected with the original route
      // remembered for post-unlock.
      if (W.vault && W.vault.hasStoredVault && W.vault.hasStoredVault()) {
        const locked = W.vault.isLocked();
        if (locked && page !== "unlock") {
          try {
            sessionStorage.setItem(
              "post_unlock_route",
              page + (param ? "/" + param : ""),
            );
          } catch (_) {}
          if (location.hash !== "#/unlock") {
            location.hash = "#/unlock";
            return;
          }
        }
        if (!locked && page === "unlock") {
          location.hash = "#/dashboard";
          return;
        }
      }

      // Clear previous route's DOM before dispatch. Without this, a
      // failed or empty render leaves the previous route's content on
      // screen (e.g. clicking News showed stale Sync content).
      view.innerHTML = "";
      view.dataset.route = page;

      if (page === "coin" && !param) {
        view.innerHTML =
          '<div class="card"><h3>404</h3><p class="muted">Coin not specified.</p></div>';
      } else if (routes[page]) {
        routes[page](view);
      } else {
        view.innerHTML =
          '<div class="card"><h3>404</h3><p class="muted">Page not found.</p></div>';
      }

      const updated = document.getElementById("last-updated");
      if (updated)
        updated.textContent = `updated ${new Date().toLocaleTimeString()} · via ${W.api?.source || "…"}`;

      try {
        if (W.alerts?.check) W.alerts.check();
      } catch (e) {
        console.warn("[App] alerts check failed:", e && e.message);
      }
    } catch (e) {
      console.error("[App] Route error:", e);
      const view = document.getElementById("view");
      if (view) {
        view.innerHTML = `<div class="card"><h3>⚠️ Something went wrong</h3><p class="muted">${esc(e && e.message)}</p><p class="muted small">Check the console (F12) for details.</p></div>`;
      }
    }
  }

  function updateStreak() {
    try {
      const today = new Date().toDateString();
      const raw = W.store?.get?.("streak", null);
      const streak =
        raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
      const last =
        streak && typeof streak.last === "string" ? streak.last : null;
      const countRaw = streak ? streak.count : 0;
      const count = Number.isFinite(countRaw) && countRaw >= 0 ? countRaw : 0;

      if (last !== today) {
        const yesterday = new Date(Date.now() - 864e5).toDateString();
        const nextCount = last === yesterday ? count + 1 : 1;
        W.store?.set?.("streak", { last: today, count: nextCount });
      }
    } catch (e) {
      console.warn("[App] updateStreak failed:", e && e.message);
    }
  }

  let refreshLoop = null;
  function startLoop() {
    try {
      clearInterval(refreshLoop);
      const settingsRaw = W.store?.get?.("settings", {});
      const settings =
        settingsRaw && typeof settingsRaw === "object" ? settingsRaw : {};
      const seconds = Number.isFinite(settings.refresh)
        ? Math.max(0, Math.floor(settings.refresh))
        : 60;

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
    } catch (e) {
      console.warn("[App] startLoop failed:", e && e.message);
    }
  }

  W.applySettings = function () {
    try {
      const cur = W.currency();
      const el = document.getElementById("currency");
      if (el) el.value = cur;

      // Load FX rates in the background. money() stays synchronous
      // and uses the cached rates. Re-render once they resolve so the
      // first paint is not stuck on the un-converted USD values.
      if (typeof W.fmt?.loadFxRates === "function") {
        const initialFxState = W.fmt.getFxState?.();
        W.fmt
          .loadFxRates()
          .then(() => {
            const nextFxState = W.fmt.getFxState?.();
            // Only re-render if the rates actually changed — avoids a
            // pointless second render when the cache was fresh.
            if (
              nextFxState &&
              initialFxState &&
              nextFxState.loadedAt !== initialFxState.loadedAt
            ) {
              try {
                route();
              } catch (e) {
                console.warn("[App] re-render after FX load failed:", e?.message);
              }
            }
          })
          .catch((error) => {
            console.warn(
              "[App] FX rate loading failed:",
              error?.message || error,
            );
          });
      }

      startLoop();
    } catch (e) {
      console.warn("[App] applySettings failed:", e && e.message);
    }
  };

  W.currency = function () {
    try {
      const raw = W.store?.get?.("settings", {});
      const settings =
        raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      const cur = settings.currency;
      return typeof cur === "string" && cur ? cur : "usd";
    } catch {
      return "usd";
    }
  };

  W.refresh = function () {
    route();
  };

  function buildSidebarHTML() {
    return NAV_GROUPS.map((group) => {
      const groupHtml = `<div class="nav-group-label">${esc(group.label)}</div>`;
      const itemsHtml = group.items
        .map(
          (n) => `
          <a href="${esc(n.route)}" data-id="${esc(n.id)}">
            <span class="nav-ico">${esc(n.icon)}</span>
            <span>${esc(n.label)}</span>
            ${n.id === "alerts" ? '<span class="nav-badge" id="alert-badge"></span>' : ""}
          </a>
        `,
        )
        .join("");
      return groupHtml + itemsHtml;
    }).join("");
  }

  function initSidebar() {
    const navEl = document.getElementById("nav");
    if (navEl) navEl.innerHTML = buildSidebarHTML();
    return navEl;
  }

  function initMobileDrawer() {
    const hamburger = document.getElementById("btn-hamburger");
    const backdrop = document.getElementById("sidebar-backdrop");
    const sidebarEl = document.querySelector(".sidebar");

    function closeDrawer() {
      if (!sidebarEl) return;
      sidebarEl.classList.remove("open");
      if (backdrop) backdrop.hidden = true;
      if (hamburger) hamburger.setAttribute("aria-expanded", "false");
    }

    function openDrawer() {
      if (!sidebarEl) return;
      sidebarEl.classList.add("open");
      if (backdrop) backdrop.hidden = false;
      if (hamburger) hamburger.setAttribute("aria-expanded", "true");
    }

    if (hamburger && sidebarEl) {
      hamburger.addEventListener("click", () => {
        const isOpen = sidebarEl.classList.contains("open");
        isOpen ? closeDrawer() : openDrawer();
      });
    }

    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    // Inject a mobile-only close button into the sidebar header.
    // Hidden on desktop via CSS; visible and wired on mobile.
    try {
      const brand = sidebarEl.querySelector(".brand");
      if (brand && !brand.querySelector(".sidebar-close-btn")) {
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "sidebar-close-btn";
        closeBtn.setAttribute("aria-label", "Close menu");
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", closeDrawer);
        brand.appendChild(closeBtn);
      }
    } catch (e) {
      console.warn(
        "[App] sidebar close button injection failed:",
        e && e.message,
      );
    }

    const navEl = document.getElementById("nav");
    if (navEl) {
      navEl.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", closeDrawer);
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
  }

  function initCurrency() {
    const curEl = document.getElementById("currency");
    if (!curEl) return;
    const currencies = ["usd", "ngn", "eur", "gbp", "inr", "jpy", "aud", "cad"];
    curEl.innerHTML = currencies
      .map((c) => `<option value="${esc(c)}">${esc(c.toUpperCase())}</option>`)
      .join("");
    curEl.value = W.currency();
    curEl.onchange = () => {
      try {
        const raw = W.store?.get?.("settings", {});
        const settings =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? { ...raw }
            : {};
        settings.currency = curEl.value;
        W.store?.set?.("settings", settings);
        route();
      } catch (e) {
        console.warn("[App] currency change failed:", e && e.message);
      }
    };
  }

  function initToolbarButtons() {
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
  }

  function initUnhandledRejectionHandler() {
    window.addEventListener("unhandledrejection", (e) => {
      console.warn("[App] Unhandled rejection:", e && e.reason);
      try {
        const reason = e && e.reason;
        const msg =
          reason && typeof reason.message === "string"
            ? reason.message
            : "Request failed";
        const view = document.getElementById("view");
        const spinner = view && view.querySelector(".spinner");
        if (spinner) {
          spinner.outerHTML = `<p class="muted small mt">⚠️ ${esc(msg)} — some live data is unavailable (showing cache where possible). Try ⟳ or another network.</p>`;
        }
      } catch (err) {
        console.warn(
          "[App] unhandledrejection handler failed:",
          err && err.message,
        );
      }
    });
  }

  // ── Telegram test button ───────────────────────────────────
  // Delegated listener. The Telegram module's override contract
  // expects `{ token, chatId, allowDisabled, rateLimitMs }`. The
  // previous version passed `{ on, token, chat }`, which the module
  // silently dropped.
  function initTelegramTestButton() {
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!target || target.id !== "set-tgtest") return;

      try {
        const tokenEl = document.querySelector("#set-tgtoken");
        const chatEl = document.querySelector("#set-tgchat");
        const token =
          tokenEl && typeof tokenEl.value === "string"
            ? tokenEl.value.trim()
            : "";
        const chatId =
          chatEl && typeof chatEl.value === "string" ? chatEl.value.trim() : "";

        if (!token || !chatId) {
          W.ui?.toast?.("Enter token and Chat ID first", "warn");
          return;
        }
        if (!W.tg || typeof W.tg.send !== "function") {
          W.ui?.toast?.("Telegram module not loaded", "warn");
          return;
        }

        Promise.resolve(
          W.tg.send("✅ Weaver connected! Alerts will arrive here.", {
            token,
            chatId,
            allowDisabled: true,
            rateLimitMs: 0,
          }),
        )
          .then((ok) => {
            W.ui?.toast?.(
              ok ? "Test sent 📨" : "Failed — check token/Chat ID",
              ok ? "ok" : "warn",
            );
          })
          .catch((err) => {
            W.ui?.toast?.(
              "Telegram test failed: " +
                (err && err.message ? err.message : "unknown"),
              "warn",
            );
          });
      } catch (err) {
        console.warn("[App] Telegram test wiring failed:", err && err.message);
      }
    });
  }

  function init() {
    console.log("[App] Initializing Weaver...");

    const steps = [
      ["sidebar", initSidebar],
      ["mobileDrawer", initMobileDrawer],
      ["currency", initCurrency],
      ["toolbar", initToolbarButtons],
      ["unhandledRejection", initUnhandledRejectionHandler],
      ["telegramTest", initTelegramTestButton],
    ];

    for (const [name, fn] of steps) {
      try {
        fn();
      } catch (e) {
        console.warn(`[App] init step "${name}" failed:`, e && e.message);
      }
    }

    // Vault boot gate. If a vault exists and is locked, stop here:
    // skip achievements/streak/sync (all touch vault keys) and
    // dispatch straight to #/unlock. A subsequent unlock reloads or
    // navigates, and this boot path runs again with the vault open.
    if (
      W.vault &&
      W.vault.hasStoredVault &&
      W.vault.hasStoredVault() &&
      W.vault.isLocked()
    ) {
      if (location.hash !== "#/unlock") location.hash = "#/unlock";
      try { window.addEventListener("hashchange", route); } catch (_) {}
      try { route(); } catch (_) {}
      console.log("[App] Vault locked; showing unlock screen.");
      return;
    }

    try {
      if (W.achievements?.check) W.achievements.check();
    } catch (e) {
      console.warn("[App] achievements check failed:", e && e.message);
    }

    try {
      updateStreak();
    } catch (e) {
      console.warn("[App] updateStreak failed:", e && e.message);
    }

    try {
      if (W.sync?.boot) W.sync.boot();
    } catch (e) {
      console.warn("[App] sync boot failed:", e && e.message);
    }

    try {
      window.addEventListener("hashchange", route);
    } catch (e) {
      console.warn("[App] hashchange listener failed:", e && e.message);
    }

    try {
      route();
    } catch (e) {
      console.warn("[App] initial route failed:", e && e.message);
    }

    try {
      startLoop();
    } catch (e) {
      console.warn("[App] startLoop failed:", e && e.message);
    }

    try {
      setInterval(() => {
        try {
          if (W.alerts?.check) W.alerts.check();
        } catch (e) {
          console.warn("[App] alerts interval failed:", e && e.message);
        }
      }, 60000);
    } catch (e) {
      console.warn("[App] alerts interval wiring failed:", e && e.message);
    }

    console.log("[App] ✅ Weaver initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

console.log("[App] Module loaded.");
