// ================================================================
// js/features/market.js – Market Overview
// ================================================================

window.W = window.W || {};

W.market = (() => {
  // ── Helpers ──────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const card = (label, big, sub) =>
    `<div class="card stat"><div class="stat-label">${label}</div><div class="stat-big">${big}</div><div class="stat-sub">${sub}</div></div>`;

  const miniTable = (coins) =>
    `<table class="mini">
      <tbody>
        ${coins
          .map(
            (c) => `
          <tr>
            <td class="coin-cell"><img src="${c.image}" alt="${c.name}"><a class="link" href="#/coin/${c.id}">${c.symbol.toUpperCase()}</a></td>
            <td>${W.fmt.price(c.current_price)}</td>
            <td>${W.fmt.pct(c.price_change_percentage_24h_in_currency)}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>`;

  const heatColor = (p) => {
    const clamped = Math.max(-10, Math.min(10, p)) / 10;
    return clamped >= 0
      ? `rgba(46,230,168,${0.15 + clamped * 0.55})`
      : `rgba(255,92,122,${0.15 - clamped * 0.55})`;
  };

  // ── Render ──────────────────────────────────────────────
  async function render(view) {
    if (!view) {
      console.warn("[Market] No view element provided");
      return;
    }

    view.innerHTML = `
      <div class="cards" id="m-cards">${W.ui.spinner()}</div>
      <div class="grid-2">
        <div class="card"><h3>🔥 Trending Coins</h3><div id="m-trend">${W.ui.spinner()}</div></div>
        <div class="card"><h3>🧭 Altcoin Season Index</h3><div id="m-alt">${W.ui.spinner()}</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>📈 Top Gainers (24h)</h3><div id="m-gain"></div></div>
        <div class="card"><h3>📉 Top Losers (24h)</h3><div id="m-lose"></div></div>
      </div>
      <div class="card"><h3>🗺️ Market Heatmap (Top 40 · 7d)</h3><div id="m-heat" class="heatmap"></div></div>
    `;

    try {
      const [g, fg] = await Promise.all([W.api.global(), W.api.fearGreed()]);
      const d = g.data;
      const fgColor =
        fg.value < 25
          ? "#ff5c7a"
          : fg.value < 45
            ? "#ffb35c"
            : fg.value < 55
              ? "#f5d76e"
              : fg.value < 75
                ? "#9be15d"
                : "#2ee6a8";
      view.querySelector("#m-cards").innerHTML = `
        ${card("Fear & Greed Index", `<span style="color:${fgColor}">${fg.value}</span>`, fg.value_classification)}
        ${card("BTC Dominance", d.market_cap_percentage.btc.toFixed(1) + "%", "of total market cap")}
        ${card("Total Market Cap", W.fmt.money(d.total_market_cap[W.currency()], { compact: true }), W.fmt.pct(d.market_cap_change_percentage_24h_usd))}
        ${card("Total Volume (24h)", W.fmt.money(d.total_volume[W.currency()], { compact: true }), "all markets")}
      `;
    } catch (e) {
      view.querySelector("#m-cards").innerHTML =
        `<p class="muted">${escapeHTML(e.message)}</p>`;
    }

    try {
      const t = await W.api.trending();
      view.querySelector("#m-trend").innerHTML = t.coins
        .map(
          (x) =>
            `<a class="trend-chip" href="#/coin/${x.item.id}">
          <img src="${x.item.small || x.item.thumb}" alt="${x.item.name}">
          ${escapeHTML(x.item.name)}
          <span class="muted small">${x.item.symbol}</span>
        </a>`,
        )
        .join("");
    } catch (e) {
      view.querySelector("#m-trend").innerHTML =
        `<p class="muted">${escapeHTML(e.message)}</p>`;
    }

    try {
      const top = await W.api.top(100);
      const btc = top.find((c) => c.id === "bitcoin");
      const sorted = [...top].sort(
        (a, b) =>
          (b.price_change_percentage_24h_in_currency ?? 0) -
          (a.price_change_percentage_24h_in_currency ?? 0),
      );
      view.querySelector("#m-gain").innerHTML = miniTable(sorted.slice(0, 8));
      view.querySelector("#m-lose").innerHTML = miniTable(
        sorted.slice(-8).reverse(),
      );

      const top50 = top.slice(0, 50).filter((c) => c.id !== "bitcoin");
      const beating = top50.filter(
        (c) =>
          (c.price_change_percentage_7d_in_currency ?? -999) >
          (btc?.price_change_percentage_7d_in_currency ?? 0),
      ).length;
      const idx = top50.length ? Math.round((beating / top50.length) * 100) : 0;
      const label =
        idx >= 75
          ? "Altcoin Season 🌈"
          : idx >= 25
            ? "Mixed Market"
            : "Bitcoin Season ₿";
      view.querySelector("#m-alt").innerHTML = `
        <div class="alt-num">${idx}</div>
        <div class="alt-bar"><div style="width:${idx}%"></div></div>
        <p class="muted small">${beating}/${top50.length} of the top-50 coins outperformed BTC over 7 days (≥75 = Altcoin Season).</p>
        <b>${label}</b>
      `;

      view.querySelector("#m-heat").innerHTML = top
        .slice(0, 40)
        .map((c) => {
          const p = c.price_change_percentage_7d_in_currency ?? 0;
          return `<a class="heat-cell" style="background:${heatColor(p)}" href="#/coin/${c.id}" title="${escapeHTML(c.name)} 7d: ${p.toFixed(2)}%">
          <b>${c.symbol.toUpperCase()}</b>
          <span>${p >= 0 ? "+" : ""}${p.toFixed(1)}%</span>
        </a>`;
        })
        .join("");
    } catch (e) {
      console.warn("[Market] Error fetching top data:", e);
    }
  }

  return { render };
})();

console.log("[Market] Module loaded.");
