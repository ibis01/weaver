window.W = window.W || {};

(function () {
  const NAV = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "portfolio", icon: "💼", label: "Portfolio" },
    { id: "watchlist", icon: "⭐", label: "Watchlist" },
    { id: "explorer", icon: "🔍", label: "Coin Explorer" },
    { id: "alerts", icon: "🚨", label: "Alerts" },
    { id: "news", icon: "📰", label: "News" },
    { id: "ai", icon: "🤖", label: "AI Insights" },
    { id: "optimizer", icon: "🧮", label: "Optimizer" },
    { id: "trader", icon: "⚡", label: "AI Trader" },
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
    { id: "sync", icon: "☁️", label: "Sync" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  const routes = {
    dashboard: (v) => W.dashboard.render(v),
    portfolio: (v) => W.dashboard.renderPortfolio(v),
    watchlist: (v) => W.watchlist.render(v),
    explorer: (v) => W.explorer.render(v),
    alerts: (v) => W.alerts.render(v),
    news: (v) => W.news.render(v),
    ai: (v) => W.ai.render(v),
    optimizer: (v) => W.optimizer.render(v),
    trader: (v) => W.trader.render(v),
    gems: (v) => W.gems.render(v),
    shield: (v) => W.shield.render(v),
    web3: (v) => W.web3.render(v),
    defi: (v) => W.misc.renderDefi(v),
    airdrops: (v) => W.misc.renderAirdrops(v),
    market: (v) => W.market.render(v),
    sectors: (v) => W.sectors.render(v),
    whales: (v) => W.whales.render(v),
    smart: (v) => W.smart.render(v),
    unlocks: (v) => W.unlocks.render(v),
    learn: (v) => W.learn.render(v),
    profile: (v) => W.misc.renderProfile(v),
    pro: (v) => W.misc.renderPro(v),
    sync: (v) => W.sync.render(v),
    settings: (v) => W.misc.renderSettings(v),
  };

  const current = () => location.hash.slice(2).split("/")[0] || "dashboard";

  function route() {
    const hash = location.hash.slice(2) || "dashboard";
    const [page, param] = hash.split("/");
    const activeId = page === "coin" ? "explorer" : page;
    document
      .querySelectorAll("#nav a")
      .forEach((a) => a.classList.toggle("active", a.dataset.id === activeId));
    const nav = NAV.find((n) => n.id === activeId);
    document.getElementById("page-title").textContent = nav
      ? nav.label
      : "Weaver";
    const view = document.getElementById("view");
    view.innerHTML = "";
    try {
      if (page === "coin" && param) W.explorer.renderCoin(view, param);
      else (routes[page] || routes.dashboard)(view);
    } catch (e) {
      console.error(e);
      view.innerHTML =
        '<div class="card"><h3>⚠️ Module failed to load</h3><p class="muted">' +
        e.message +
        '</p><p class="muted small">A JS file may be missing or broken — check the console (F12).</p></div>';
    }
    document.getElementById("last-updated").textContent =
      "updated " +
      new Date().toLocaleTimeString() +
      " · via " +
      (W.api && W.api.source ? W.api.source : "…");
    if (W.alerts) W.alerts.check();
  }

  function streak() {
    const today = new Date().toDateString();
    const st = W.store.get("streak", null);
    if (!st || st.last !== today) {
      const yesterday = new Date(Date.now() - 864e5).toDateString();
      W.store.set("streak", {
        last: today,
        count: st && st.last === yesterday ? st.count + 1 : 1,
      });
    }
  }

  let loop = null;
  function startLoop() {
    clearInterval(loop);
    const sec = (W.store.get("settings", {}) || {}).refresh ?? 60;
    if (sec > 0) {
      loop = setInterval(() => {
        if (
          !document.querySelector("#modal-root .modal") &&
          ["dashboard", "watchlist", "market", "alerts"].includes(current())
        )
          route();
      }, sec * 1000);
    }
  }

  function init() {
    /* core helpers FIRST */
    W.currency = () => W.store.get("settings", {}).currency || "usd";
    W.refresh = () => route();
    W.applySettings = () => {
      document.getElementById("currency").value = W.currency();
      startLoop();
    };

    /* nav */
    document.getElementById("nav").innerHTML = NAV.map(
      (n) =>
        `<a href="#/${n.id}" data-id="${n.id}"><span class="nav-ico">${n.icon}</span><span>${n.label}</span>${n.id === "alerts" ? '<span class="nav-badge" id="alert-badge"></span>' : ""}</a>`,
    ).join("");

    /* currency */
    const cur = document.getElementById("currency");
    cur.innerHTML = ["usd", "eur", "gbp", "inr", "jpy"]
      .map((c) => `<option value="${c}">${c.toUpperCase()}</option>`)
      .join("");
    cur.value = W.currency();
    cur.onchange = () => {
      const s = W.store.get("settings", {});
      s.currency = cur.value;
      W.store.set("settings", s);
      route();
    };

    document.getElementById("btn-refresh").onclick = route;
    document.getElementById("btn-pro").onclick = () =>
      (location.hash = "#/pro");

    /* surgical async-error handler: replaces ONLY the spinner, never the whole page */
    window.addEventListener("unhandledrejection", (e) => {
      console.warn("Weaver async error:", e.reason);
      const msg = (e.reason && e.reason.message) || "request failed";
      const v = document.getElementById("view");
      const spin = v && v.querySelector(".spinner");
      if (spin)
        spin.outerHTML =
          '<p class="muted small mt">⚠️ ' +
          msg +
          " — some live data is unavailable on this network (showing cache where possible). Try ⟳ or another network.</p>";
    });

    /* card spotlight follows cursor */
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest(".card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    });

    streak();
    if (W.achievements) W.achievements.check();
    window.addEventListener("hashchange", route);
    route();
    startLoop();
    setInterval(() => {
      if (W.alerts) W.alerts.check();
    }, 60000);
    if (W.sync) W.sync.boot();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
