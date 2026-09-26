// ===============================================================
//                     Weaver Dashboard UI (Command Center)
// ===============================================================
// CSP Compliant: ZERO inline style="..." attributes.
// Constitution Compliant:
//   §2.7 No fabricated data — unknown prices/costs render as "—".
//   §3.4 Graceful Degradation — failed price fetches fall back to a
//        labeled last-known-good cache ("·stale"), never to $0.00.
//   §3.6 Cache before repeated API calls.
//   §6.3 Missing data must reduce confidence, never become zero.
//   §6.4 Auditable — delta snapshots skipped while any asset unpriced.
// ===============================================================

window.W = window.W || {};

W.dashboard = (() => {
  const MARKET_ROWS_DEFAULT = 20;
  let marketRowsExpanded = false;

  // ── Last-known-good price cache (§3.6, §3.4) ─────────────────
  const PRICE_CACHE_KEY = "last_known_prices";
  const readPriceCache = () => W.store.get(PRICE_CACHE_KEY, {});

  // Safe fallback if skeleton module isn't loaded yet
  const skel = W.ui.skeleton || {
    stats: (n) => Array(n).fill('<div class="spinner"></div>').join(""),
    card: () => '<div class="spinner"></div>',
    chart: () => '<div class="spinner"></div>',
    feed: (n) => Array(n).fill('<div class="spinner"></div>').join(""),
    table: (n) => Array(n).fill('<div class="spinner"></div>').join(""),
  };

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
    ctx.strokeStyle = up ? "#10b981" : "#ef4444";
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

  // §6.3: Missing market price/change renders as honest "—", never $0.00
  const termRow = (c, i) => {
    if (!c || typeof c !== "object") return "";
    const id = c.id || "unknown",
      image = c.image || "",
      name = c.name || "Unknown";
    const symbol = c.symbol ? String(c.symbol).toUpperCase() : "???";
    const price = Number.isFinite(c.current_price)
      ? c.current_price
      : Number.isFinite(c.price)
        ? c.price
        : null;
    const p24 = Number.isFinite(c.price_change_percentage_24h_in_currency)
      ? c.price_change_percentage_24h_in_currency
      : null;
    const sparkline = (c.sparkline_in_7d || {}).price || [];
    return `<tr class="clickable" data-coin="${W.fmt.escapeHTML(id)}">
      <td class="text-muted">${i + 1}</td>
      <td class="coin-cell"><img src="${W.fmt.escapeHTML(image)}" alt="${W.fmt.escapeHTML(name)}" class="coin-img"><div><b>${W.fmt.escapeHTML(symbol)}</b><br><span class="text-muted small-text">${W.fmt.escapeHTML(name)}</span></div></td>
      <td class="num">${price !== null ? `<b>${W.fmt.price(price)}</b>` : '<span class="text-muted">—</span>'}</td>
      <td class="num">${p24 !== null ? W.fmt.pct(p24) : '<span class="text-muted">—</span>'}</td>
      <td>${sparkCell(sparkline, p24 !== null && p24 >= 0)}</td>
    </tr>`;
  };

  // ── Enrichment: honest prices + honest cost basis ────────────
  async function enrich() {
    const manualHoldings = W.portfolio ? W.portfolio.all() : [];
    const walletHoldings = W.walletSync?.holdings
      ? W.walletSync.holdings()
      : [];
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

    const priceCache = readPriceCache();
    let cacheDirty = false;

    const rows = allHoldings
      .map((h) => {
        const m = markets.find((c) => c.id === h.coinId) || {};

        // Current price comes ONLY from market data. Never from buyPrice. (§6.3)
        let price = Number.isFinite(m.current_price) ? m.current_price : null;
        let priceStale = false;

        if (price !== null) {
          priceCache[h.coinId] = { price, ts: Date.now() };
          cacheDirty = true;
        } else if (
          priceCache[h.coinId] &&
          Number.isFinite(priceCache[h.coinId].price)
        ) {
          // Rate-limited / offline: use last-known-good, explicitly labeled (§3.4)
          price = priceCache[h.coinId].price;
          priceStale = true;
        }

        const qty = parseFloat(h.qty) || 0;
        const value = price !== null ? price * qty : null;

        // §2.7: unknown cost basis stays null — NEVER 0 (no fabricated P/L)
        let cost = null;
        if (h.wallet) {
          if (
            h.manualCostBasis &&
            typeof h.manualCostBasis.totalCost === "number"
          )
            cost = h.manualCostBasis.totalCost;
        } else if (
          h.totalCost !== undefined &&
          h.totalCost !== null &&
          !isNaN(h.totalCost) &&
          h.totalCost >= 0
        ) {
          cost = h.totalCost;
        } else {
          const bp = parseFloat(h.buyPrice);
          if (!isNaN(bp) && bp >= 0) cost = bp * qty;
        }

        const pnl = value !== null && cost !== null ? value - cost : null;
        const pnlPct = pnl !== null && cost > 0 ? (pnl / cost) * 100 : null;

        return {
          ...h,
          price,
          priceStale,
          value,
          cost,
          pnl,
          pnlPct,
          p24: Number.isFinite(m.price_change_percentage_24h_in_currency)
            ? m.price_change_percentage_24h_in_currency
            : null,
          image: m.image || h.img,
        };
      })
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

    if (cacheDirty) W.store.set(PRICE_CACHE_KEY, priceCache);

    const totals = {
      value: 0,
      cost: 0,
      priced: 0,
      unpriced: 0,
      unknownCost: 0,
    };
    let prev24 = 0;
    rows.forEach((r) => {
      if (r.value !== null) {
        totals.value += r.value;
        totals.priced++;
        if (r.p24 != null) prev24 += r.value / (1 + r.p24 / 100);
      } else {
        totals.unpriced++;
      }
      if (r.cost !== null) totals.cost += r.cost;
      else if (r.value !== null) totals.unknownCost++;
    });

    totals.allTime = totals.cost > 0 ? totals.value - totals.cost : null;
    totals.allTimePct =
      totals.allTime !== null ? (totals.allTime / totals.cost) * 100 : null;
    totals.day = totals.value - prev24;
    totals.dayPct = prev24 ? (totals.day / prev24) * 100 : null;
    return { rows, totals };
  }

  // ── Holdings table: honest cells + basis button for wallets ──
  const holdingsTable = (rows) => `
    <div class="table-wrap"><table><thead><tr><th>Asset</th><th>Price</th><th>24h</th><th>Qty</th><th>Value</th><th>P/L</th><th></th></tr></thead><tbody>
      ${rows
        .map(
          (r, i) => `<tr>
        <td class="coin-cell"><img src="${W.fmt.escapeHTML(r.image || r.img || "")}" alt="${W.fmt.escapeHTML(r.name)}" class="coin-img"><div><b>${W.fmt.escapeHTML(r.name)}</b><br><span class="text-muted small-text">${W.fmt.escapeHTML(String(r.symbol).toUpperCase())}</span></div></td>
        <td class="num">${r.price !== null ? W.fmt.price(r.price) + (r.priceStale ? ' <span class="text-muted small-text">·stale</span>' : "") : '<span class="text-muted">—</span>'}</td>
        <td class="num">${r.p24 !== null ? W.fmt.pct(r.p24) : '<span class="text-muted">—</span>'}</td>
        <td class="num">${r.qty}</td>
        <td class="num">${r.value !== null ? `<b>${W.fmt.money(r.value)}</b>` : '<span class="text-muted">—</span>'}</td>
        <td class="num">${r.pnl !== null ? signedMoney(r.pnl) + '<div class="small-text">' + W.fmt.pct(r.pnlPct) + "</div>" : '<span class="text-muted" title="Cost basis unknown">—</span>'}</td>
        <td class="row-actions">${
          r.wallet
            ? `<span class="tag rank">👛 wallet</span> <button class="icon-btn" data-basis="${i}" title="Set cost basis">📝</button>`
            : `<button class="icon-btn" data-edit="${W.fmt.escapeHTML(r.id)}">✏️</button><button class="icon-btn" data-del="${W.fmt.escapeHTML(r.id)}">🗑️</button>`
        }</td>
      </tr>`,
        )
        .join("")}
    </tbody></table></div>`;

  function wireRows(container, rows) {
    rows.forEach((r, i) => {
      if (r.wallet) {
        const b = container.querySelector(`[data-basis="${i}"]`);
        if (b) b.onclick = () => basisModal(r);
        return;
      }
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

  // ── Manual Cost Basis Modal (wallet holdings) ────────────────
  function basisModal(r) {
    const existing = r.manualCostBasis;
    const m = W.ui.modal({
      title: `Cost basis — ${W.fmt.escapeHTML(r.symbol)}`,
      body: `<p class="text-muted small-text">Wallet sync cannot know your purchase history. Enter the <b>total amount paid</b> for this position so P/L is truthful. Leave empty to keep P/L unknown.</p>
        <label>Total cost (${W.fmt.escapeHTML(W.currency().toUpperCase())})<input type="number" step="any" min="0" id="b-cost" value="${existing ? existing.totalCost : ""}" placeholder="e.g. 500"></label>`,
      footer: `<button class="btn ghost" id="b-cancel">Cancel</button><button class="btn primary" id="b-save">Save</button>`,
    });
    m.el.querySelector("#b-cancel").onclick = m.close;
    m.el.querySelector("#b-save").onclick = () => {
      const raw = m.el.querySelector("#b-cost").value.trim();
      const total = raw === "" ? null : parseFloat(raw);
      if (total !== null && (!Number.isFinite(total) || total < 0))
        return W.ui.toast("Enter a valid non-negative cost", "warn");

      const basisMap = W.store.get("wallet_cost_basis", {});
      const key = `${r.walletChain}:${r.symbol}:${r.contractAddress ? String(r.contractAddress).toLowerCase() : "native"}`;

      if (total === null) delete basisMap[key];
      else basisMap[key] = { totalCost: total, updatedAt: Date.now() };

      W.store.set("wallet_cost_basis", basisMap);
      m.close();
      W.ui.toast("Cost basis saved", "ok");
      W.refresh();
    };
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

  // ── Performance chart ────────────────────────────────────────
  function destroyPerfChart(view) {
    if (view && view._dashboardPerfChart) {
      try {
        view._dashboardPerfChart.destroy();
      } catch (_) {}
      view._dashboardPerfChart = null;
    }
  }

  function snapshotsToSeries(rangeDays) {
    if (!W.timemachine || typeof W.timemachine.getSnapshots !== "function")
      return [];
    let snaps = W.timemachine.getSnapshots();
    if (!Array.isArray(snaps) || !snaps.length) return [];
    snaps = snaps.slice().sort((a, b) => a.timestamp - b.timestamp);
    if (rangeDays != null) {
      const cutoff = Date.now() - rangeDays * 864e5;
      snaps = snaps.filter((s) => s.timestamp >= cutoff);
    }
    return snaps
      .map((s) => {
        const v = s?.totals?.totalValue;
        return typeof v === "number" && Number.isFinite(v)
          ? { t: s.timestamp, y: v }
          : null;
      })
      .filter(Boolean);
  }

  function formatChartDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function drawPerformanceChart(view) {
    const canvas = view.querySelector("#d-perf-chart");
    const note = view.querySelector("#d-perf-note");
    const rangeEl = view.querySelector("#d-perf-range");
    if (!canvas) return;
    destroyPerfChart(view);

    const active = rangeEl?.querySelector(".chip.active");
    const rangeVal = active?.dataset?.range;
    const rangeDays =
      !rangeVal || rangeVal === "all"
        ? null
        : Number.isFinite(Number(rangeVal))
          ? Number(rangeVal)
          : null;
    const series = snapshotsToSeries(rangeDays);

    if (series.length < 2) {
      if (note)
        note.textContent =
          series.length === 0
            ? "No portfolio snapshots yet — history builds as you use Weaver."
            : "Only one snapshot captured so far. Check back after the next refresh cycle.";
      const w = (canvas.width = canvas.clientWidth || 400),
        h = (canvas.height = 180),
        ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - 1);
      ctx.lineTo(w, h - 1);
      ctx.stroke();
      return;
    }
    if (note) note.textContent = "";
    if (typeof Chart !== "function") {
      if (note) note.textContent = "Chart library unavailable.";
      return;
    }

    view._dashboardPerfChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: series.map((p) => formatChartDate(p.t)),
        datasets: [
          {
            label: "Portfolio value",
            data: series.map((p) => p.y),
            borderColor: "#6366f1",
            backgroundColor: (context) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 300);
              gradient.addColorStop(0, "rgba(99, 102, 241, 0.25)");
              gradient.addColorStop(1, "rgba(99, 102, 241, 0.0)");
              return gradient;
            },
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: "#6366f1",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => {
                const v = c.parsed?.y;
                return Number.isFinite(v) ? W.fmt.money(v) : "—";
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#8b94a7", maxRotation: 0, autoSkip: true },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: {
              color: "#8b94a7",
              callback: (v) => W.fmt.money(v, { compact: true }),
            },
          },
        },
      },
    });
  }

  // ── Allocation (priced rows only — §6.3) ─────────────────────
  const ALLOCATION_TOP_N = 5;
  function renderAllocation(container, rows, totals) {
    if (!container) return;
    const priced = rows.filter((r) => r.value !== null && r.value > 0);
    if (!priced.length || !totals || !totals.value) {
      container.innerHTML =
        '<p class="text-muted small-text">Add holdings to see allocation.</p>';
      return;
    }
    const total = totals.value;
    const sorted = priced.slice().sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, ALLOCATION_TOP_N);
    const restSum = sorted
      .slice(ALLOCATION_TOP_N)
      .reduce((s, r) => s + r.value, 0);
    const bucket = (pct) =>
      Math.max(0, Math.min(100, Math.round(pct / 10) * 10));
    const rowHtml = (label, pct, extraClass) => {
      const b = bucket(pct);
      const klass = extraClass ? ` meter-fill-${extraClass}` : "";
      return `<div class="kv-row"><span>${label}</span><span>${pct.toFixed(1)}%</span></div><div class="meter-bar"><div class="meter-fill meter-fill-${b}${klass}"></div></div>`;
    };
    const parts = top.map((r) =>
      rowHtml(
        `<b>${W.fmt.escapeHTML(String(r.symbol || "?").toUpperCase())}</b>`,
        (r.value / total) * 100,
        null,
      ),
    );
    if (restSum > 0) {
      const restCount = sorted.length - ALLOCATION_TOP_N;
      parts.push(
        rowHtml(
          `<span class="muted">Others (${restCount})</span>`,
          (restSum / total) * 100,
          "muted",
        ),
      );
    }
    container.innerHTML = parts.join("");
  }

  // ── Main render ──────────────────────────────────────────────
  async function render(view) {
    destroyPerfChart(view);

    view.innerHTML = `
      <p class="muted small mb-16">Your evidence-driven crypto intelligence workspace.</p>
      <div id="d-data-health" aria-live="polite"></div>
      <div class="cards" id="d-stats">${skel.stats(3)}</div>
      <div class="cards" id="d-market-tiles">${skel.stats(3)}</div>

      <div class="card mt-16">
        <div class="flex-between mb-8">
          <h3>💼 Your Portfolio</h3>
          <div class="qa">
            <a href="#/token" class="btn tiny">🔍 Analyze</a>
            <button class="btn tiny" id="qa-add">+ Add Holding</button>
            <button class="btn tiny" id="qa-sync" title="Manage synced wallets">👛 Sync Wallets</button>
          </div>
        </div>
        <div id="d-port">${skel.card()}</div>
      </div>

      <div class="card mt-16">
        <div class="flex-between mb-8">
          <h3>📈 Portfolio Performance</h3>
          <div class="qa" id="d-perf-range">
            <button class="chip active" data-range="7">1W</button>
            <button class="chip" data-range="30">1M</button>
            <button class="chip" data-range="90">3M</button>
            <button class="chip" data-range="365">1Y</button>
            <button class="chip" data-range="all">ALL</button>
          </div>
        </div>
        <div class="chart-box">${skel.chart()}</div>
        <p class="muted small mt-8" id="d-perf-note"></p>
      </div>

      <div class="card mt-16">
        <div class="flex-between mb-8">
          <h3>🥧 Allocation</h3>
          <span class="muted small" id="d-alloc-total"></span>
        </div>
        <div id="d-alloc-body">${skel.card()}</div>
      </div>

      <div class="grid-2 mt-16">
        <div id="what-matters-now-container" class="intelligence-feed card">${skel.feed(3)}</div>
        <div id="what-changed-container"><div class="card">${skel.card()}</div></div>
      </div>

      <div class="card mt-16">
        <div class="flex-between mb-8">
          <h3>🌐 Market Context</h3>
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
            <tbody id="d-rows"><tr><td colspan="5" class="p-24">${skel.table(5)}</td></tr></tbody>
          </table>
        </div>
        <div id="d-market-more"></div>
      </div>
    `;

    view.querySelector("#qa-add").onclick = () => holdingModal();
    const syncBtn = view.querySelector("#qa-sync");
    if (syncBtn)
      syncBtn.onclick = () => {
        if (W.walletSync?.render) location.hash = "#/walletsync";
        else W.ui.toast("Wallet sync module not available", "warn");
      };

    const perfRangeEl = view.querySelector("#d-perf-range");
    if (perfRangeEl) {
      perfRangeEl.querySelectorAll("[data-range]").forEach((b) => {
        b.onclick = () => {
          perfRangeEl
            .querySelectorAll("[data-range]")
            .forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          drawPerformanceChart(view);
        };
      });
    }
    drawPerformanceChart(view);

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
    const fg =
      fgR.status === "fulfilled" && fgR.value && fgR.value.value != null
        ? fgR.value
        : null;

    const healthEl = view.querySelector("#d-data-health");
    if (healthEl && W.ui.renderDataStatus)
      W.ui.renderDataStatus(healthEl, [
        "markets",
        "global-market",
        "fear-greed",
      ]);

    // Honest stat cards: never collapse to $0.00 on fetch failure (§6.3)
    const statsEl = view.querySelector("#d-stats");
    if (statsEl) {
      const balanceSub = totals
        ? `${rows.length} assets · ${totals.priced} priced${totals.unpriced ? ` · ${totals.unpriced} unavailable` : ""}`
        : "Add holdings to get started";
      statsEl.innerHTML = `
        ${totals ? statCard("Total Balance", totals.priced ? W.fmt.money(totals.value) : "—", balanceSub) : statCard("Total Balance", "—", "Add holdings to get started")}
        ${totals && totals.allTime !== null ? statCard("P/L · All Time", signedMoney(totals.allTime), W.fmt.pct(totals.allTimePct)) : totals ? statCard("P/L · All Time", "—", `${totals.unknownCost} assets missing cost basis`) : ""}
        ${totals ? statCard("P/L · 24h", signedMoney(totals.day), totals.dayPct !== null ? W.fmt.pct(totals.dayPct) : "—") : ""}
        ${g ? statCard("Global Market Cap", W.fmt.money(g.total_market_cap[W.currency()], { compact: true }), W.fmt.pct(g.market_cap_change_percentage_24h_usd)) : ""}
      `;
    }

    const tilesEl = view.querySelector("#d-market-tiles");
    if (tilesEl) {
      let regimeTile = statCard("Market Regime", "—", "Engine not loaded");
      if (g && fg && W.regime?.detect) {
        try {
          const rd = W.regime.detect({
            fearGreed: fg.value,
            btcDominance: g.market_cap_percentage?.btc,
            capChange: g.market_cap_change_percentage_24h_usd,
          });
          const conf =
            Number.isFinite(rd.confidence) && rd.confidence > 0
              ? `${(rd.confidence * 100).toFixed(0)}% confidence`
              : "Confidence unavailable";
          regimeTile = statCard("Market Regime", rd.regime || "UNKNOWN", conf);
        } catch (e) {
          regimeTile = statCard("Market Regime", "—", "Detection failed");
        }
      }
      const fgTile = fg
        ? statCard(
            "Fear & Greed",
            `${fg.value}`,
            fg.value_classification || "Unclassified",
          )
        : statCard("Fear & Greed", "—", "Source unavailable");
      const btcTile = g
        ? statCard(
            "BTC Dominance",
            `${Number(g.market_cap_percentage?.btc ?? 0).toFixed(1)}%`,
            g.market_cap_change_percentage_24h_usd != null
              ? W.fmt.pct(g.market_cap_change_percentage_24h_usd) +
                  " cap change 24h"
              : "24h change unavailable",
          )
        : statCard("BTC Dominance", "—", "Source unavailable");
      tilesEl.innerHTML = regimeTile + fgTile + btcTile;
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

      const fullCount = list.length;
      const visibleList = marketRowsExpanded
        ? list
        : list.slice(0, MARKET_ROWS_DEFAULT);
      const rowsEl = view.querySelector("#d-rows");
      if (rowsEl) {
        rowsEl.innerHTML = visibleList.length
          ? visibleList
              .map(termRow)
              .filter((r) => r !== "")
              .join("")
          : '<tr><td colspan="5" class="text-center text-muted p-24">No data available.</td></tr>';
        rowsEl
          .querySelectorAll("tr[data-coin]")
          .forEach(
            (tr) =>
              (tr.onclick = () =>
                (location.hash = "#/coin/" + tr.dataset.coin)),
          );
        rowsEl.querySelectorAll("canvas.spark").forEach(drawSpark);
      }
      const moreEl = view.querySelector("#d-market-more");
      if (moreEl) {
        if (fullCount > MARKET_ROWS_DEFAULT) {
          moreEl.innerHTML = marketRowsExpanded
            ? '<button class="btn tiny" id="d-market-toggle">Show fewer</button>'
            : `<button class="btn tiny" id="d-market-toggle">Show all ${fullCount} tokens</button>`;
          moreEl.querySelector("#d-market-toggle").onclick = () => {
            marketRowsExpanded = !marketRowsExpanded;
            drawRows();
          };
        } else {
          moreEl.innerHTML = "";
        }
      }
    };
    view.querySelectorAll("[data-tab]").forEach((c) => {
      c.onclick = () => {
        view
          .querySelectorAll("[data-tab]")
          .forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        tab = c.dataset.tab;
        marketRowsExpanded = false;
        drawRows();
      };
    });
    drawRows();

    const port = view.querySelector("#d-port");
    if (port) {
      if (!rows.length)
        port.innerHTML =
          '<p class="text-muted small-text text-center p-24">No holdings yet. Click "+ Add Holding" above, or Sync Wallets.</p>';
      else {
        port.innerHTML = holdingsTable(rows);
        wireRows(port, rows);
      }
    }

    const allocBody = view.querySelector("#d-alloc-body");
    const allocTotal = view.querySelector("#d-alloc-total");
    if (allocTotal)
      allocTotal.textContent =
        totals && totals.value ? W.fmt.money(totals.value) : "";
    renderAllocation(allocBody, rows, totals);
    drawPerformanceChart(view);

    // Intelligence Feed ("What Matters Now")
    const rankerContainer = view.querySelector("#what-matters-now-container");
    if (rankerContainer) {
      if (W.decisionEngine && W.intelligenceFeed) {
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
            W.intelligenceFeed.render(rankerContainer, decisions);
          })
          .catch(() => {
            rankerContainer.innerHTML =
              '<p class="text-muted small p-16">Intelligence feed temporarily unavailable.</p>';
          });
      } else {
        rankerContainer.innerHTML =
          '<p class="text-muted small p-16">Intelligence engine loading...</p>';
      }
    }

    // Discoveries + portfolio deltas
    const changedContainer = view.querySelector("#what-changed-container");
    if (changedContainer) {
      const gemTheses = (W.theses?.all?.() || [])
        .filter((t) => t.sourceRef?.type === "gem")
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 3);

      const discoveriesHTML = gemTheses.length
        ? `<ul class="discovery-list">${gemTheses
            .map(
              (t) => `
            <li class="discovery-item">
              <div class="discovery-head">
                <b>${W.fmt.escapeHTML(t.asset)}</b>
                <span class="muted small">${W.fmt.escapeHTML(t.signals || "Security status unavailable")}</span>
              </div>
              ${t.reasons ? `<p class="muted small mt-4">${W.fmt.escapeHTML(t.reasons)}</p>` : ""}
            </li>`,
            )
            .join("")}</ul>`
        : `<p class="muted small">No new discoveries yet — run Gem Agent to populate this.</p>`;

      const deltasHTML =
        totals && W.delta
          ? (() => {
              const deltas = W.delta.computePortfolioDeltas(totals);
              const container = document.createElement("div");
              W.delta.renderList(container, deltas);
              return container.innerHTML;
            })()
          : `<p class="muted small">Add holdings to your portfolio to start tracking value changes over time.</p>`;

      changedContainer.innerHTML = `
        <div class="card">
          <h3>🔍 Discoveries</h3>
          <p class="muted small mb-8 mt-8">New intelligence</p>
          ${discoveriesHTML}
          <p class="muted small mb-8 mt-16">Portfolio changes</p>
          <div class="delta-container">${deltasHTML}</div>
        </div>
      `;

      // §6.4: never record a snapshot while any asset is unpriced —
      // a failed price run must not become a fake "-100%" crash in history.
      if (totals && W.delta && totals.unpriced === 0) {
        const currentSnapshot = W.delta.getSnapshot();
        if (
          !currentSnapshot ||
          Date.now() - currentSnapshot.timestamp > 3600000
        )
          W.delta.saveSnapshot(totals);
      }
    }
  }

  function renderPortfolio(view) {
    const has = W.portfolio ? W.portfolio.all().length > 0 : false;
    view.innerHTML = `<div class="card"><div class="flex-between mb-8"><h3>💼 Holdings</h3><div class="qa"><button class="btn primary" id="p-add">+ Add Holding</button></div></div><div id="p-body">${has ? skel.card() : '<p class="text-muted">No holdings yet.</p>'}</div></div>`;
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

console.log(
  "[Dashboard] Module loaded (Command Center UI, honest data semantics, stale-price cache).",
);
