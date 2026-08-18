// ================================================================
// js/features/watchlist.js – Weaver Watchlist
// ================================================================

window.W = window.W || {};

W.watchlist = (() => {
  const KEY = "watchlist";

  // ── Internal state ─────────────────────────────────
  function getList() {
    return W.store.get(KEY, ["bitcoin", "ethereum", "solana"]);
  }

  function saveList(list) {
    W.store.set(KEY, list);
  }

  // ── Public API ─────────────────────────────────────
  function list() {
    return getList();
  }

  function has(id) {
    return list().includes(id);
  }

  function toggle(id) {
    const l = getList();
    if (l.includes(id)) {
      saveList(l.filter((x) => x !== id));
      return false;
    }
    saveList([...l, id]);
    return true;
  }

  function add(id) {
    const l = getList();
    if (!l.includes(id)) {
      saveList([...l, id]);
      return true;
    }
    return false;
  }

  function remove(id) {
    saveList(getList().filter((x) => x !== id));
  }

  // ── Render ──────────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>⭐ Watchlist</h3>
          <div id="w-picker" style="min-width:280px;"></div>
        </div>
        <div id="w-body">${W.ui.spinner()}</div>
      </div>
    `;

    // ── Coin picker ──────────────────────────────────
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#w-picker"), (p) => {
        if (p) {
          add(p.id);
          W.ui.toast(`${p.name} added to watchlist ⭐`, "ok");
          renderTable(view);
        }
      });
    } else {
      console.warn("[Watchlist] coinPicker not available");
    }

    await renderTable(view);
  }

  async function renderTable(view) {
    const body = view.querySelector("#w-body");
    if (!body) return;

    const ids = getList();
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
      // Fetch market data for all watchlist coins
      const data = await W.api.markets(ids.join(","));
      coins = data || [];
    } catch (e) {
      console.warn("[Watchlist] Market fetch error:", e);
      body.innerHTML = `<p class="muted">${e.message}</p>`;
      return;
    }

    if (!coins.length) {
      body.innerHTML = W.ui.empty(
        "📭",
        "No data available",
        "Try refreshing or check your connection",
      );
      return;
    }

    // Sort by market cap rank
    coins.sort(
      (a, b) => (a.market_cap_rank || 999) - (b.market_cap_rank || 999),
    );

    body.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Coin</th>
              <th class="num">Price</th>
              <th class="num">24h</th>
              <th class="num">7d</th>
              <th class="num">Market Cap</th>
              <th class="num">Volume (24h)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${coins
              .map(
                (c) => `
              <tr class="clickable" data-coin="${c.id}">
                <td class="muted">${c.market_cap_rank || "—"}</td>
                <td class="coin-cell">
                  <img src="${c.image}" alt="${c.name}">
                  <div>
                    <b><a class="link" href="#/coin/${c.id}">${c.name}</a></b>
                    <br><span class="muted small">${c.symbol.toUpperCase()}</span>
                  </div>
                </td>
                <td class="num">${W.fmt.price(c.current_price)}</td>
                <td class="num">${W.fmt.pct(c.price_change_percentage_24h_in_currency)}</td>
                <td class="num">${W.fmt.pct(c.price_change_percentage_7d_in_currency)}</td>
                <td class="num">${W.fmt.money(c.market_cap, { compact: true })}</td>
                <td class="num">${W.fmt.money(c.total_volume, { compact: true })}</td>
                <td class="row-actions">
                  <button class="icon-btn" data-unwatch="${c.id}" title="Remove from watchlist">✕</button>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // ── Click on row → go to coin page ──────────────
    body.querySelectorAll("tr[data-coin]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        // Ignore if the click was on the remove button
        if (e.target.closest("[data-unwatch]")) return;
        const id = tr.dataset.coin;
        if (id) location.hash = "#/coin/" + id;
      });
    });

    // ── Remove button ────────────────────────────────
    body.querySelectorAll("[data-unwatch]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.unwatch;
        remove(id);
        W.ui.toast("Removed from watchlist", "info");
        renderTable(view);
      });
    });
  }

  // ── Exports ─────────────────────────────────────────
  return {
    render,
    list,
    has,
    toggle,
    add,
    remove,
  };
})();

console.log("[Watchlist] Module loaded.");
