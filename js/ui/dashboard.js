window.W = window.W || {};

W.dashboard = (() => {
  let chartAlloc = null;

  const statCard = (label, big, sub) =>
    `<div class="card stat"><div class="stat-label">${label}</div><div class="stat-big">${big}</div><div class="stat-sub">${sub}</div></div>`;
  const signedMoney = (n) =>
    n == null
      ? "—"
      : `<span class="${n >= 0 ? "up" : "down"}">${n >= 0 ? "+" : "-"}${W.fmt.money(Math.abs(n))}</span>`;

  async function enrich() {
    const holdings = W.portfolio.all();
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
          cost = h.buyPrice * h.qty;
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
        <td class="row-actions"><button class="icon-btn" data-edit="${r.id}" title="Edit">✏️</button><button class="icon-btn" data-del="${r.id}" title="Delete">🗑️</button></td>
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

  async function render(view) {
    if (!W.portfolio.all().length) {
      view.innerHTML = `
        ${W.ui.empty("💼", "Your portfolio is empty", "Add your first holding and Weaver will track prices, P/L and risk for you")}
        <div class="center">
          <button class="btn primary" id="btn-add-first">+ Add Your First Holding</button>
          <button class="btn ml" id="btn-sample">🎲 Load Sample Portfolio</button>
        </div>`;
      view.querySelector("#btn-add-first").onclick = () => holdingModal();
      view.querySelector("#btn-sample").onclick = () => {
        W.portfolio.seed();
        W.ui.toast("Sample portfolio loaded 🎉", "ok");
        W.refresh();
      };
      return;
    }
    view.innerHTML = W.ui.spinner();
    const { rows, totals } = await enrich();
    if (!view.isConnected) return;
    view.innerHTML = `
      <div class="cards">
        ${statCard("Total Balance", W.fmt.money(totals.value), `${rows.length} asset${rows.length > 1 ? "s" : ""}`)}
        ${statCard("Profit / Loss · 24h", signedMoney(totals.day), W.fmt.pct(totals.dayPct))}
        ${statCard("Profit / Loss · 7d", signedMoney(totals.week), W.fmt.pct(totals.weekPct))}
        ${statCard("Profit / Loss · All Time", signedMoney(totals.allTime), W.fmt.pct(totals.allTimePct))}
      </div>
      <div class="grid-2">
        <div class="card"><h3>Asset Allocation</h3><div class="chart-box"><canvas id="alloc"></canvas></div></div>
        <div class="card"><h3>Quick Actions</h3>
          <div class="qa">
            <button class="btn primary" id="qa-add">+ Add Holding</button>
            <button class="btn" id="qa-tx">↔ Buy / Sell</button>
            <button class="btn" id="qa-ai">🤖 AI Review</button>
          </div>
          <h3 class="mt">Recent Transactions</h3>
          ${txList(W.portfolio.txs().slice(-5).reverse())}
        </div>
      </div>
      <div class="card"><h3>Holdings</h3>${holdingsTable(rows)}</div>`;
    view.querySelector("#qa-add").onclick = () => holdingModal();
    view.querySelector("#qa-tx").onclick = () => txModal();
    view.querySelector("#qa-ai").onclick = () => (location.hash = "#/ai");
    wireRows(view, rows);
    if (window.Chart) {
      chartAlloc?.destroy();
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
          plugins: {
            legend: {
              position: "right",
              labels: { color: "#9aa3b2", boxWidth: 12 },
            },
          },
        },
      });
    }
  }

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
