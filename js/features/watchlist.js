window.W = window.W || {};

W.watchlist = (() => {
  const KEY = "watchlist";
  const list = () => W.store.get(KEY, ["bitcoin", "ethereum", "solana"]);
  const save = (l) => W.store.set(KEY, l);
  const has = (id) => list().includes(id);
  const toggle = (id) => {
    const l = list();
    if (l.includes(id)) {
      save(l.filter((x) => x !== id));
      return false;
    }
    save([...l, id]);
    return true;
  };

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head"><h3>⭐ Watchlist</h3><div id="w-picker" style="min-width:280px"></div></div>
        <div id="w-body">${W.ui.spinner()}</div>
      </div>`;
    W.ui.coinPicker(view.querySelector("#w-picker"), (p) => {
      if (p) {
        toggle(p.id);
        W.ui.toast(`${p.name} added to watchlist ⭐`, "ok");
        renderTable(view);
      }
    });
    await renderTable(view);
  }

  async function renderTable(view) {
    const body = view.querySelector("#w-body");
    const ids = list();
    if (!ids.length) {
      body.innerHTML = W.ui.empty(
        "⭐",
        "Watchlist is empty",
        "Search above to add coins",
      );
      return;
    }
    let coins = [];
    try {
      coins = await W.api.markets(ids.join(","));
    } catch (e) {
      body.innerHTML = `<p class="muted">${e.message}</p>`;
      return;
    }
    coins.sort(
      (a, b) => (a.market_cap_rank || 999) - (b.market_cap_rank || 999),
    );
    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Coin</th><th>Price</th><th>24h</th><th>7d</th><th>Market Cap</th><th>Volume (24h)</th><th></th></tr></thead>
      <tbody>${coins
        .map(
          (c) => `<tr>
        <td class="muted">${c.market_cap_rank || "—"}</td>
        <td class="coin-cell"><img src="${c.image}"><div><b><a class="link" href="#/coin/${c.id}">${c.name}</a></b><br><span class="muted small">${c.symbol.toUpperCase()}</span></div></td>
        <td>${W.fmt.price(c.current_price)}</td>
        <td>${W.fmt.pct(c.price_change_percentage_24h_in_currency)}</td>
        <td>${W.fmt.pct(c.price_change_percentage_7d_in_currency)}</td>
        <td>${W.fmt.money(c.market_cap, { compact: true })}</td>
        <td>${W.fmt.money(c.total_volume, { compact: true })}</td>
        <td><button class="icon-btn" data-unwatch="${c.id}" title="Remove">✕</button></td>
      </tr>`,
        )
        .join("")}</tbody></table></div>`;
    body.querySelectorAll("[data-unwatch]").forEach(
      (b) =>
        (b.onclick = () => {
          toggle(b.dataset.unwatch);
          renderTable(view);
        }),
    );
  }

  return { render, list, has, toggle };
})();
