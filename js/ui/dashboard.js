window.W = window.W || {};

W.dashboard = (() => {
  let chartAlloc = null;

  const statCard = (label, big, sub) =>
    `<div class="card stat"><div class="stat-label">${label}</div><div class="stat-big">${big}</div><div class="stat-sub">${sub}</div></div>`;
  const signedMoney = (n) =>
    n == null
      ? "—"
      : `<span class="${n >= 0 ? "up" : "down"}">${n >= 0 ? "+" : "-"}${W.fmt.money(Math.abs(n))}</span>`;

  /* ── terminal helpers ── */
  function drawSpark(c) {
    const vals = (c.dataset.spark || "")
      .split(",")
      .map(Number)
      .filter((v) => !isNaN(v));
    if (vals.length < 2) return;
    const w = (c.width = 110),
      h = (c.height = 30),
      ctx = c.getContext("2d");
    const min = Math.min(...vals),
      max = Math.max(...vals),
      up = c.dataset.up === "1";
    ctx.strokeStyle = up ? "#2ee6a8" : "#ff5c7a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w,
        y = h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = up ? "rgba(46,230,168,.12)" : "rgba(255,92,122,.12)";
    ctx.fill();
  }
  const sparkCell = (arr, up) =>
    arr && arr.length
      ? `<canvas class="spark" data-up="${up ? 1 : 0}" data-spark="${arr
          .filter((_, i) => i % 6 === 0)
          .map((v) => v.toFixed(4))
          .join(",")}"></canvas>`
      : '<span class="muted small">—</span>';
  const tapeHTML = (coins) =>
    `<div class="tape-wrap"><div class="tape">${coins
      .concat(coins)
      .map(
        (c) =>
          `<span class="tape-item"><b>${c.symbol.toUpperCase()}</b><span class="muted">${W.fmt.price(c.current_price)}</span>${W.fmt.pct(c.price_change_percentage_24h_in_currency)}</span>`,
      )
      .join("")}</div></div>`;
  const termRow = (c, i) => `<tr class="clickable" data-coin="${c.id}">
    <td class="muted">${i + 1}</td>
    <td class="coin-cell"><img src="${c.image}"><div><b>${c.symbol.toUpperCase()}</b> <span class="muted small">${c.name}</span></div></td>
    <td class="num"><b>${W.fmt.price(c.current_price)}</b></td>
    <td class="num">${W.fmt.pct(c.price_change_percentage_24h_in_currency)}</td>
    <td class="num">${W.fmt.pct(c.price_change_percentage_7d_in_currency)}</td>
    <td class="num">${W.fmt.pct(c.price_change_percentage_30d_in_currency)}</td>
    <td class="num">${W.fmt.money(c.market_cap, { compact: true })}</td>
    <td class="num">${W.fmt.money(c.total_volume, { compact: true })}</td>
    <td>${sparkCell((c.sparkline_in_7d || {}).price, (c.price_change_percentage_24h_in_currency || 0) >= 0)}</td>
  </tr>`;

  /* ── portfolio math ── */
  async function enrich() {
    const holdings = W.portfolio
      .all()
      .concat(
        (W.walletSync ? W.walletSync.holdings() : []).map((h) =>
          Object.assign({}, h, { wallet: true }),
        ),
      );
    if (!holdings.length) return { rows: [], totals: null };
    const ids = [...new Set(holdings.map((h) => h.coinId))].join(",");
    let markets = [];
    try {
      markets = await W.api.markets(ids);
    } catch (e) {
      W.ui.toast(e.message, "warn");
    }
    const rows = holdings
      .map((h) => {
        const m = markets.find((c) => c.id === h.coinId) || {};
        const price = m.current_price ?? h.buyPrice;
        const value = price * h.qty,
          cost = h.wallet ? value : h.buyPrice * h.qty;
        return {
          ...h,
          price,
          value,
          cost,
          pnl: value - cost,
          pnlPct: cost ? ((value - cost) / cost) * 100 : 0,
          p24: m.price_change_percentage_24h_in_currency ?? null,
          p7: m.price_change_percentage_7d_in_currency ?? null,
          image: m.image || h.img,
        };
      })
      .sort((a, b) => b.value - a.value);

    const totals = { value: 0, cost: 0 };
    let prev24 = 0,
      prev7 = 0;
    rows.forEach((r) => {
      totals.value += r.value;
      totals.cost += r.cost;
      if (r.p24 != null) prev24 += r.value / (1 + r.p24 / 100);
      if (r.p7 != null) prev7 += r.value / (1 + r.p7 / 100);
    });
    totals.allTime = totals.value - totals.cost;
    totals.allTimePct = totals.cost ? (totals.allTime / totals.cost) * 100 : 0;
    totals.day = totals.value - prev24;
    totals.dayPct = prev24 ? (totals.day / prev24) * 100 : 0;
    totals.week = totals.value - prev7;
    totals.weekPct = prev7 ? (totals.week / prev7) * 100 : 0;
    return { rows, totals };
  }

  const holdingsTable = (rows) => `
    <div class="table-wrap"><table>
      <thead><tr><th>Asset</th><th>Price</th><th>24h</th><th>Qty</th><th>Avg Buy</th><th>Value</th><th>P/L</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
        <td class="coin-cell"><img src="${r.image || r.img || ""}"><div><b>${r.name}</b><br><span class="muted small">${r.symbol.toUpperCase()}</span></div></td>
        <td>${W.fmt.price(r.price)}</td>
        <td>${W.fmt.pct(r.p24)}</td>
        <td>${r.qty}</td>
        <td>${W.fmt.price(r.buyPrice)}</td>
        <td><b>${W.fmt.money(r.value)}</b></td>
        <td>${signedMoney(r.pnl)}<div class="small">${W.fmt.pct(r.pnlPct)}</div></td>
                <td class="row-actions">${r.wallet ? '<span class="tag rank" title="From connected wallet">👛 wallet</span>' : '<button class="icon-btn" data-edit="' + r.id + '" title="Edit">✏️</button><button class="icon-btn" data-del="' + r.id + '" title="Delete">🗑️</button>'}</td>
      </tr>`,
        )
        .join("")}</tbody>
    </table></div>`;

  const txList = (list) =>
    !list.length
      ? '<p class="muted small">No transactions yet.</p>'
      : `<ul class="tx-list">${list.map((t) => `<li><span class="tag ${t.type}">${t.type}</span> ${t.qty} ${t.symbol.toUpperCase()} @ ${W.fmt.price(t.price)} <span class="muted small">${W.fmt.date(t.date)}</span></li>`).join("")}</ul>`;

  function wireRows(container, rows) {
    rows.forEach((r) => {
      const e = container.querySelector(`[data-edit="${r.id}"]`);
      const d = container.querySelector(`[data-del="${r.id}"]`);
      if (e) e.onclick = () => holdingModal(r);
      if (d)
        d.onclick = () =>
          W.ui.confirm(`Remove <b>${r.name}</b> from your portfolio?`, () => {
            W.portfolio.remove(r.id);
            W.ui.toast("Holding removed", "ok");
            W.refresh();
          });
    });
  }

  function holdingModal(existing = null, preselect = null) {
    const coinLine = existing
      ? `<p class="muted small">Coin: <b>${existing.name} (${existing.symbol.toUpperCase()})</b></p>`
      : preselect
        ? `<p class="muted small">Coin: <b>${preselect.name} (${preselect.symbol.toUpperCase()})</b></p>`
        : `<div id="picker"></div>`;
    const m = W.ui.modal({
      title: existing ? `Edit ${existing.name}` : "Add Holding",
      body: `<form id="h-form">${coinLine}
        <label>Quantity<input type="number" step="any" name="qty" required value="${existing ? existing.qty : ""}" placeholder="0.5"></label>
        <label>Average buy price<input type="number" step="any" name="buyPrice" required value="${existing ? existing.buyPrice : ""}" placeholder="29500"></label>
        <label>Date (optional)<input type="date" name="date"></label>
      </form>`,
      footer: `<button class="btn ghost" id="h-cancel">Cancel</button><button class="btn primary" id="h-save">${existing ? "Save" : "Add"}</button>`,
    });
    let picked = existing
      ? {
          id: existing.coinId,
          symbol: existing.symbol,
          name: existing.name,
          img: existing.img,
        }
      : preselect
        ? {
            id: preselect.id,
            symbol: preselect.symbol,
            name: preselect.name,
            img: preselect.image?.small || "",
          }
        : null;
    if (!existing && !preselect)
      W.ui.coinPicker(m.el.querySelector("#picker"), (p) => (picked = p));
    m.el.querySelector("#h-cancel").onclick = m.close;
    m.el.querySelector("#h-save").onclick = () => {
      const f = m.el.querySelector("#h-form");
      const qty = parseFloat(f.qty.value),
        buyPrice = parseFloat(f.buyPrice.value);
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      if (!qty || qty <= 0 || isNaN(buyPrice) || buyPrice < 0)
        return W.ui.toast("Enter valid quantity and price", "warn");
      if (existing) W.portfolio.update(existing.id, { qty, buyPrice });
      else
        W.portfolio.add({
          coinId: picked.id,
          symbol: picked.symbol,
          name: picked.name,
          img: picked.img,
          qty,
          buyPrice,
          date: f.date.value ? new Date(f.date.value).getTime() : Date.now(),
        });
      m.close();
      W.ui.toast(existing ? "Holding updated" : "Holding added 🎉", "ok");
      W.refresh();
    };
  }

  function txModal() {
    const m = W.ui.modal({
      title: "Record Transaction",
      body: `<form id="t-form">
        <label>Type<select name="type"><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
        <div id="picker"></div>
        <label>Quantity<input type="number" step="any" name="qty" required placeholder="0.25"></label>
        <label>Price per coin<input type="number" step="any" name="price" required placeholder="Price at time of trade"></label>
      </form>`,
      footer: `<button class="btn ghost" id="t-cancel">Cancel</button><button class="btn primary" id="t-save">Record</button>`,
    });
    let picked = null;
    W.ui.coinPicker(m.el.querySelector("#picker"), (p) => (picked = p));
    m.el.querySelector("#t-cancel").onclick = m.close;
    m.el.querySelector("#t-save").onclick = () => {
      const f = m.el.querySelector("#t-form");
      const qty = parseFloat(f.qty.value),
        price = parseFloat(f.price.value);
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      if (!qty || qty <= 0 || !price || price <= 0)
        return W.ui.toast("Enter valid quantity and price", "warn");
      const ok = W.portfolio.recordTx({
        type: f.type.value,
        coin: {
          id: picked.id,
          symbol: picked.symbol,
          name: picked.name,
          img: picked.img,
        },
        qty,
        price,
      });
      if (ok) {
        m.close();
        W.ui.toast("Transaction recorded ✓", "ok");
        W.refresh();
      }
    };
  }

  /* ── THE TERMINAL DASHBOARD ── */
  async function render(view) {
    view.innerHTML = `
      <div id="d-tape"></div>
      <div class="cards" id="d-stats"></div>
      <div class="card">
        <div class="watch-head"><h3>🌐 Markets Terminal</h3>
                   <div class="qa"><button class="btn primary tiny" id="qa-add">+ Add</button><button class="btn tiny" id="qa-tx">↔ Buy/Sell</button><button class="btn tiny" id="qa-sample" title="Load sample portfolio">🎲</button><button class="btn tiny" id="qa-sync" title="Sync connected wallets">👛 Sync</button></div></div>
        </div>
        <div class="table-wrap"><table class="term-table"><thead><tr>
          <th>#</th><th>Token</th><th class="num">Price</th><th class="num">24H</th><th class="num">7D</th><th class="num">30D</th><th class="num">Market Cap</th><th class="num">Volume</th><th>7d Chart</th>
        </tr></thead><tbody id="d-rows"><tr><td colspan="9">${W.ui.spinner()}</td></tr></tbody></table></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="watch-head"><h3>💼 Your Portfolio</h3>
          <div class="qa"><button class="btn primary tiny" id="qa-add">+ Add</button><button class="btn tiny" id="qa-tx">↔ Buy/Sell</button><button class="btn tiny" id="qa-sample" title="Load sample portfolio">🎲</button></div></div>
          <div id="d-port"></div></div>
        <div class="card"><h3>🍩 Allocation</h3><div class="chart-box"><canvas id="alloc"></canvas></div></div>
      </div>`;

    view.querySelector("#qa-add").onclick = () => holdingModal();
    view.querySelector("#qa-sample").onclick = () => {
      W.portfolio.seed();
      W.ui.toast("Sample portfolio loaded 🎉", "ok");
      W.refresh();
    };
    view.querySelector("#qa-tx").onclick = () => txModal();
    view.querySelector("#qa-sync").onclick = async () => {
      W.ui.toast("👛 Syncing wallets…", "info");
      await (W.walletSync && W.walletSync.refresh());
      W.refresh();
    };
    if (
      W.walletSync &&
      Date.now() - (W.store.get("wallet-last", 0) || 0) > 60000
    ) {
      W.walletSync.refresh().then((rows) => {
        if (rows.length) W.refresh();
      });
    }

    const [topR, globR, fgR, trendR, pf] = await Promise.allSettled([
      W.api.top(100),
      W.api.global(),
      W.api.fearGreed(),
      W.api.trending(),
      enrich(),
    ]);
    const TOP = topR.status === "fulfilled" ? topR.value : [];
    const rows = pf.status === "fulfilled" ? pf.value.rows : [];
    const totals = pf.status === "fulfilled" ? pf.value.totals : null;
    const g = globR.status === "fulfilled" ? globR.value.data : null;
    const fg = fgR.status === "fulfilled" ? fgR.value : null;

    if (TOP.length)
      view.querySelector("#d-tape").innerHTML = tapeHTML(TOP.slice(0, 20));

    const fgColor = fg
      ? fg.value < 25
        ? "#ff5c7a"
        : fg.value < 45
          ? "#ffb35c"
          : fg.value < 75
            ? "#f5d76e"
            : "#2ee6a8"
      : "#9aa3b2";
    view.querySelector("#d-stats").innerHTML = `
      ${totals ? statCard("Total Balance", W.fmt.money(totals.value), rows.length + " assets") : statCard("Total Balance", "—", "add holdings below")}
      ${totals ? statCard("P/L · 24h", signedMoney(totals.day), W.fmt.pct(totals.dayPct)) : ""}
      ${g ? statCard("Global Market Cap", W.fmt.money(g.total_market_cap[W.currency()], { compact: true }), W.fmt.pct(g.market_cap_change_percentage_24h_usd)) : ""}
      ${g ? statCard("BTC Dominance", g.market_cap_percentage.btc.toFixed(1) + "%", "ETH " + g.market_cap_percentage.eth.toFixed(1) + "%") : ""}
      ${fg ? statCard("Fear & Greed", `<span style="color:${fgColor}">${fg.value}</span>`, fg.value_classification) : ""}`;

    let tab = "trending";
    const drawRows = () => {
      let list = TOP;
      if (tab === "trending" && trendR.status === "fulfilled") {
        list = trendR.value.coins
          .map((x) => x.item.id)
          .map((id) => TOP.find((c) => c.id === id))
          .filter(Boolean);
        if (!list.length) list = TOP.slice(0, 20);
      }
      if (tab === "top") list = TOP.slice(0, 50);
      if (tab === "gain")
        list = [...TOP]
          .sort(
            (a, b) =>
              (b.price_change_percentage_24h_in_currency ?? 0) -
              (a.price_change_percentage_24h_in_currency ?? 0),
          )
          .slice(0, 20);
      if (tab === "lose")
        list = [...TOP]
          .sort(
            (a, b) =>
              (a.price_change_percentage_24h_in_currency ?? 0) -
              (b.price_change_percentage_24h_in_currency ?? 0),
          )
          .slice(0, 20);
      view.querySelector("#d-rows").innerHTML = list.length
        ? list.map(termRow).join("")
        : '<tr><td colspan="9" class="muted center">All live sources unreachable — data appears when a pipe (or your cache) is available.</td></tr>';
      view
        .querySelectorAll("#d-rows tr[data-coin]")
        .forEach(
          (tr) =>
            (tr.onclick = () => (location.hash = "#/coin/" + tr.dataset.coin)),
        );
      view.querySelectorAll("canvas.spark").forEach(drawSpark);
    };
    view.querySelectorAll("[data-tab]").forEach(
      (c) =>
        (c.onclick = () => {
          view
            .querySelectorAll("[data-tab]")
            .forEach((x) => x.classList.remove("active"));
          c.classList.add("active");
          tab = c.dataset.tab;
          drawRows();
        }),
    );
    drawRows();

    const port = view.querySelector("#d-port");
    if (!rows.length)
      port.innerHTML = W.ui.empty(
        "💼",
        "Portfolio is empty",
        "Hit + Add, or 🎲 to load the sample portfolio",
      );
    else {
      port.innerHTML = holdingsTable(rows);
      wireRows(port, rows);
    }

    if (window.Chart) {
      chartAlloc?.destroy();
      if (rows.length) {
        chartAlloc = new Chart(view.querySelector("#alloc"), {
          type: "doughnut",
          data: {
            labels: rows.map((r) => r.symbol.toUpperCase()),
            datasets: [
              {
                data: rows.map((r) => +r.value.toFixed(2)),
                backgroundColor: W.PALETTE,
                borderColor: "#0b0d14",
                borderWidth: 3,
                hoverOffset: 14,
                borderRadius: 8,
                spacing: 2,
              },
            ],
          },
          options: {
            maintainAspectRatio: false,
            cutout: "62%",
            plugins: { legend: { position: "right" } },
          },
        });
      } else if (g) {
        const others =
          100 - g.market_cap_percentage.btc - g.market_cap_percentage.eth;
        chartAlloc = new Chart(view.querySelector("#alloc"), {
          type: "doughnut",
          data: {
            labels: ["BTC", "ETH", "Others"],
            datasets: [
              {
                data: [
                  +g.market_cap_percentage.btc.toFixed(1),
                  +g.market_cap_percentage.eth.toFixed(1),
                  +others.toFixed(1),
                ],
                backgroundColor: ["#f7931a", "#627eea", "#7c5cff"],
                borderColor: "#0b0d14",
                borderWidth: 3,
                hoverOffset: 14,
                borderRadius: 8,
              },
            ],
          },
          options: {
            maintainAspectRatio: false,
            cutout: "62%",
            plugins: { legend: { position: "right" } },
          },
        });
      }
    }
  }

  /* ── Portfolio page (unchanged) ── */
  async function renderPortfolio(view) {
    const has = W.portfolio.all().length > 0;
    view.innerHTML = `
      <div class="card">
        <div class="watch-head"><h3>💼 Holdings</h3>
          <div class="qa"><button class="btn primary" id="p-add">+ Add Holding</button><button class="btn" id="p-tx">↔ Buy / Sell</button></div>
        </div>
        <div id="p-body">${has ? W.ui.spinner() : W.ui.empty("💼", "No holdings yet", "Add a holding or record a transaction")}</div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>📜 Transaction History</h3>${txList(W.portfolio.txs().slice().reverse())}</div>
        <div class="card"><h3>👛 Wallet Tracking</h3><p class="muted small">Connect MetaMask or Phantom in the <a class="link" href="#/web3">Web3 tab</a> to view on-chain balances. Manual holdings above are stored privately in your browser.</p></div>
      </div>`;
    view.querySelector("#p-add").onclick = () => holdingModal();
    view.querySelector("#p-tx").onclick = () => txModal();
    if (has) {
      const { rows } = await enrich();
      const body = view.querySelector("#p-body");
      if (body) {
        body.innerHTML = holdingsTable(rows);
        wireRows(body, rows);
      }
    }
  }

  return { render, renderPortfolio, holdingModal, txModal, enrich };
})();
