// ===============================================================
//                     Weaver Dashboard UI
// ===============================================================
// CSP Compliant: no style="" attributes. Dynamic styles via CSSOM.
// ===============================================================

window.W = window.W || {};

W.dashboard = (() => {
  const statCard = (label, big, sub) => `
    <div class="card stat">
      <div class="stat-label">${W.fmt.escapeHTML(label)}</div>
      <div class="stat-big">${big}</div>
      <div class="stat-sub">${W.fmt.escapeHTML(sub)}</div>
    </div>`;

  const signedMoney = (n) => {
    if (n == null || isNaN(n)) return "—";
    const isUp = n >= 0;
    return `<span class="${isUp ? "text-up" : "text-down"}">${isUp ? "+" : "-"}${W.fmt.money(Math.abs(n))}</span>`;
  };

  const tapeHTML = (coins) => {
    if (!coins || !Array.isArray(coins) || !coins.length) {
      return '<div class="tape-wrap"><div class="tape"><span class="tape-item text-muted">📊 Loading market data...</span></div></div>';
    }
    let tapeItems = "";
    let validCount = 0;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c || typeof c !== "object") continue;
      const symbol = c.symbol ? String(c.symbol).toUpperCase() : null;
      if (!symbol) continue;
      const price =
        c.current_price !== undefined
          ? c.current_price
          : c.price !== undefined
            ? c.price
            : null;
      if (price === null || price === undefined || isNaN(price)) continue;
      const change =
        c.price_change_percentage_24h_in_currency !== undefined
          ? c.price_change_percentage_24h_in_currency
          : 0;
      tapeItems += `<span class="tape-item"><b>${W.fmt.escapeHTML(symbol)}</b><span class="text-muted">${W.fmt.price(price)}</span>${W.fmt.pct(change)}</span>`;
      validCount++;
      if (validCount >= 20) break;
    }
    if (!tapeItems)
      return '<div class="tape-wrap"><div class="tape"><span class="tape-item text-muted">📊 No market data available</span></div></div>';
    return `<div class="tape-wrap"><div class="tape">${tapeItems + tapeItems}</div></div>`;
  };

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
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = up ? "var(--up)" : "var(--down)";
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
    ctx.fillStyle = up ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)";
    ctx.fill();
  }

  const sparkCell = (arr, up) =>
    arr && arr.length
      ? `<canvas class="spark" data-up="${up ? 1 : 0}" data-spark="${arr
          .filter((_, i) => i % 6 === 0)
          .map((v) => v.toFixed(4))
          .join(",")}"></canvas>`
      : '<span class="text-muted small-text">—</span>';

  const termRow = (c, i) => {
    if (!c || typeof c !== "object") return "";
    const id = c.id || "unknown",
      image = c.image || "",
      name = c.name || "Unknown";
    const symbol = c.symbol ? String(c.symbol).toUpperCase() : "???";
    const price =
      c.current_price !== undefined ? c.current_price : c.price || 0;
    const p24 =
      c.price_change_percentage_24h_in_currency !== undefined
        ? c.price_change_percentage_24h_in_currency
        : 0;
    const sparkline = (c.sparkline_in_7d || {}).price || [];
    return `<tr class="clickable" data-coin="${W.fmt.escapeHTML(id)}">
      <td class="text-muted">${i + 1}</td>
      <td class="coin-cell"><img src="${W.fmt.escapeHTML(image)}" alt="${W.fmt.escapeHTML(name)}" class="coin-img"><div><b>${W.fmt.escapeHTML(symbol)}</b><br><span class="text-muted small-text">${W.fmt.escapeHTML(name)}</span></div></td>
      <td class="num"><b>${W.fmt.price(price)}</b></td>
      <td class="num">${W.fmt.pct(p24)}</td>
      <td>${sparkCell(sparkline, p24 >= 0)}</td>
    </tr>`;
  };

  async function enrich() {
    const manualHoldings = W.portfolio ? W.portfolio.all() : [];
    let walletHoldings = [];
    if (W.walletSync && typeof W.walletSync.holdings === "function")
      walletHoldings = W.walletSync.holdings() || [];
    const allHoldings = [
      ...manualHoldings.map((h) => ({ ...h, wallet: false })),
      ...walletHoldings.map((h) => ({ ...h, wallet: true })),
    ];
    if (!allHoldings.length) return { rows: [], totals: null };
    const ids = [...new Set(allHoldings.map((h) => h.coinId))]
      .filter(Boolean)
      .join(",");
    let markets = [];
    if (ids.trim()) {
      try {
        markets = await W.api.markets(ids);
      } catch (e) {
        console.warn("[Dashboard] Market fetch failed:", e.message);
      }
    }
    const rows = allHoldings
      .map((h) => {
        const m = markets.find((c) => c.id === h.coinId) || {};
        const price = m.current_price ?? h.buyPrice ?? 0;
        const qty = parseFloat(h.qty) || 0;
        const value = price * qty;
        let cost;
        if (h.wallet) {
          cost =
            h.manualCostBasis && typeof h.manualCostBasis.totalCost === "number"
              ? h.manualCostBasis.totalCost
              : 0;
        } else {
          cost =
            h.totalCost !== undefined
              ? h.totalCost
              : (parseFloat(h.buyPrice) || 0) * qty;
          if (cost === undefined || cost === null || isNaN(cost) || cost < 0)
            cost = 0;
        }
        return {
          ...h,
          price,
          value,
          cost,
          pnl: value - cost,
          pnlPct: cost ? ((value - cost) / cost) * 100 : 0,
          p24: m.price_change_percentage_24h_in_currency ?? null,
          image: m.image || h.img,
        };
      })
      .sort((a, b) => b.value - a.value);

    const totals = { value: 0, cost: 0 };
    let prev24 = 0;
    rows.forEach((r) => {
      totals.value += r.value;
      totals.cost += r.cost;
      if (r.p24 != null) prev24 += r.value / (1 + r.p24 / 100);
    });
    totals.allTime = totals.value - totals.cost;
    totals.allTimePct = totals.cost ? (totals.allTime / totals.cost) * 100 : 0;
    totals.day = totals.value - prev24;
    totals.dayPct = prev24 ? (totals.day / prev24) * 100 : 0;
    return { rows, totals };
  }

  const holdingsTable = (rows) => `
    <div class="table-wrap"><table><thead><tr><th>Asset</th><th>Price</th><th>24h</th><th>Qty</th><th>Value</th><th>P/L</th><th></th></tr></thead><tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td class="coin-cell"><img src="${W.fmt.escapeHTML(r.image || r.img || "")}" alt="${W.fmt.escapeHTML(r.name)}" class="coin-img"><div><b>${W.fmt.escapeHTML(r.name)}</b><br><span class="text-muted small-text">${W.fmt.escapeHTML(String(r.symbol).toUpperCase())}</span></div></td>
        <td>${W.fmt.price(r.price)}</td><td>${W.fmt.pct(r.p24)}</td><td>${r.qty}</td>
        <td><b>${W.fmt.money(r.value)}</b></td>
        <td>${r.wallet ? '<span class="text-muted">—</span>' : signedMoney(r.pnl) + '<div class="small-text">' + W.fmt.pct(r.pnlPct) + "</div>"}</td>
        <td class="row-actions">${r.wallet ? '<span class="tag rank">👛 wallet</span>' : `<button class="icon-btn" data-edit="${W.fmt.escapeHTML(r.id)}">✏️</button><button class="icon-btn" data-del="${W.fmt.escapeHTML(r.id)}">🗑️</button>`}</td>
      </tr>`,
        )
        .join("")}
    </tbody></table></div>`;

  function wireRows(container, rows) {
    rows.forEach((r) => {
      if (r.wallet) return;
      const e = container.querySelector(`[data-edit="${CSS.escape(r.id)}"]`);
      const d = container.querySelector(`[data-del="${CSS.escape(r.id)}"]`);
      if (e) e.onclick = () => holdingModal(r);
      if (d)
        d.onclick = () =>
          W.ui.confirm(`Remove <b>${W.fmt.escapeHTML(r.name)}</b>?`, () => {
            if (W.portfolio && W.portfolio.remove) W.portfolio.remove(r.id);
            W.ui.toast("Holding removed", "ok");
            W.refresh();
          });
    });
  }

  function holdingModal(existing = null, preselect = null) {
    const coinLine = existing
      ? `<p class="text-muted small-text">Coin: <b>${W.fmt.escapeHTML(existing.name)} (${W.fmt.escapeHTML(existing.symbol.toUpperCase())})</b></p>`
      : preselect
        ? `<p class="text-muted small-text">Coin: <b>${W.fmt.escapeHTML(preselect.name)} (${W.fmt.escapeHTML(preselect.symbol.toUpperCase())})</b></p>`
        : `<div id="picker"></div>`;
    const m = W.ui.modal({
      title: existing
        ? `Edit ${W.fmt.escapeHTML(existing.name)}`
        : "Add Holding",
      body: `<form id="h-form">${coinLine}<label>Quantity<input type="number" step="any" name="qty" required value="${existing ? existing.qty : ""}" placeholder="0.5"></label><label>Average buy price<input type="number" step="any" name="buyPrice" required value="${existing ? existing.buyPrice : ""}" placeholder="29500"></label></form>`,
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
    if (!existing && !preselect && W.ui.coinPicker)
      W.ui.coinPicker(m.el.querySelector("#picker"), (p) => (picked = p));
    m.el.querySelector("#h-cancel").onclick = m.close;
    m.el.querySelector("#h-save").onclick = () => {
      const f = m.el.querySelector("#h-form");
      const qty = parseFloat(f.qty.value),
        buyPrice = parseFloat(f.buyPrice.value);
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      if (!qty || qty <= 0 || isNaN(buyPrice) || buyPrice < 0)
        return W.ui.toast("Enter valid quantity and price", "warn");
      if (existing && W.portfolio && W.portfolio.update)
        W.portfolio.update(existing.id, { qty, buyPrice });
      else if (W.portfolio && W.portfolio.add)
        W.portfolio.add({
          coinId: picked.id,
          symbol: picked.symbol,
          name: picked.name,
          img: picked.img,
          qty,
          buyPrice,
          date: Date.now(),
        });
      m.close();
      W.ui.toast(existing ? "Holding updated" : "Holding added 🎉", "ok");
      W.refresh();
    };
  }

  async function render(view) {
    view.innerHTML = `
      <p class="muted small mb-16">Your evidence-driven crypto intelligence workspace.</p>
      <div id="d-data-health" aria-live="polite"></div>
      <div class="cards" id="d-stats"></div>
      <div class="grid-2">
        <div id="what-matters-now-container"></div>
        <div id="what-changed-container"></div>
      </div>
      <div class="card mt-16">
        <div class="flex-between mb-8"><h3>💼 Your Portfolio</h3></div>
        <div id="d-port"></div>
      </div>
      <div class="card mt-16">
        <div class="flex-between mb-8">
          <h3>🌐 Markets Terminal</h3>
          <div class="qa">
            <button class="chip active" data-tab="trending">🔥 Trending</button>
            <button class="chip" data-tab="top">🏆 Top</button>
            <button class="chip" data-tab="gain">📈 Gainers</button>
            <button class="chip" data-tab="lose">📉 Losers</button>
          </div>
        </div>
        <div id="d-tape"></div>
        <div class="table-wrap">
          <table class="term-table">
            <thead><tr><th>#</th><th>Token</th><th class="num">Price</th><th class="num">24H</th><th>7d Chart</th></tr></thead>
            <tbody id="d-rows"><tr><td colspan="5" class="text-center text-muted">${W.ui.spinner()}</td></tr></tbody>
          </table>
        </div>
      </div>
      <div class="card text-center p-24 mt-16">
        <h3 class="mb-16">Next Steps</h3>
        <div class="qa flex-center gap-16">
          <a href="#/token" class="btn primary">🔍 Analyze a Token</a>
          <button class="btn" id="qa-add">+ Add Holding</button>
          <button class="btn" id="qa-sync" title="Sync connected wallets">👛 Sync Wallets</button>
        </div>
      </div>
    `;

    view.querySelector("#qa-add").onclick = () => holdingModal();
    const syncBtn = view.querySelector("#qa-sync");
    if (syncBtn)
      syncBtn.onclick = async () => {
        W.ui.toast("👛 Syncing wallets…", "info");
        if (W.walletSync && W.walletSync.refresh) {
          await W.walletSync.refresh();
          W.refresh();
        } else W.ui.toast("Wallet sync module not available", "warn");
      };

    const [topR, globR, fgR, pf] = await Promise.allSettled([
      W.api.top(100),
      W.api.global(),
      W.api.fearGreed(),
      enrich(),
    ]);
    const TOP =
      topR.status === "fulfilled" && Array.isArray(topR.value)
        ? topR.value
        : [];
    const rows = pf.status === "fulfilled" ? pf.value.rows : [];
    const totals = pf.status === "fulfilled" ? pf.value.totals : null;
    const g = globR.status === "fulfilled" ? globR.value.data : null;

    const healthEl = view.querySelector("#d-data-health");
    if (healthEl && W.ui.renderDataStatus) {
      W.ui.renderDataStatus(healthEl, [
        "markets",
        "global-market",
        "fear-greed",
      ]);
    }

    const statsEl = view.querySelector("#d-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        ${totals ? statCard("Total Balance", W.fmt.money(totals.value), rows.length + " assets") : statCard("Total Balance", "—", "Add holdings to get started")}
        ${totals ? statCard("P/L · 24h", signedMoney(totals.day), W.fmt.pct(totals.dayPct)) : ""}
        ${g ? statCard("Global Market Cap", W.fmt.money(g.total_market_cap[W.currency()], { compact: true }), W.fmt.pct(g.market_cap_change_percentage_24h_usd)) : ""}
      `;
    }

    const tapeContainer = view.querySelector("#d-tape");
    if (tapeContainer)
      tapeContainer.innerHTML = TOP.length
        ? tapeHTML(TOP.slice(0, 20))
        : tapeHTML([]);

    let tab = "trending";
    const drawRows = () => {
      let list = TOP;
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
      const rowsEl = view.querySelector("#d-rows");
      if (rowsEl) {
        rowsEl.innerHTML = list.length
          ? list
              .map(termRow)
              .filter((r) => r !== "")
              .join("")
          : '<tr><td colspan="5" class="text-center text-muted">No data available.</td></tr>';
        rowsEl
          .querySelectorAll("tr[data-coin]")
          .forEach(
            (tr) =>
              (tr.onclick = () =>
                (location.hash = "#/coin/" + tr.dataset.coin)),
          );
        rowsEl.querySelectorAll("canvas.spark").forEach(drawSpark);
      }
    };
    view.querySelectorAll("[data-tab]").forEach((c) => {
      c.onclick = () => {
        view
          .querySelectorAll("[data-tab]")
          .forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        tab = c.dataset.tab;
        drawRows();
      };
    });
    drawRows();

    const port = view.querySelector("#d-port");
    if (port) {
      if (!rows.length)
        port.innerHTML =
          '<p class="text-muted small-text text-center">No holdings yet. Click "+ Add Holding" above.</p>';
      else {
        port.innerHTML = holdingsTable(rows);
        wireRows(port, rows);
      }
    }

    const rankerContainer = view.querySelector("#what-matters-now-container");
    if (rankerContainer && W.decisionEngine) {
      const userContext = {
        portfolio: W.portfolio?.all() || [],
        watchlist: (W.watchlist?.all ? W.watchlist.all() : []).map(
          (w) => w.symbol,
        ),
        theses: W.theses?.all() || [],
        behavior: W.behavior?.analyze() || { pattern: "none" },
      };
      W.decisionEngine
        .run(userContext)
        .then((decisions) => {
          W.ranker.renderCard(rankerContainer, decisions, userContext);
        })
        .catch(() => {
          rankerContainer.innerHTML =
            '<div class="card"><p class="text-muted small-text">Intelligence feed temporarily unavailable.</p></div>';
        });
    }

    const changedContainer = view.querySelector("#what-changed-container");
    if (changedContainer) {
      changedContainer.innerHTML = "";

      const card = document.createElement("div");
      card.className = "card";
      const title = document.createElement("h3");
      title.textContent = "🔍 Discoveries";
      card.appendChild(title);

      // New intelligence — recent Gem Agent discoveries, sourced from
      // the Thesis records Gem Agent already auto-creates (see
      // js/features/gems.js autoCreateThesis / sourceRef). Real
      // intelligence-pipeline data, not invented for this UI.
      const newIntelLabel = document.createElement("p");
      newIntelLabel.className = "muted small mb-8";
      newIntelLabel.style.marginTop = "8px";
      newIntelLabel.textContent = "New intelligence";
      card.appendChild(newIntelLabel);

      const gemTheses = (W.theses?.all?.() || [])
        .filter((t) => t.sourceRef?.type === "gem")
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 3);

      if (!gemTheses.length) {
        const p = document.createElement("p");
        p.className = "muted small";
        p.textContent =
          "No new discoveries yet — run Gem Agent to populate this.";
        card.appendChild(p);
      } else {
        const list = document.createElement("ul");
        list.style.listStyle = "none";
        list.style.padding = "0";
        list.style.margin = "0";
        gemTheses.forEach((t) => {
          const li = document.createElement("li");
          li.style.padding = "8px 0";
          li.style.borderBottom = "1px solid var(--border, #30363d)";

          const head = document.createElement("div");
          head.style.display = "flex";
          head.style.justifyContent = "space-between";
          const asset = document.createElement("b");
          asset.textContent = t.asset; // SAFE: textContent
          const security = document.createElement("span");
          security.className = "muted small";
          security.textContent = t.signals || "Security status unavailable"; // SAFE
          head.appendChild(asset);
          head.appendChild(security);
          li.appendChild(head);

          if (t.reasons) {
            const why = document.createElement("p");
            why.className = "muted small mt-4";
            why.textContent = t.reasons; // SAFE: textContent
            li.appendChild(why);
          }
          list.appendChild(li);
        });
        card.appendChild(list);
      }

      // Portfolio changes — existing delta engine, unchanged data flow,
      // rendered without its own card wrapper so it composes cleanly
      // into this shared card instead of nesting card-in-card.
      const pfLabel = document.createElement("p");
      pfLabel.className = "muted small mb-8";
      pfLabel.style.marginTop = "16px";
      pfLabel.textContent = "Portfolio changes";
      card.appendChild(pfLabel);

      const pfContainer = document.createElement("div");
      card.appendChild(pfContainer);

      if (totals && W.delta) {
        const deltas = W.delta.computePortfolioDeltas(totals);
        W.delta.renderList(pfContainer, deltas);
        const currentSnapshot = W.delta.getSnapshot();
        if (
          !currentSnapshot ||
          Date.now() - currentSnapshot.timestamp > 3600000
        )
          W.delta.saveSnapshot(totals);
      } else {
        const p = document.createElement("p");
        p.className = "muted small";
        p.textContent =
          "Add holdings to your portfolio to start tracking value changes over time.";
        pfContainer.appendChild(p);
      }

      changedContainer.appendChild(card);
    }
  }

  function renderPortfolio(view) {
    const has = W.portfolio ? W.portfolio.all().length > 0 : false;
    view.innerHTML = `<div class="card"><div class="flex-between mb-8"><h3>💼 Holdings</h3><div class="qa"><button class="btn primary" id="p-add">+ Add Holding</button></div></div><div id="p-body">${has ? W.ui.spinner() : '<p class="text-muted">No holdings yet.</p>'}</div></div>`;
    view.querySelector("#p-add").onclick = () => holdingModal();
    if (has) {
      enrich().then(({ rows }) => {
        const body = view.querySelector("#p-body");
        if (body) {
          body.innerHTML = holdingsTable(rows);
          wireRows(body, rows);
        }
      });
    }
  }

  return { render, renderPortfolio, holdingModal, enrich };
})();

console.log("[Dashboard] Module loaded (CSP compliant).");
