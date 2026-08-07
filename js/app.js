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
    { id: "web3", icon: "🌐", label: "Web3 Wallets" },
    { id: "defi", icon: "💰", label: "DeFi" },
    { id: "airdrops", icon: "🎯", label: "Airdrop Hunter" },
    { id: "market", icon: "📈", label: "Trading Tools" },
    { id: "whales", icon: "🐋", label: "Whale Tracker" },
    { id: "learn", icon: "📚", label: "Learn" },
    { id: "profile", icon: "👤", label: "Profile" },
    { id: "pro", icon: "🔮", label: "Weaver Pro" },
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
    web3: (v) => W.web3.render(v),
    defi: (v) => W.misc.renderDefi(v),
    airdrops: (v) => W.misc.renderAirdrops(v),
    whales: (v) => W.whales.render(v),
    market: (v) => W.market.render(v),
    learn: (v) => W.learn.render(v),
    profile: (v) => W.misc.renderProfile(v),
    pro: (v) => W.misc.renderPro(v),
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
    if (page === "coin" && param) W.explorer.renderCoin(view, param);
    else (routes[page] || routes.dashboard)(view);
    document.getElementById("last-updated").textContent =
      "updated " + new Date().toLocaleTimeString();
    W.alerts.check();
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
    const sec = W.store.get("settings", {}).refresh ?? 60;
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
    /* 1️⃣ Core helpers FIRST — everything else depends on these */
    W.currency = () => W.store.get("settings", {}).currency || "usd";
    W.refresh = () => route();
    W.applySettings = () => {
      document.getElementById("currency").value = W.currency();
      startLoop();
    };

    /* 2️⃣ Nav */
    document.getElementById("nav").innerHTML = NAV.map(
      (n) =>
        `<a href="#/${n.id}" data-id="${n.id}"><span class="nav-ico">${n.icon}</span><span>${n.label}</span>${n.id === "alerts" ? '<span class="nav-badge" id="alert-badge"></span>' : ""}</a>`,
    ).join("");

    /* 3️⃣ Currency selector */
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

    /* 4️⃣ Go */
    streak();
    if (W.achievements) W.achievements.check();
    window.addEventListener("hashchange", route);
    route();
    startLoop();
    setInterval(() => W.alerts.check(), 60000);
  }

  window.addEventListener("DOMContentLoaded", init);
})();

// Register PWA Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((err) => console.log("SW failed:", err));
  });
}
