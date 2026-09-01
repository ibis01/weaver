// ===============================================================
//                     Weaver Dashboard UI
// ===============================================================
//
// Purpose: Render the main dashboard, integrating portfolio,
// market terminal, and the "What Matters Now" intelligence ranker.
// Security: Strictly escapes all dynamic data
// Intelligence: Uses W.decisionEngine for signal ranking.
//
// ===============================================================

window.W = window.W || {};

W.dashboard = (() => {
  let chartAlloc = null;

  // ── Helper: Safe Stat Card HTML ───────────────────────
  const statCard = (label, big, sub) => `
    <div class="card stat">
      <div class="stat-label">${W.fmt.escapeHTML(label)}</div>
      <div class="stat-big">${big}</div>
      <div class="stat-sub">${W.fmt.escapeHTML(sub)}</div>
    </div>`;

  // ── Helper: Signed Money ──────────────────────────────
  const signedMoney = (n) => {
    if (n == null || isNaN(n)) return "—";
    const isUp = n >= 0;
    return `<span class="${isUp ? "up" : "down"}">${isUp ? "+" : "-"}${W.fmt.money(Math.abs(n))}</span>`;
  };

  // ── Helper: Terminal Tape ─────────────────────────────
  const tapeHTML = (coins) => {
    if (!coins || !Array.isArray(coins) || !coins.length) {
      return '<div class="tape-wrap"><div class="tape"><span class="tape-item muted">📊 Loading market data...</span></div></div>';
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

      tapeItems += `
        <span class="tape-item">
          <b>${W.fmt.escapeHTML(symbol)}</b>
          <span class="muted">${W.fmt.price(price)}</span>
          ${W.fmt.pct(change)}
        </span>`;
      validCount++;
      if (validCount >= 20) break;
    }

    if (!tapeItems) {
      return '<div class="tape-wrap"><div class="tape"><span class="tape-item muted">📊 No market data available</span></div></div>';
    }

    return `<div class="tape-wrap"><div class="tape">${tapeItems + tapeItems}</div></div>`;
  };

  // ── Helper: Sparkline Canvas ──────────────────────────
  function drawSpark(c) {
    const vals = (c.dataset.spark || "")
      .split(",")
      .map(Number)
      .filter((v) => !isNaN(v));
    if (vals.length < 2) return;

    const w = (c.width = 110);
    const h = (c.height = 30);
    const ctx = c.getContext("2d");
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const up = c.dataset.up === "1";

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = up ? "#2ee6a8" : "#ff5c7a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
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

  // ── Helper: Terminal Row (Strictly Escaped) ───────────
  const termRow = (c, i) => {
    if (!c || typeof c !== "object") return "";

    const id = c.id || "unknown";
    const image = c.image || "";
    const name = c.name || "Unknown";
    const symbol = c.symbol ? String(c.symbol).toUpperCase() : "???";
    const price =
      c.current_price !== undefined ? c.current_price : c.price || 0;
    const p24 =
      c.price_change_percentage_24h_in_currency !== undefined
        ? c.price_change_percentage_24h_in_currency
        : 0;
    const p7 =
      c.price_change_percentage_7d_in_currency !== undefined
        ? c.price_change_percentage_7d_in_currency
        : 0;
    const p30 =
      c.price_change_percentage_30d_in_currency !== undefined
        ? c.price_change_percentage_30d_in_currency
        : 0;
    const marketCap = c.market_cap || 0;
    const volume = c.total_volume || 0;
    const sparkline = (c.sparkline_in_7d || {}).price || [];

    return `
      <tr class="clickable" data-coin="${W.fmt.escapeHTML(id)}">
        <td class="muted">${i + 1}</td>
        <td class="coin-cell">
          <img src="${W.fmt.escapeHTML(image)}" alt="${W.fmt.escapeHTML(name)}" style="width:24px;height:24px;border-radius:50%;">
          <div>
            <b>${W.fmt.escapeHTML(symbol)}</b>
            <br><span class="muted small">${W.fmt.escapeHTML(name)}</span>
          </div>
        </td>
        <td class="num"><b>${W.fmt.price(price)}</b></td>
        <td class="num">${W.fmt.pct(p24)}</td>
        <td class="num">${W.fmt.pct(p7)}</td>
        <td class="num">${W.fmt.pct(p30)}</td>
        <td class="num">${W.fmt.money(marketCap, { compact: true })}</td>
        <td class="num">${W.fmt.money(volume, { compact: true })}</td>
        <td>${sparkCell(sparkline, p24 >= 0)}</td>
      </tr>
    `;
  };

  // ── Enrich Portfolio Data ─────────────────────────────
  async function enrich() {
    const manualHoldings = W.portfolio ? W.portfolio.all() : [];
    let walletHoldings = [];

    if (W.walletSync && typeof W.walletSync.holdings === "function") {
      walletHoldings = W.walletSync.holdings() || [];
    }

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

        // ── Cost basis logic ────────────────────────────
        let cost;
        let costBasisType = "KNOWN";

        if (h.wallet) {
          // Wallet holdings: default to UNKNOWN cost basis
          if (
            h.manualCostBasis &&
            typeof h.manualCostBasis.totalCost === "number"
          ) {
            cost = h.manualCostBasis.totalCost;
            costBasisType = "MANUAL";
          } else {
            cost = undefined;
            costBasisType = "UNKNOWN";
          }
        } else {
          // Manual holdings: use totalCost if available, else compute from qty*buyPrice
          cost =
            h.totalCost !== undefined
              ? h.totalCost
              : (parseFloat(h.buyPrice) || 0) * qty;
          if (cost === undefined || cost === null || isNaN(cost) || cost < 0) {
            cost = 0;
          }
        }

        let pnl, pnlPct;
        if (cost !== undefined && cost !== null && !isNaN(cost)) {
          pnl = value - cost;
          pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
        } else {
          pnl = undefined;
          pnlPct = undefined;
        }

        return {
          ...h,
          price,
          value,
          cost,
          costBasisType,
          pnl,
          pnlPct,
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
      if (r.cost !== undefined && r.cost !== null && !isNaN(r.cost)) {
        totals.cost += r.cost;
      }
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

  // ── Holdings Table (Strictly Escaped) ─────────────────
  const holdingsTable = (rows) => `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>24h</th>
            <th>Qty</th>
            <th>Avg Buy</th>
            <th>Value</th>
            <th>P/L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td class="coin-cell">
                <img src="${W.fmt.escapeHTML(r.image || r.img || "")}" alt="${W.fmt.escapeHTML(r.name)}">
                <div>
                  <b>${W.fmt.escapeHTML(r.name)}</b>
                  <br><span class="muted small">${W.fmt.escapeHTML(String(r.symbol).toUpperCase())}</span>
                </div>
              </td>
              <td>${W.fmt.price(r.price)}</td>
              <td>${W.fmt.pct(r.p24)}</td>
              <td>${r.qty}</td>
              <td>${r.wallet ? (r.costBasisType === "UNKNOWN" ? '<span class="muted small">Unknown</span>' : "—") : W.fmt.price(r.buyPrice)}</td>
              <td><b>${W.fmt.money(r.value)}</b></td>
              <td>
                ${
                  r.costBasisType === "UNKNOWN"
                    ? '<span class="muted small">Cost basis unknown</span>'
                    : r.wallet
                      ? '<span class="muted">—</span>'
                      : signedMoney(r.pnl) +
                        '<div class="small">' +
                        W.fmt.pct(r.pnlPct) +
                        "</div>"
                }
              </td>
              <td class="row-actions">
                ${
                  r.wallet
                    ? '<span class="tag rank" title="From connected wallet">👛 wallet</span>'
                    : `<button class="icon-btn" data-edit="${W.fmt.escapeHTML(r.id)}" title="Edit">✏️</button>
                     <button class="icon-btn" data-del="${W.fmt.escapeHTML(r.id)}" title="Delete">🗑️</button>`
                }
              </td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  // ── Wire Row Actions ──────────────────────────────────
  function wireRows(container, rows) {
    rows.forEach((r) => {
      if (r.wallet) return;
      const e = container.querySelector(`[data-edit="${CSS.escape(r.id)}"]`);
      const d = container.querySelector(`[data-del="${CSS.escape(r.id)}"]`);

      if (e) e.onclick = () => holdingModal(r);
      if (d) {
        d.onclick = () =>
          W.ui.confirm(
            `Remove <b>${W.fmt.escapeHTML(r.name)}</b> from your portfolio?`,
            () => {
              if (W.portfolio && W.portfolio.remove) W.portfolio.remove(r.id);
              W.ui.toast("Holding removed", "ok");
              W.refresh();
            },
          );
      }
    });
  }

  // ── Holding Modal ─────────────────────────────────────
  function holdingModal(existing = null, preselect = null) {
    const coinLine = existing
      ? `<p class="muted small">Coin: <b>${W.fmt.escapeHTML(existing.name)} (${W.fmt.escapeHTML(existing.symbol.toUpperCase())})</b></p>`
      : preselect
        ? `<p class="muted small">Coin: <b>${W.fmt.escapeHTML(preselect.name)} (${W.fmt.escapeHTML(preselect.symbol.toUpperCase())})</b></p>`
        : `<div id="picker"></div>`;

    const m = W.ui.modal({
      title: existing
        ? `Edit ${W.fmt.escapeHTML(existing.name)}`
        : "Add Holding",
      body: `
        <form id="h-form">
          ${coinLine}
          <label>Quantity
            <input type="number" step="any" name="qty" required value="${existing ? existing.qty : ""}" placeholder="0.5">
          </label>
          <label>Average buy price
            <input type="number" step="any" name="buyPrice" required value="${existing ? existing.buyPrice : ""}" placeholder="29500">
          </label>
          <label>Date (optional)
            <input type="date" name="date">
          </label>
        </form>
      `,
      footer: `
        <button class="btn ghost" id="h-cancel">Cancel</button>
        <button class="btn primary" id="h-save">${existing ? "Save" : "Add"}</button>
      `,
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

    if (!existing && !preselect && W.ui.coinPicker) {
      W.ui.coinPicker(m.el.querySelector("#picker"), (p) => (picked = p));
    }

    m.el.querySelector("#h-cancel").onclick = m.close;
    m.el.querySelector("#h-save").onclick = () => {
      const f = m.el.querySelector("#h-form");
      const qty = parseFloat(f.qty.value);
      const buyPrice = parseFloat(f.buyPrice.value);

      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      if (!qty || qty <= 0 || isNaN(buyPrice) || buyPrice < 0) {
        return W.ui.toast("Enter valid quantity and price", "warn");
      }

      if (existing && W.portfolio && W.portfolio.update) {
        W.portfolio.update(existing.id, { qty, buyPrice });
      } else if (W.portfolio && W.portfolio.add) {
        W.portfolio.add({
          coinId: picked.id,
          symbol: picked.symbol,
          name: picked.name,
          img: picked.img,
          qty,
          buyPrice,
          date: f.date.value ? new Date(f.date.value).getTime() : Date.now(),
        });
      }
      m.close();
      W.ui.toast(existing ? "Holding updated" : "Holding added 🎉", "ok");
      W.refresh();
    };
  }

  // ── Transaction Modal ─────────────────────────────────
  function txModal() {
    const m = W.ui.modal({
      title: "Record Transaction",
      body: `
        <form id="t-form">
          <label>Type
            <select name="type">
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <div id="picker"></div>
          <label>Quantity
            <input type="number" step="any" name="qty" required placeholder="0.25">
          </label>
          <label>Price per coin
            <input type="number" step="any" name="price" required placeholder="Price at time of trade">
          </label>
        </form>
      `,
      footer: `
        <button class="btn ghost" id="t-cancel">Cancel</button>
        <button class="btn primary" id="t-save">Record</button>
      `,
    });

    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(m.el.querySelector("#picker"), (p) => (picked = p));
    }

    m.el.querySelector("#t-cancel").onclick = m.close;
    m.el.querySelector("#t-save").onclick = () => {
      const f = m.el.querySelector("#t-form");
      const qty = parseFloat(f.qty.value);
      const price = parseFloat(f.price.value);

      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      if (!qty || qty <= 0 || !price || price <= 0) {
        return W.ui.toast("Enter valid quantity and price", "warn");
      }

      if (W.portfolio && W.portfolio.recordTx) {
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
      } else {
        W.ui.toast("Portfolio module not available", "warn");
      }
    };
  }

  // ── MAIN RENDER ───────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <!-- Intelligence Layer: What Matters Now (Powered by Decision Engine) -->
      <div id="what-matters-now-container"></div>
      <div id="what-changed-container"></div>
      <div id="d-tape"></div>
      <div class="cards" id="d-stats"></div>
      
      <div class="card">
        <div class="watch-head">
          <h3>🌐 Markets Terminal</h3>
          <div class="qa">
            <button class="btn primary tiny" id="qa-add" aria-label="Add holding">+ Add</button>
            <button class="btn tiny" id="qa-tx">↔ Buy/Sell</button>
            <button class="btn tiny" id="qa-sample" title="Load sample portfolio">🎲</button>
            <button class="btn tiny" id="qa-sync" title="Sync connected wallets">👛 Sync</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="term-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Token</th>
                <th class="num">Price</th>
                <th class="num">24H</th>
                <th class="num">7D</th>
                <th class="num">30D</th>
                <th class="num">Market Cap</th>
                <th class="num">Volume</th>
                <th>7d Chart</th>
              </tr>
            </thead>
            <tbody id="d-rows">
              <tr><td colspan="9">${W.ui.spinner()}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="grid-2">
        <div class="card">
          <div class="watch-head">
            <h3>💼 Your Portfolio</h3>
            <div class="qa">
              <button class="btn primary tiny" id="qa-add2">+ Add</button>
              <button class="btn tiny" id="qa-tx2">↔ Buy/Sell</button>
              <button class="btn tiny" id="qa-sample2" title="Load sample portfolio">🎲</button>
            </div>
          </div>
          <div id="d-port"></div>
        </div>
        <div class="card">
          <h3>🍩 Allocation</h3>
          <div class="chart-box"><canvas id="alloc"></canvas></div>
        </div>
      </div>
    `;

    // ── Wire Buttons ────────────────────────────────────
    view
      .querySelectorAll("#qa-add, #qa-add2")
      .forEach((b) => (b.onclick = () => holdingModal()));
    view
      .querySelectorAll("#qa-tx, #qa-tx2")
      .forEach((b) => (b.onclick = () => txModal()));

    view.querySelectorAll("#qa-sample, #qa-sample2").forEach((b) => {
      b.onclick = () => {
        if (W.portfolio && W.portfolio.seed) {
          W.portfolio.seed();
          W.ui.toast("Sample portfolio loaded 🎉", "ok");
          W.refresh();
        }
      };
    });

    const syncBtn = view.querySelector("#qa-sync");
    if (syncBtn) {
      syncBtn.onclick = async () => {
        W.ui.toast("👛 Syncing wallets…", "info");
        if (W.walletSync && W.walletSync.refresh) {
          await W.walletSync.refresh();
          W.refresh();
        } else {
          W.ui.toast("Wallet sync module not available", "warn");
        }
      };
    }

    // ── Fetch Data (Parallelized for Performance, Rule 31) ─
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
    const fg = fgR.status === "fulfilled" ? fgR.value : null;

    let trendR;
    try {
      const trendData = await W.api.trending();
      trendR = { status: "fulfilled", value: trendData };
    } catch (e) {
      trendR = { status: "rejected", reason: e };
    }

    // ── Render Tape ─────────────────────────────────────
    const tapeContainer = view.querySelector("#d-tape");
    if (tapeContainer)
      tapeContainer.innerHTML = TOP.length
        ? tapeHTML(TOP.slice(0, 20))
        : tapeHTML([]);

    // ── Render Stats ────────────────────────────────────
    const fgColor = fg
      ? fg.value < 25
        ? "#ff5c7a"
        : fg.value < 45
          ? "#ffb35c"
          : fg.value < 75
            ? "#f5d76e"
            : "#2ee6a8"
      : "#9aa3b2";
    const statsEl = view.querySelector("#d-stats");

    if (statsEl) {
      statsEl.innerHTML = `
        ${totals ? statCard("Total Balance", W.fmt.money(totals.value), rows.length + " assets") : statCard("Total Balance", "—", "add holdings below")}
        ${totals ? statCard("P/L · 24h", signedMoney(totals.day), W.fmt.pct(totals.dayPct)) : ""}
        ${g ? statCard("Global Market Cap", W.fmt.money(g.total_market_cap[W.currency()], { compact: true }), W.fmt.pct(g.market_cap_change_percentage_24h_usd)) : ""}
        ${g ? statCard("BTC Dominance", g.market_cap_percentage.btc.toFixed(1) + "%", "ETH " + g.market_cap_percentage.eth.toFixed(1) + "%") : ""}
        ${fg ? statCard("Fear & Greed", `<span style="color:${fgColor}">${fg.value}</span>`, fg.value_classification) : ""}
      `;
    }

    // ── Render Terminal Rows ────────────────────────────
    let tab = "trending";
    const drawRows = () => {
      let list = TOP;
      if (tab === "trending" && trendR && trendR.status === "fulfilled") {
        list = trendR.value.coins
          .map((x) => x.item.id)
          .map((id) => TOP.find((c) => c.id === id))
          .filter(Boolean);
        if (!list.length) list = TOP.slice(0, 20);
      }
      if (tab === "top") list = TOP.slice(0, 50);
      if (tab === "gain") {
        list = [...TOP]
          .sort(
            (a, b) =>
              (b.price_change_percentage_24h_in_currency ?? 0) -
              (a.price_change_percentage_24h_in_currency ?? 0),
          )
          .slice(0, 20);
      }
      if (tab === "lose") {
        list = [...TOP]
          .sort(
            (a, b) =>
              (a.price_change_percentage_24h_in_currency ?? 0) -
              (b.price_change_percentage_24h_in_currency ?? 0),
          )
          .slice(0, 20);
      }

      const rowsEl = view.querySelector("#d-rows");
      if (rowsEl) {
        const rowsHtml = list.length
          ? list
              .map(termRow)
              .filter((r) => r !== "")
              .join("")
          : '<tr><td colspan="9" class="muted center">All live sources unreachable — data appears when a pipe (or your cache) is available.</td></tr>';

        rowsEl.innerHTML = rowsHtml;
        rowsEl.querySelectorAll("tr[data-coin]").forEach((tr) => {
          tr.onclick = () => (location.hash = "#/coin/" + tr.dataset.coin);
        });
        rowsEl.querySelectorAll("canvas.spark").forEach(drawSpark);
      }
    };

    // ── Tab Switchers ───────────────────────────────────
    const tabContainer = view.querySelector(".watch-head .qa");
    if (tabContainer) {
      const tabs = ["trending", "top", "gain", "lose"];
      const labels = ["🔥 Trending", "🏆 Top", "📈 Gainers", "📉 Losers"];
      tabs.forEach((t, i) => {
        const btn = document.createElement("button");
        btn.className = `chip ${i === 0 ? "active" : ""}`;
        btn.dataset.tab = t;
        btn.textContent = labels[i];
        btn.onclick = () => {
          tabContainer
            .querySelectorAll("[data-tab]")
            .forEach((x) => x.classList.remove("active"));
          btn.classList.add("active");
          tab = t;
          drawRows();
        };
        tabContainer.appendChild(btn);
      });
    }

    drawRows();

    // ── Render Portfolio ────────────────────────────────
    const port = view.querySelector("#d-port");
    if (port) {
      if (!rows.length) {
        port.innerHTML = W.ui.empty(
          "💼",
          "Portfolio is empty",
          "Hit + Add, or 🎲 to load the sample portfolio",
        );
      } else {
        port.innerHTML = holdingsTable(rows);
        wireRows(port, rows);
      }
    }

    // ── Render Allocation Chart ─────────────────────────
    if (window.Chart) {
      const allocCanvas = view.querySelector("#alloc");
      if (allocCanvas) {
        if (chartAlloc) chartAlloc.destroy();

        if (rows.length) {
          chartAlloc = new Chart(allocCanvas, {
            type: "doughnut",
            data: {
              labels: rows.map((r) => String(r.symbol).toUpperCase()),
              datasets: [
                {
                  data: rows.map((r) => +r.value.toFixed(2)),
                  backgroundColor: W.PALETTE || [
                    "#7c5cff",
                    "#2ee6a8",
                    "#5cd6ff",
                    "#ffb35c",
                    "#ff5c7a",
                    "#c792ea",
                    "#f78c6c",
                    "#8bd450",
                    "#ff8bd0",
                    "#9aa3b2",
                  ],
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
                  labels: {
                    color: "#eef1f9",
                    font: { size: 11 },
                    usePointStyle: true,
                    pointStyle: "circle",
                  },
                },
              },
            },
          });
        } else if (g) {
          const others =
            100 - g.market_cap_percentage.btc - g.market_cap_percentage.eth;
          chartAlloc = new Chart(allocCanvas, {
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
              plugins: {
                legend: {
                  position: "right",
                  labels: {
                    color: "#eef1f9",
                    font: { size: 11 },
                    usePointStyle: true,
                    pointStyle: "circle",
                  },
                },
              },
            },
          });
        }
      }
    }

    // ── Render "What Matters Now" (Power by Decision Engine) ──
    const rankerContainer = view.querySelector("#what-matters-now-container");
    if (rankerContainer && W.decisionEngine) {
      try {
        const decisions = await W.decisionEngine.run();
        W.decisionEngine.render(rankerContainer, decisions);
      } catch (err) {
        console.warn("[Dashboard] Decision Engine failed:", err);
        rankerContainer.innerHTML =
          '<div class="card"><p class="muted small">Intelligence feed unavailable.</p></div>';
      }
    }

    // ── Render "What Changed" (Section 24 Integration) ────
    const changedContainer = view.querySelector("#what-changed-container");
    if (changedContainer && W.delta) {
      if (totals) {
        const deltas = W.delta.computePortfolioDeltas(totals);
        W.delta.renderCard(changedContainer, deltas);

        const currentSnapshot = W.delta.getSnapshot();
        if (
          !currentSnapshot ||
          Date.now() - currentSnapshot.timestamp > 3600000
        ) {
          W.delta.saveSnapshot(totals);
        }
      } else {
        changedContainer.innerHTML = `
          <div class="card">
            <h3>📊 What Changed</h3>
            <p class="muted small">Add holdings to your portfolio to start tracking value changes over time.</p>
          </div>
        `;
      }
    }
  }

  // ── Exports ───────────────────────────────────────────
  return {
    render,
    holdingModal,
    txModal,
    enrich,
  };
})();

console.log(
  "[Dashboard] Module loaded (secure & optimized, with Decision Engine).",
);
