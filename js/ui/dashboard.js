// ===============================================================
//                Weaver Dashboard 
// ===============================================================

window.W = window.W || {};

W.dashboard = (() => {
  const MODULE_VERSION = "dashboard-v3.4";
  const MARKET_ROWS_DEFAULT = 10;
  let marketRowsExpanded = false;

  // ── Last-known-good price cache (§3.6, §3.4) ─────────────────
  const PRICE_CACHE_KEY = "last_known_prices";
  const readPriceCache = () => W.store.get(PRICE_CACHE_KEY, {});

  // Safe fallback if skeleton module isn't loaded yet
  const skel = (W.ui && W.ui.skeleton) || {
    stats: (n) => Array(n).fill('<div class="spinner"></div>').join(""),
    card: () => '<div class="spinner"></div>',
    chart: () => '<div class="spinner"></div>',
    feed: (n) => Array(n).fill('<div class="spinner"></div>').join(""),
    table: (n) => Array(n).fill('<div class="spinner"></div>').join(""),
  };

  // ── Escaping helper ─────────────────────────────────────────
  const esc =
    (W.fmt && W.fmt.escapeHTML) ||
    function (v) {
      if (v == null) return "";
      return String(v).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    };

  const signedMoney = (n) => {
    if (n == null || isNaN(n)) return "—";
    const isUp = n >= 0;
    const cls = isUp ? "up" : "down";
    return `<span class="${cls}">${isUp ? "+" : "-"}${W.fmt.money(Math.abs(n))}</span>`;
  };

  // ── Tape (market strip) ─────────────────────────────────────
  const tapeHTML = (coins) => {
    if (!coins || !Array.isArray(coins) || !coins.length) {
      return '<div class="tape-wrap"><div class="tape"><span class="tape-item text-muted">Loading market data…</span></div></div>';
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
      tapeItems += `<span class="tape-item"><b>${esc(symbol)}</b><span class="text-muted">${W.fmt.price(price)}</span>${W.fmt.pct(change)}</span>`;
      validCount++;
      if (validCount >= 20) break;
    }
    if (!tapeItems)
      return '<div class="tape-wrap"><div class="tape"><span class="tape-item text-muted">No market data available</span></div></div>';
    return `<div class="tape-wrap"><div class="tape">${tapeItems + tapeItems}</div></div>`;
  };

  // ── Chart colors ────────────────────────────────────────────
  const CHART_COLORS = [
    "#10b981",
    "#6366f1",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#ec4899",
    "#84cc16",
  ];

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  // ── Sparkline (canvas) — used only where real series data exists ──
  function drawSpark(c) {
    const vals = (c.dataset.spark || "")
      .split(",")
      .map(Number)
      .filter((v) => !isNaN(v));
    if (vals.length < 2) return;
    const w = (c.width = 110),
      h = (c.height = 30),
      ctx = c.getContext("2d");
    if (!ctx) return;
    const min = Math.min(...vals),
      max = Math.max(...vals),
      up = c.dataset.up === "1";
    const colorUp = cssVar("--up", "#10b981");
    const colorDown = cssVar("--down", "#ef4444");
    const strokeColor = up ? colorUp : colorDown;
    const fillColor = up
      ? "rgba(16, 185, 129, 0.12)"
      : "rgba(239, 68, 68, 0.12)";

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = strokeColor;
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
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  const sparkCell = (arr, up) =>
    arr && arr.length
      ? `<canvas class="spark" data-up="${up ? 1 : 0}" data-spark="${arr
          .filter((_, i) => i % 6 === 0)
          .map((v) => v.toFixed(4))
          .join(",")}"></canvas>`
      : '<span class="text-muted small-text">—</span>';

  // ── Logo or letter avatar ───────────────────────────────────
  //
  // CoinLore, CoinBase, and CoinPaprika all return image: "" — none
  // of them publish logo URLs. W.api maintains a static LOGO_MAP for
  // the twenty-six tokens the app displays most often; the letter
  // avatar covers every other token and acts as a runtime fallback
  // if the CDN image fails to load.
  //
  // The avatar is deterministic: a symbol always maps to the same
  // colour slot (hash of the symbol modulo ten). The palette lives
  // in style.css section 25 (.token-avatar-slot-0 through
  // .token-avatar-slot-9). No inline style attributes.
  function avatarSlot(sym) {
    let hash = 0;
    for (let i = 0; i < sym.length; i++) {
      hash = (hash * 31 + sym.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 10;
  }

  // Restrict image URLs to the CoinGecko CDN. A hostile value from
  // any provider cannot inject a javascript: or data: URL into an
  // img src through this helper.
  function safeImageUrl(u) {
    if (typeof u !== "string" || !u) return null;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:") return null;
      if (!parsed.hostname.endsWith("coingecko.com")) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // ── Shared avatar markup ────────────────────────────────────
  // Prefers a real logo when the provider supplied one. Falls back
  // to the letter monogram when the map has no entry for this
  // symbol, when the URL fails validation, or when the image fails
  // to load at runtime (wireAvatarFallbacks handles the last case).
  function avatarMarkup(symbol, imageUrl, extraClass) {
    const sym = String(symbol || "?").toUpperCase();
    const slot = avatarSlot(sym);
    const initials = sym.slice(0, 3);
    const cls = extraClass ? ` ${extraClass}` : "";

    const safe = safeImageUrl(imageUrl);
    if (!safe) {
      return `<span class="token-avatar token-avatar-slot-${slot}${cls}" aria-hidden="true"><span class="token-avatar-text">${esc(initials)}</span></span>`;
    }

    return `<img class="token-avatar-img${cls}" src="${esc(safe)}" alt="" loading="lazy" decoding="async" width="32" height="32" data-fallback-symbol="${esc(sym)}">`;
  }

  // ── Runtime fallback for failed images ─────────────────────
  // The <img> above carries data-fallback-symbol. This pass runs
  // after a table renders and swaps any image that failed to load
  // with the equivalent letter avatar. Uses
  // addEventListener('error') rather than an inline onerror=
  // attribute so the strict CSP remains unaffected.
  function wireAvatarFallbacks(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll("img[data-fallback-symbol]").forEach((img) => {
      const swap = () => {
        const sym = img.dataset.fallbackSymbol || "?";
        const slot = avatarSlot(sym);
        const span = document.createElement("span");
        span.className = `token-avatar token-avatar-slot-${slot}`;
        span.setAttribute("aria-hidden", "true");
        const inner = document.createElement("span");
        inner.className = "token-avatar-text";
        inner.textContent = sym.slice(0, 3);
        span.appendChild(inner);
        if (img.parentNode) img.parentNode.replaceChild(span, img);
      };
      // The browser may have already fired error before this pass
      // ran. complete && naturalWidth === 0 identifies that case.
      if (img.complete && img.naturalWidth === 0) {
        swap();
      } else {
        img.addEventListener("error", swap, { once: true });
      }
    });
  }

  // ── Top-tokens row ──────────────────────────────────────────
  //
  // Five columns: rank, identity, price, 24h change, market cap.
  //
  // The previous version rendered a sixth column labelled
  // "Confidence" whose value was computed as `100 - i * 6` — a
  // positional index with no connection to any measurement. That
  // was fabricated data on live market prices, and the most
  // dangerous kind because it looked plausible. Removed in v3.1.
  const tokenRow = (c, i) => {
    if (!c || typeof c !== "object") return "";
    const id = c.id || "unknown";
    const name = c.name || "Unknown";
    const symbol = c.symbol ? String(c.symbol).toUpperCase() : "???";
    const price = Number.isFinite(c.current_price)
      ? c.current_price
      : Number.isFinite(c.price)
        ? c.price
        : null;
    const p24 = Number.isFinite(c.price_change_percentage_24h_in_currency)
      ? c.price_change_percentage_24h_in_currency
      : null;
    const mcap = Number.isFinite(c.market_cap) ? c.market_cap : null;
    const changeCls = p24 === null ? "" : p24 >= 0 ? "up" : "down";
    const priceText =
      price === null
        ? "—"
        : price >= 1
          ? "$" + price.toFixed(2)
          : "$" + price.toFixed(6);
    const changeText = p24 === null ? "—" : W.fmt.pct(p24);
    const mcapText =
      mcap === null
        ? "—"
        : "$" +
          (mcap >= 1e9
            ? (mcap / 1e9).toFixed(2) + "B"
            : (mcap / 1e6).toFixed(2) + "M");

    return `
      <button type="button" class="token-row" data-coin="${esc(id)}">
        <span class="token-rank">${esc(i + 1)}</span>
        <span class="token-ident">
          ${avatarMarkup(symbol, c.image)}
          <span class="token-ident-text">
            <span class="token-symbol">${esc(symbol)}</span>
            <span class="token-name">${esc(name)}</span>
          </span>
        </span>
        <span class="token-price">${esc(priceText)}</span>
        <span class="token-change ${changeCls}">${esc(changeText)}</span>
        <span class="token-mcap">${esc(mcapText)}</span>
      </button>
    `;
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

  // ── Holdings table ──────────────────────────────────────────
  //
  // Uses the same logo-or-avatar treatment as Top Tokens. The
  // previous version rendered <img src=""> (broken placeholder)
  // when no image was available. v3.3 replaced that with the shared
  // avatarMarkup helper; v3.4 extends it to prefer real logos.
  //
  // Two smaller changes from v3.2: the 24h cell now carries
  // up/down colour, and the P/L cell shows "Set cost basis" rather
  // than a passive "—" when the cost basis is genuinely unknown.
  const holdingsTable = (rows) => `
    <div class="table-wrap"><table><thead><tr><th>Asset</th><th>Price</th><th>24h</th><th>Qty</th><th>Value</th><th>P/L</th><th></th></tr></thead><tbody>
      ${rows
        .map((r, i) => {
          const sym = String(r.symbol || "?").toUpperCase();
          const p24Cls = r.p24 === null ? "" : r.p24 >= 0 ? "up" : "down";
          const pnlCell =
            r.pnl !== null
              ? signedMoney(r.pnl) +
                '<div class="small-text">' +
                W.fmt.pct(r.pnlPct) +
                "</div>"
              : `<span class="text-muted small-text cost-basis-hint" title="Click the pencil to enter the total amount paid">Set cost basis</span>`;
          return `<tr>
        <td class="coin-cell">
          ${avatarMarkup(sym, r.image, "coin-img")}
          <div><b>${esc(r.name)}</b><br><span class="text-muted small-text">${esc(sym)}</span></div>
        </td>
        <td class="num">${r.price !== null ? W.fmt.price(r.price) + (r.priceStale ? ' <span class="text-muted small-text">·stale</span>' : "") : '<span class="text-muted">—</span>'}</td>
        <td class="num ${p24Cls}">${r.p24 !== null ? W.fmt.pct(r.p24) : '<span class="text-muted">—</span>'}</td>
        <td class="num">${r.qty}</td>
        <td class="num">${r.value !== null ? `<b>${W.fmt.money(r.value)}</b>` : '<span class="text-muted">—</span>'}</td>
        <td class="num">${pnlCell}</td>
        <td class="row-actions">${
          r.wallet
            ? `<span class="tag rank">wallet</span> <button class="icon-btn" data-basis="${i}" title="Set cost basis">✎</button>`
            : `<button class="icon-btn" data-edit="${esc(r.id)}" title="Edit">✎</button><button class="icon-btn" data-del="${esc(r.id)}" title="Remove">✕</button>`
        }</td>
      </tr>`;
        })
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
          W.ui.confirm(`Remove <b>${esc(r.name)}</b>?`, () => {
            if (W.portfolio && W.portfolio.remove) W.portfolio.remove(r.id);
            W.ui.toast("Holding removed", "ok");
            W.refresh();
          });
    });
  }

  // ── Manual Cost Basis Modal (wallet holdings) ───────────────
  function basisModal(r) {
    const existing = r.manualCostBasis;
    const m = W.ui.modal({
      title: `Cost basis — ${esc(r.symbol)}`,
      body: `<p class="text-muted small-text">Wallet sync cannot know your purchase history. Enter the <b>total amount paid</b> for this position so P/L is truthful. Leave empty to keep P/L unknown.</p>
        <label>Total cost (${esc(W.currency().toUpperCase())})<input type="number" step="any" min="0" id="b-cost" value="${existing ? existing.totalCost : ""}" placeholder="e.g. 500"></label>`,
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
      ? `<p class="text-muted small-text">Coin: <b>${esc(existing.name)} (${esc(existing.symbol.toUpperCase())})</b></p>`
      : preselect
        ? `<p class="text-muted small-text">Coin: <b>${esc(preselect.name)} (${esc(preselect.symbol.toUpperCase())})</b></p>`
        : `<div id="picker"></div>`;
    const m = W.ui.modal({
      title: existing ? `Edit ${esc(existing.name)}` : "Add Holding",
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
      W.ui.toast(existing ? "Holding updated" : "Holding added", "ok");
      W.refresh();
    };
  }

  // ── Chart lifecycle ────────────────────────────────────────
  function destroyCharts(view) {
    if (!view) return;
    for (const k of ["_dashboardPerfChart", "_dashboardDonut"]) {
      if (view[k]) {
        try {
          view[k].destroy();
        } catch (_) {}
        view[k] = null;
      }
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
    if (view._dashboardPerfChart) {
      try {
        view._dashboardPerfChart.destroy();
      } catch (_) {}
      view._dashboardPerfChart = null;
    }

    const active = rangeEl?.querySelector(".dash-range-btn.active");
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
      const wrap = canvas.parentElement;
      if (wrap) {
        const w = (canvas.width = wrap.clientWidth || 400);
        const h = (canvas.height = wrap.clientHeight || 220);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, h - 1);
          ctx.lineTo(w, h - 1);
          ctx.stroke();
        }
      }
      return;
    }
    if (note) note.textContent = "";
    if (typeof Chart !== "function") {
      if (note) note.textContent = "Chart library unavailable.";
      return;
    }

    const isUp = series[series.length - 1].y >= series[0].y;
    const colorLine = isUp
      ? cssVar("--up", "#10b981")
      : cssVar("--down", "#ef4444");
    const fillTop = isUp
      ? "rgba(16, 185, 129, 0.25)"
      : "rgba(239, 68, 68, 0.25)";
    const fillBottom = isUp ? "rgba(16, 185, 129, 0)" : "rgba(239, 68, 68, 0)";

    view._dashboardPerfChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: series.map((p) => formatChartDate(p.t)),
        datasets: [
          {
            label: "Portfolio value",
            data: series.map((p) => p.y),
            borderColor: colorLine,
            backgroundColor: (context) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 300);
              gradient.addColorStop(0, fillTop);
              gradient.addColorStop(1, fillBottom);
              return gradient;
            },
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: colorLine,
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
            ticks: {
              color: "#8b94a7",
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
            },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: {
              color: "#8b94a7",
              font: { size: 10 },
              callback: (v) => W.fmt.money(v, { compact: true }),
            },
          },
        },
      },
    });
  }

  // ── Allocation donut ───────────────────────────────────────
  const ALLOCATION_TOP_N = 5;

  function buildAllocation(rows, totals) {
    const priced = rows.filter((r) => r.value !== null && r.value > 0);
    if (!priced.length || !totals || !totals.value) return null;
    const total = totals.value;
    const sorted = priced.slice().sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, ALLOCATION_TOP_N);
    const restSum = sorted
      .slice(ALLOCATION_TOP_N)
      .reduce((s, r) => s + r.value, 0);

    const segments = top.map((r, i) => ({
      symbol: String(r.symbol || "?").toUpperCase(),
      value: r.value,
      pct: (r.value / total) * 100,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
    if (restSum > 0) {
      segments.push({
        symbol: "Others",
        value: restSum,
        pct: (restSum / total) * 100,
        color: CHART_COLORS[segments.length % CHART_COLORS.length],
      });
    }
    return { segments, total };
  }

  function drawAllocationDonut(view, alloc) {
    const canvas = view.querySelector("#d-donut");
    const totalEl = view.querySelector("#d-donut-total");
    const legend = view.querySelector("#d-legend");
    if (!canvas) return;
    if (view._dashboardDonut) {
      try {
        view._dashboardDonut.destroy();
      } catch (_) {}
      view._dashboardDonut = null;
    }

    if (!alloc) {
      if (totalEl) totalEl.textContent = "—";
      if (legend)
        legend.innerHTML =
          '<p class="text-muted small-text">Add priced holdings to see allocation.</p>';
      return;
    }

    if (totalEl) totalEl.textContent = W.fmt.money(alloc.total);
    if (legend) {
      legend.innerHTML = alloc.segments
        .map(
          (s) => `
            <div class="dash-legend-row">
              <span class="dash-legend-dot" data-color="${esc(s.color)}"></span>
              <span class="dash-legend-label">${esc(s.symbol)}</span>
              <span class="dash-legend-pct">${s.pct.toFixed(1)}%</span>
            </div>
          `,
        )
        .join("");
      // Colour assigned via CSSOM, not an inline style attribute.
      legend.querySelectorAll(".dash-legend-dot").forEach((el) => {
        const c = el.dataset.color;
        if (c) el.style.background = c;
      });
    }

    if (typeof Chart !== "function") return;
    view._dashboardDonut = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: alloc.segments.map((s) => s.symbol),
        datasets: [
          {
            data: alloc.segments.map((s) => s.value),
            backgroundColor: alloc.segments.map((s) => s.color),
            borderWidth: 0,
            spacing: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `${c.label}: ${W.fmt.money(c.parsed)}`,
            },
          },
        },
      },
    });
  }

  // ── Fear & Greed gauge ─────────────────────────────────────
  function renderFearGreed(fg) {
    const value = Number(fg?.value);
    if (!Number.isFinite(value)) {
      return `<p class="muted small p-16">Sentiment data unavailable.</p>`;
    }
    const label = String(fg.value_classification || "Neutral");
    const angle = (value / 100) * 180;
    const rad = (angle - 90) * (Math.PI / 180);
    const cx = 100;
    const cy = 90;
    const r = 70;
    const nx = cx + r * Math.cos(rad);
    const ny = cy + r * Math.sin(rad);

    return `
      <div class="fg-card">
        <svg class="fg-gauge" viewBox="0 0 200 110" aria-label="Fear and Greed Index">
          <defs>
            <linearGradient id="fgGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stop-color="#ef4444" />
              <stop offset="50%"  stop-color="#f59e0b" />
              <stop offset="100%" stop-color="#10b981" />
            </linearGradient>
          </defs>
          <path d="M 30 90 A 70 70 0 0 1 170 90" fill="none"
                stroke="url(#fgGradient)" stroke-width="12" stroke-linecap="round" />
          <line x1="${cx}" y1="${cy}"
                x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}"
                stroke="#eef1f9" stroke-width="3" stroke-linecap="round" />
          <circle cx="${cx}" cy="${cy}" r="5" fill="#eef1f9" />
        </svg>
        <div class="fg-value">${Math.round(value)}</div>
        <div class="fg-label">${esc(label)}</div>
        <div class="fg-timestamp">Updated ${esc(new Date().toLocaleDateString())}</div>
      </div>
    `;
  }

  // ── BTC dominance card ────────────────────────────────────
  //
  // Removed in v3.1: the SVG sparkline. It was a hardcoded path
  // drawn identically on every page load — a §2.7 fabrication. The
  // current data layer has no historical dominance series. If one is
  // added later, a real sparkline can be restored here.
  function renderDominance(g) {
    const dom = Number(g?.data?.market_cap_percentage?.btc);
    const change = Number(g?.data?.market_cap_change_percentage_24h_usd);
    const domText = Number.isFinite(dom) ? dom.toFixed(1) + "%" : "—";
    const changeCls = !Number.isFinite(change)
      ? "muted"
      : change >= 0
        ? "up"
        : "down";
    const changeText = Number.isFinite(change) ? W.fmt.pct(change) : "—";

    return `
      <div class="dash-card-title">BTC Dominance</div>
      <div class="dom-value">${esc(domText)}</div>
      <div class="dom-delta ${changeCls}">${esc(changeText)} (24h)</div>
      <p class="muted small-text mt-8">Share of total crypto market cap held by BTC.</p>
    `;
  }

  // ── Recent signals list ───────────────────────────────────
  function renderSignals(decisions) {
    if (!Array.isArray(decisions) || !decisions.length) {
      return `<p class="muted small p-16">No recent signals.</p>`;
    }
    const rows = decisions.slice(0, 6);

    return `<div class="dash-signals-list">${rows
      .map((d) => {
        const sym = esc(
          String(d._assetSymbol || d.assetId?.symbol || "—").toUpperCase(),
        );
        const kind = esc(
          String(d._signalTitle || d._signalType || "Signal").slice(0, 64),
        );
        const conf =
          d.assessment && Number.isFinite(d.assessment.confidence)
            ? d.assessment.confidence
            : null;
        const confText = conf === null ? "—" : `${Math.round(conf * 100)}%`;
        const confClass = conf === null ? "muted" : conf >= 0.6 ? "up" : "warn";

        const type = d._signalType || "";
        const isDown =
          type === "THESIS_DETERIORATION" || type === "SECURITY_RISK";
        const iconCls = isDown ? "signal-icon-down" : "signal-icon-up";
        const icon = isDown ? "↓" : "↑";

        const sigId = esc(d.signalId || "");

        return `
          <button type="button" class="signal-row" data-signal-id="${sigId}">
            <span class="signal-icon ${iconCls}" aria-hidden="true">${icon}</span>
            <span class="signal-body">
              <span class="signal-symbol">${sym}</span>
              <span class="signal-kind">${kind}</span>
            </span>
            <span class="signal-meta">
              <span class="signal-confidence ${confClass}">${confText}</span>
            </span>
          </button>
        `;
      })
      .join("")}</div>`;
  }

  // ── Evidence preview ──────────────────────────────────────
  function renderEvidencePreview(decisions) {
    if (!Array.isArray(decisions) || !decisions.length) {
      return `<p class="muted small p-16">No evidence available.</p>`;
    }
    return `<div class="evidence-preview">${decisions
      .slice(0, 4)
      .map((d) => {
        const sym = esc(
          String(d._assetSymbol || d.assetId?.symbol || "—").toUpperCase(),
        );
        const kind = esc(
          String(d._signalTitle || d._signalType || "").slice(0, 48),
        );
        const conf =
          d.assessment && Number.isFinite(d.assessment.confidence)
            ? d.assessment.confidence
            : null;
        const confText =
          conf === null ? "—" : `${Math.round(conf * 100)}% confidence`;
        const isDown = (d._signalType || "") === "THESIS_DETERIORATION";
        const iconCls = isDown ? "signal-icon-down" : "signal-icon-up";
        const icon = isDown ? "↘" : "↗";
        const sigId = esc(d.signalId || "");

        return `
          <button type="button" class="evidence-preview-row" data-signal-id="${sigId}">
            <span class="signal-icon ${iconCls}" aria-hidden="true">${icon}</span>
            <span class="evidence-preview-body">
              <span class="evidence-preview-title">${sym} — ${kind}</span>
              <span class="evidence-preview-sub">Signal: ${confText}</span>
            </span>
            <span class="evidence-preview-arrow" aria-hidden="true">›</span>
          </button>
        `;
      })
      .join("")}</div>`;
  }

  // ── Quick actions ─────────────────────────────────────────
  function renderQuickActions() {
    const actions = [
      { icon: "+", label: "Add Token", route: "/portfolio" },
      { icon: "⟐", label: "Sync Wallet", route: "/walletsync" },
      { icon: "▤", label: "View Portfolio", route: "/portfolio" },
      { icon: "◎", label: "Open Evidence", route: "/signals" },
    ];
    return `<div class="quick-actions">${actions
      .map(
        (a) => `
        <button type="button" class="quick-action" data-route="${esc(a.route)}">
          <span class="quick-action-icon" aria-hidden="true">${esc(a.icon)}</span>
          <span>${esc(a.label)}</span>
        </button>
      `,
      )
      .join("")}</div>`;
  }

  // ── Key insights ──────────────────────────────────────────
  function renderInsights(decisions, fg, rows, totals) {
    const insights = [];

    const strongest = Array.isArray(decisions)
      ? decisions.find(
          (d) => d.assessment && Number.isFinite(d.assessment.confidence),
        )
      : null;
    if (strongest) {
      const sym = String(strongest._assetSymbol || "—").toUpperCase();
      const kind = String(strongest._signalType || "signal").replace(/_/g, " ");
      const conf = Math.round((strongest.assessment.confidence || 0) * 100);
      insights.push({
        icon: "↗",
        iconCls: "insight-icon-up",
        title: `${sym} signal detected`,
        text: `A ${kind.toLowerCase()} with ${conf}% confidence was detected. Review the evidence before deciding.`,
        signalId: strongest.signalId,
      });
    }

    if (fg && Number.isFinite(Number(fg.value))) {
      const v = Number(fg.value);
      const interpretation =
        v >= 55
          ? "Sentiment is elevated — historical reversions often follow."
          : v <= 45
            ? "Sentiment is defensive — historically a capitulation zone."
            : "Sentiment is neutral — a wait-and-see stance is reasonable.";
      insights.push({
        icon: "i",
        iconCls: "",
        title: "Market Sentiment",
        text: `Fear & Greed is at ${Math.round(v)} (${esc(fg.value_classification || "Neutral")}). ${interpretation}`,
        route: "/market",
      });
    }

    if (Array.isArray(rows) && rows.length && totals && totals.value > 0) {
      const top = rows
        .filter((r) => r.value !== null && r.value > 0)
        .sort((a, b) => b.value - a.value)[0];
      if (top) {
        const weight = (top.value / totals.value) * 100;
        if (weight >= 50) {
          insights.push({
            icon: "⚠",
            iconCls: "insight-icon-warn",
            title: "Concentration risk",
            text: `${String(top.symbol || "?").toUpperCase()} is ${weight.toFixed(0)}% of your portfolio. Consider whether this matches your risk tolerance.`,
            route: "/portfolio",
          });
        }
      }
    }

    if (!insights.length) {
      return `<p class="muted small p-16">No insights to surface right now.</p>`;
    }
    return insights
      .slice(0, 3)
      .map((i) => {
        const dataAttr = i.signalId
          ? `data-signal-id="${esc(i.signalId)}"`
          : `data-route="${esc(i.route || "/dashboard")}"`;
        return `
          <div class="insight-card">
            <div class="insight-icon ${esc(i.iconCls || "")}" aria-hidden="true">${esc(i.icon)}</div>
            <div class="insight-body">
              <div class="insight-title">${esc(i.title)}</div>
              <div class="insight-text">${esc(i.text)}</div>
              <button type="button" class="insight-link" ${dataAttr}>View details →</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ── KPI strip ─────────────────────────────────────────────
  function renderKpiStrip(decisions, totals) {
    const signalCount = Array.isArray(decisions) ? decisions.length : 0;

    let high = 0,
      mid = 0,
      low = 0;
    if (Array.isArray(decisions)) {
      for (const d of decisions) {
        const c = d.assessment?.confidence;
        if (c == null) continue;
        if (c >= 0.7) high++;
        else if (c >= 0.4) mid++;
        else low++;
      }
    }

    let aggConf = null;
    if (Array.isArray(decisions)) {
      const priced = decisions
        .map((d) => d.assessment?.confidence)
        .filter((c) => Number.isFinite(c));
      if (priced.length) {
        aggConf = priced.reduce((s, c) => s + c, 0) / priced.length;
      }
    }

    const totalValue = totals ? totals.value : null;
    const allTimePnl = totals ? totals.allTime : null;
    const allTimePct = totals ? totals.allTimePct : null;
    const dayPnl = totals ? totals.day : null;
    const dayPct = totals ? totals.dayPct : null;

    const valueDisplay =
      totalValue !== null && totals.priced > 0 ? W.fmt.money(totalValue) : "—";
    const pnlDisplay = allTimePnl !== null ? signedMoney(allTimePnl) : "—";
    const pnlDelta = allTimePct !== null ? W.fmt.pct(allTimePct) : "—";
    const pnlDeltaCls =
      allTimePnl === null ? "muted" : allTimePnl >= 0 ? "up" : "down";

    const dayDelta = dayPct !== null ? W.fmt.pct(dayPct) : "—";
    const dayDeltaCls = dayPnl === null ? "muted" : dayPnl >= 0 ? "up" : "down";

    const confDisplay =
      aggConf === null ? "Unavailable" : `${Math.round(aggConf * 100)}%`;
    const confDeltaCls =
      aggConf === null ? "muted" : aggConf >= 0.6 ? "up" : "warn";

    return `
      <div class="kpi">
        <div class="kpi-icon kpi-icon-up" aria-hidden="true">▤</div>
        <div class="kpi-body">
          <div class="kpi-label">Total Portfolio Value</div>
          <div class="kpi-value">${esc(valueDisplay)}</div>
          <div class="kpi-delta ${dayDeltaCls}">${esc(dayDelta)} (24h)</div>
        </div>
      </div>
      <div class="kpi">
        <div class="kpi-icon ${allTimePnl === null ? "" : allTimePnl >= 0 ? "kpi-icon-up" : "kpi-icon-down"}" aria-hidden="true">◈</div>
        <div class="kpi-body">
          <div class="kpi-label">Total P&amp;L</div>
          <div class="kpi-value">${pnlDisplay}</div>
          <div class="kpi-delta ${pnlDeltaCls}">${esc(pnlDelta)}${totals && totals.unknownCost ? ` · ${totals.unknownCost} missing cost` : " · all time"}</div>
        </div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" aria-hidden="true">∿</div>
        <div class="kpi-body">
          <div class="kpi-label">Active Signals</div>
          <div class="kpi-value">${esc(signalCount)}</div>
          <div class="kpi-sub">${high} high · ${mid} medium · ${low} low</div>
        </div>
      </div>
      <div class="kpi">
        <div class="kpi-icon ${confDeltaCls === "up" ? "kpi-icon-up" : confDeltaCls === "warn" ? "kpi-icon-warn" : ""}" aria-hidden="true">⛨</div>
        <div class="kpi-body">
          <div class="kpi-label">Confidence (Aggregate)</div>
          <div class="kpi-value">${esc(confDisplay)}</div>
          <div class="kpi-delta ${confDeltaCls}">${aggConf === null ? "evidence incomplete" : "across priced signals"}</div>
        </div>
      </div>
    `;
  }

  // ── Main render ───────────────────────────────────────────
  async function render(view) {
    if (!view) return;
    destroyCharts(view);

    view.innerHTML = `
      <div class="dash-hero">
        <h2 class="dash-hero-title">Dashboard</h2>
        <p class="dash-hero-sub">Real-time intelligence for smarter crypto decisions.</p>
        <p class="muted small" id="dash-updated">Last updated: ${esc(new Date().toUTCString())}</p>
      </div>

      <div class="kpi-grid" id="d-kpi">${skel.stats(4)}</div>

      <div class="dash-row-primary">
        <div class="card dash-chart-card">
          <div class="dash-card-head">
            <span class="dash-card-title">Portfolio Performance</span>
            <div class="dash-range" id="d-perf-range" role="tablist">
              <button type="button" class="dash-range-btn active" data-range="7">1W</button>
              <button type="button" class="dash-range-btn" data-range="30">1M</button>
              <button type="button" class="dash-range-btn" data-range="90">3M</button>
              <button type="button" class="dash-range-btn" data-range="365">1Y</button>
              <button type="button" class="dash-range-btn" data-range="all">ALL</button>
            </div>
          </div>
          <div class="dash-chart-canvas-wrap">
            <canvas id="d-perf-chart" aria-label="Portfolio performance chart"></canvas>
          </div>
          <p class="muted small mt-8" id="d-perf-note"></p>
        </div>
        <div class="card dash-donut-card">
          <div class="dash-card-head">
            <span class="dash-card-title">Allocation</span>
          </div>
          <div class="dash-donut-wrap">
            <canvas id="d-donut" aria-label="Portfolio allocation"></canvas>
            <div class="dash-donut-center">
              <div class="dash-donut-center-value" id="d-donut-total">—</div>
              <div class="dash-donut-center-label">Total Value</div>
            </div>
          </div>
          <div class="dash-legend" id="d-legend"></div>
        </div>
        <div class="card dash-signals-card">
          <div class="dash-card-head">
            <span class="dash-card-title">Recent Signals</span>
            <button type="button" class="dash-card-link" data-route="/signals">View all →</button>
          </div>
          <div id="d-signals"></div>
        </div>
      </div>

      <div class="dash-row-secondary">
        <div class="card">
          <div class="dash-card-head">
            <span class="dash-card-title">Top Tokens</span>
            <div class="dash-range" id="d-mkt-tabs" role="tablist">
              <button type="button" class="dash-range-btn active" data-tab="top">Top</button>
              <button type="button" class="dash-range-btn" data-tab="gain">Gainers</button>
              <button type="button" class="dash-range-btn" data-tab="lose">Losers</button>
              <button type="button" class="dash-range-btn" data-tab="trending">Trending</button>
            </div>
          </div>
          <div id="d-tape"></div>
          <div class="token-header" role="row">
            <span class="token-rank">#</span>
            <span class="token-ident">Asset</span>
            <span class="token-price">Price</span>
            <span class="token-change">24h</span>
            <span class="token-mcap">Market Cap</span>
          </div>
          <div id="d-tokens"></div>
          <div id="d-market-more"></div>
        </div>
        <div class="dash-col-stack">
          <div class="card">
            <div class="dash-card-head">
              <span class="dash-card-title">Market Sentiment</span>
            </div>
            <div id="d-fg"></div>
          </div>
          <div class="card">
            <div id="d-dom"></div>
          </div>
        </div>
      </div>

      <div class="dash-row-tertiary">
        <div class="card">
          <div class="dash-card-head">
            <span class="dash-card-title">Why? / Evidence</span>
          </div>
          <p class="muted small mb-8">Understand the reasoning behind each signal.</p>
          <div id="d-evidence"></div>
        </div>
        <div class="card">
          <div class="dash-card-head">
            <span class="dash-card-title">Quick Actions</span>
          </div>
          <div id="d-actions"></div>
        </div>
      </div>

      <div class="card">
        <div class="dash-card-head">
          <span class="dash-card-title">Key Insights</span>
        </div>
        <div class="insights-grid" id="d-insights"></div>
      </div>

      <div class="grid-2 mt-16">
        <div id="what-matters-now-container" class="intelligence-feed card card-tertiary">${skel.feed(3)}</div>
        <div id="what-changed-container"><div class="card card-tertiary">${skel.card()}</div></div>
      </div>

      <div class="card card-tertiary mt-16">
        <div class="flex-between mb-8">
          <h3>Portfolio Holdings</h3>
          <div class="qa">
            <button class="btn tiny" id="qa-add">+ Add Holding</button>
            <button class="btn tiny" id="qa-sync" title="Manage synced wallets">Wallets</button>
          </div>
        </div>
        <div id="d-port">${skel.card()}</div>
      </div>
    `;

    // Static interactions
    view.querySelectorAll("[data-route]").forEach((el) => {
      el.addEventListener("click", () => {
        const route = el.dataset.route;
        if (route) location.hash = "#" + route;
      });
    });
    view.querySelectorAll("[data-signal-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.signalId;
        if (!id || !W.evidenceDrawer?.open) return;
        try {
          W.evidenceDrawer.open(id);
        } catch (e) {
          console.warn("[Dashboard] drawer open failed:", e?.message);
        }
      });
    });

    const addBtn = view.querySelector("#qa-add");
    if (addBtn) addBtn.onclick = () => holdingModal();

    const syncBtn = view.querySelector("#qa-sync");
    if (syncBtn)
      syncBtn.onclick = () => {
        if (W.walletSync?.render) location.hash = "#/walletsync";
        else W.ui.toast("Wallet sync module not available", "warn");
      };

    const perfRangeEl = view.querySelector("#d-perf-range");
    if (perfRangeEl) {
      perfRangeEl.querySelectorAll("[data-range]").forEach((b) => {
        b.addEventListener("click", () => {
          perfRangeEl
            .querySelectorAll("[data-range]")
            .forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          drawPerformanceChart(view);
        });
      });
    }

    drawPerformanceChart(view);

    // ── Fetch data in parallel ──────────────────────────────
    const decisionsPromise =
      W.decisionEngine && typeof W.decisionEngine.run === "function"
        ? W.decisionEngine.run().catch(() => [])
        : Promise.resolve([]);

    const [topR, globR, fgR, pfR, decisionsR] = await Promise.allSettled([
      W.api.top(100),
      W.api.global(),
      W.api.fearGreed(),
      enrich(),
      decisionsPromise,
    ]);

    if (!view.isConnected) return;

    const TOP =
      topR.status === "fulfilled" && Array.isArray(topR.value)
        ? topR.value
        : [];
    const rows = pfR.status === "fulfilled" ? pfR.value.rows : [];
    const totals = pfR.status === "fulfilled" ? pfR.value.totals : null;
    const g = globR.status === "fulfilled" ? globR.value.data : null;
    const fg =
      fgR.status === "fulfilled" && fgR.value && fgR.value.value != null
        ? fgR.value
        : null;
    const decisions =
      decisionsR.status === "fulfilled" && Array.isArray(decisionsR.value)
        ? decisionsR.value
        : [];

    // KPI strip
    const kpiEl = view.querySelector("#d-kpi");
    if (kpiEl) kpiEl.innerHTML = renderKpiStrip(decisions, totals);

    // Allocation donut
    const alloc = buildAllocation(rows, totals);
    drawAllocationDonut(view, alloc);

    // Recent signals
    const signalsEl = view.querySelector("#d-signals");
    if (signalsEl) {
      signalsEl.innerHTML = renderSignals(decisions);
      signalsEl.querySelectorAll("[data-signal-id]").forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.dataset.signalId;
          if (!id || !W.evidenceDrawer?.open) return;
          try {
            W.evidenceDrawer.open(id);
          } catch (e) {
            console.warn("[Dashboard] drawer open failed:", e?.message);
          }
        });
      });
    }

    // Tape
    const tapeEl = view.querySelector("#d-tape");
    if (tapeEl)
      tapeEl.innerHTML = TOP.length ? tapeHTML(TOP.slice(0, 20)) : tapeHTML([]);

    // Top tokens table
    let tab = "top";
    const drawTokens = () => {
      let list = TOP;
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
      if (tab === "trending") list = TOP.slice(0, 20);
      if (tab === "top") list = TOP.slice(0, 50);

      const fullCount = list.length;
      const visibleList = marketRowsExpanded
        ? list
        : list.slice(0, MARKET_ROWS_DEFAULT);

      const tokensEl = view.querySelector("#d-tokens");
      if (tokensEl) {
        tokensEl.innerHTML = visibleList.length
          ? visibleList.map(tokenRow).filter(Boolean).join("")
          : `<p class="muted small p-16">No market data available.</p>`;
        tokensEl.querySelectorAll("[data-coin]").forEach((el) => {
          el.addEventListener("click", () => {
            location.hash = "#/coin/" + el.dataset.coin;
          });
        });
      }

      const moreEl = view.querySelector("#d-market-more");
      if (moreEl) {
        if (fullCount > MARKET_ROWS_DEFAULT) {
          moreEl.innerHTML = marketRowsExpanded
            ? `<button type="button" class="btn tiny mt-8" id="d-market-toggle">Show top ${MARKET_ROWS_DEFAULT}</button>`
            : `<button type="button" class="btn tiny mt-8" id="d-market-toggle">Show all ${fullCount}</button>`;
          const tg = moreEl.querySelector("#d-market-toggle");
          if (tg)
            tg.addEventListener("click", () => {
              marketRowsExpanded = !marketRowsExpanded;
              drawTokens();
            });
        } else {
          moreEl.innerHTML = "";
        }
      }
    };
    view.querySelectorAll("#d-mkt-tabs [data-tab]").forEach((c) => {
      c.addEventListener("click", () => {
        view
          .querySelectorAll("#d-mkt-tabs [data-tab]")
          .forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        tab = c.dataset.tab;
        marketRowsExpanded = false;
        drawTokens();
      });
    });
    drawTokens();
    wireAvatarFallbacks(view);

    // Fear & Greed + BTC dominance
    const fgEl = view.querySelector("#d-fg");
    if (fgEl) fgEl.innerHTML = renderFearGreed(fg);

    const domEl = view.querySelector("#d-dom");
    if (domEl)
      domEl.innerHTML = g
        ? renderDominance({ data: g })
        : `<div class="dash-card-title">BTC Dominance</div><div class="dom-value">—</div><div class="dom-delta muted">Source unavailable</div>`;

    // Evidence preview
    const evEl = view.querySelector("#d-evidence");
    if (evEl) {
      evEl.innerHTML = renderEvidencePreview(decisions);
      evEl.querySelectorAll("[data-signal-id]").forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.dataset.signalId;
          if (!id || !W.evidenceDrawer?.open) return;
          try {
            W.evidenceDrawer.open(id);
          } catch (e) {
            console.warn("[Dashboard] drawer open failed:", e?.message);
          }
        });
      });
    }

    // Quick actions
    const qaEl = view.querySelector("#d-actions");
    if (qaEl) {
      qaEl.innerHTML = renderQuickActions();
      qaEl.querySelectorAll("[data-route]").forEach((el) => {
        el.addEventListener("click", () => {
          const route = el.dataset.route;
          if (route) location.hash = "#" + route;
        });
      });
    }

    // Key insights
    const insEl = view.querySelector("#d-insights");
    if (insEl) {
      insEl.innerHTML = renderInsights(decisions, fg, rows, totals);
      insEl.querySelectorAll("[data-signal-id]").forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.dataset.signalId;
          if (!id || !W.evidenceDrawer?.open) return;
          try {
            W.evidenceDrawer.open(id);
          } catch (e) {
            console.warn("[Dashboard] drawer open failed:", e?.message);
          }
        });
      });
      insEl.querySelectorAll("[data-route]").forEach((el) => {
        el.addEventListener("click", () => {
          const route = el.dataset.route;
          if (route) location.hash = "#" + route;
        });
      });
    }

    // Portfolio holdings
    const port = view.querySelector("#d-port");
    if (port) {
      if (!rows.length) {
        port.innerHTML =
          '<p class="text-muted small-text text-center p-24">No holdings yet. Click "+ Add Holding" above, or Sync Wallets.</p>';
      } else {
        port.innerHTML = holdingsTable(rows);
        wireRows(port, rows);
        wireAvatarFallbacks(port);
      }
    }

    // Intelligence feed
    const rankerContainer = view.querySelector("#what-matters-now-container");
    if (rankerContainer) {
      if (W.intelligenceFeed && decisions.length) {
        try {
          W.intelligenceFeed.render(rankerContainer, decisions);
        } catch (e) {
          rankerContainer.innerHTML =
            '<p class="text-muted small p-16">Intelligence feed temporarily unavailable.</p>';
        }
      } else if (W.intelligenceFeed) {
        W.intelligenceFeed.render(rankerContainer, []);
      } else {
        rankerContainer.innerHTML =
          '<p class="text-muted small p-16">Intelligence engine loading…</p>';
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
                <b>${esc(t.asset)}</b>
                <span class="muted small">${esc(t.signals || "Security status unavailable")}</span>
              </div>
              ${t.reasons ? `<p class="muted small mt-4">${esc(t.reasons)}</p>` : ""}
            </li>`,
            )
            .join("")}</ul>`
        : `<p class="muted small">No new discoveries yet — run Gem Agent to populate this.</p>`;

      const deltasHTML =
        totals && W.delta
          ? (() => {
              try {
                const deltas = W.delta.computePortfolioDeltas(totals);
                const container = document.createElement("div");
                W.delta.renderList(container, deltas);
                return container.innerHTML;
              } catch (e) {
                console.warn("[Dashboard] delta render failed:", e?.message);
                return `<p class="muted small">Portfolio change history unavailable.</p>`;
              }
            })()
          : `<p class="muted small">Add holdings to your portfolio to start tracking value changes over time.</p>`;

      changedContainer.innerHTML = `
        <div class="card card-tertiary">
          <h3>Discoveries</h3>
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
    if (!view) return;
    const has = W.portfolio ? W.portfolio.all().length > 0 : false;
    view.innerHTML = `
      <div class="card card-primary">
        <div class="flex-between mb-8">
          <h3>Holdings</h3>
          <div class="qa">
            <button class="btn primary" id="p-add">+ Add Holding</button>
          </div>
        </div>
        <div id="p-body">${has ? skel.card() : '<p class="text-muted">No holdings yet.</p>'}</div>
      </div>`;
    const addBtn = view.querySelector("#p-add");
    if (addBtn) addBtn.onclick = () => holdingModal();
    if (has) {
      enrich().then(({ rows }) => {
        if (!view.isConnected) return;
        const body = view.querySelector("#p-body");
        if (body) {
          body.innerHTML = holdingsTable(rows);
          wireRows(body, rows);
          wireAvatarFallbacks(body);
        }
      });
    }
  }

  return Object.freeze({
    render,
    renderPortfolio,
    holdingModal,
    enrich,
    version: MODULE_VERSION,
  });
})();

console.log(
  "[Dashboard] Module loaded (Command Center v3.4: real token logos with letter-avatar fallback).",
);
