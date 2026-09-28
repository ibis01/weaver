// ================================================================
// Portfolio Optimizer 
// ================================================================


window.W = window.W || {};

W.optimizer = (() => {
  "use strict";

  let rows = [];
  let totals = null;
  let _renderGen = 0;

  // ── Constants ──────────────────────────────────────────
  const MAX_URL_LEN = 2048;
  const MAX_ID_LEN = 128;
  const MAX_NAME_LEN = 100;
  const MAX_SYMBOL_LEN = 16;

  // ── Attribute-safe escaping ────────────────────────────
  function esc(v) {
    if (v == null) return "";
    const s = String(v);
    if (!/[&<>"']/.test(s)) return s;
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeStr(v, maxLen) {
    if (v == null) return "";
    const s = String(v);
    return maxLen ? s.slice(0, maxLen) : s;
  }

  function safeNum(v, fallback = null) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function newMap() {
    return Object.create(null);
  }

  // ── Image URL allowlist ────────────────────────────────
  const IMG_PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
        '<rect width="24" height="24" fill="#2b2d42"/></svg>',
    );

  function safeImageUrl(u) {
    if (typeof u !== "string" || !u || u.length > MAX_URL_LEN) {
      return IMG_PLACEHOLDER;
    }
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:") return IMG_PLACEHOLDER;
      return parsed.toString();
    } catch {
      return IMG_PLACEHOLDER;
    }
  }

  // ── Safe W.fmt wrappers ────────────────────────────────
  function fmtMoney(v) {
    const n = safeNum(v, null);
    if (n === null) return "—";
    try {
      return W.fmt.money(n);
    } catch {
      return "—";
    }
  }

  // ── Concentration ──────────────────────────────────────
  function concentration(values) {
    if (!Array.isArray(values) || !values.length) return 0;
    const nums = values.map((v) => safeNum(v, 0));
    const total = nums.reduce((a, b) => a + b, 0);
    if (!total) return 0;
    const top3 = nums
      .slice()
      .sort((a, b) => b - a)
      .slice(0, 3);
    return (top3.reduce((a, b) => a + b, 0) / total) * 100;
  }

  // ── Preset targets ─────────────────────────────────────
  function presetTargets(kind, holdings) {
    const targets = newMap();
    if (!Array.isArray(holdings) || !holdings.length) return targets;

    const ids = holdings
      .map((r) => safeStr(r && r.coinId, MAX_ID_LEN))
      .filter((id) => id);
    if (!ids.length) return targets;

    if (kind === "equal") {
      const w = 100 / ids.length;
      ids.forEach((id) => (targets[id] = w));
      return targets;
    }

    const anchors =
      kind === "btc"
        ? [
            ["bitcoin", 80],
            ["ethereum", 10],
          ]
        : [
            ["bitcoin", 50],
            ["ethereum", 30],
          ];

    let anchorSum = 0;
    anchors.forEach(([id, weight]) => {
      if (ids.includes(id)) {
        targets[id] = weight;
        anchorSum += weight;
      }
    });

    const others = ids.filter((id) => !(id in targets));
    if (others.length) {
      const remaining = 100 - anchorSum;
      const w = remaining / others.length;
      others.forEach((id) => (targets[id] = w));
    }
    return targets;
  }

  // ── Draw table ─────────────────────────────────────────
  function drawTable(view, targets) {
    const tableEl = view.querySelector("#o-table");
    if (!tableEl) return;

    const totalValue = safeNum(totals && totals.value, 0);

    const bodyRows = rows
      .map((r) => {
        const id = safeStr(r && r.coinId, MAX_ID_LEN);
        if (!id) return "";
        const name = safeStr(r.name, MAX_NAME_LEN) || "Unknown";
        const symbol = safeStr(r.symbol, MAX_SYMBOL_LEN).toUpperCase();
        const imageUrl = safeImageUrl(r.image || r.img);
        const value = safeNum(r.value, 0);
        const pct =
          totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0.0";
        const t = safeNum(targets[id], 0);
        const targetVal = t.toFixed(1);

        return `
          <tr>
            <td class="coin-cell">
              <img src="${esc(imageUrl)}" alt="${esc(name)}" class="icon-24" loading="lazy" referrerpolicy="no-referrer">
              <b>${esc(name)}</b>
              <span class="muted small">${esc(symbol)}</span>
            </td>
            <td class="num">${esc(fmtMoney(value))}</td>
            <td class="num">${esc(pct)}%</td>
            <td class="num">
              <input type="number" step="0.1" min="0" max="100"
                     data-target="${esc(id)}"
                     class="w-80-right"
                     value="${esc(targetVal)}">
            </td>
            <td data-trade="${esc(id)}"></td>
          </tr>
        `;
      })
      .join("");

    tableEl.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th class="num">Value</th>
              <th class="num">Current %</th>
              <th class="num">Target %</th>
              <th>Suggested Trade</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            <tr>
              <td colspan="3"></td>
              <td class="num"><b id="o-sum"></b></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    // Attach input listeners. CSS.escape prevents selector
    // breakage when coinId contains special characters.
    view.querySelectorAll("[data-target]").forEach((input) => {
      input.oninput = () => recompute(view);
    });
  }

  // ── Recompute ──────────────────────────────────────────
  function recompute(view) {
    const targets = newMap();
    let sum = 0;

    rows.forEach((r) => {
      const id = safeStr(r && r.coinId, MAX_ID_LEN);
      if (!id) return;
      const input = view.querySelector(`[data-target="${CSS.escape(id)}"]`);
      const val = input ? Math.max(0, safeNum(input.value, 0)) : 0;
      targets[id] = val;
      sum += val;
    });

    const ok = Math.abs(sum - 100) <= 0.5;
    const sumEl = view.querySelector("#o-sum");
    if (sumEl) {
      sumEl.textContent = `${sum.toFixed(1)}%`;
      // CSP-safe: uses classes, not el.style.color.
      sumEl.classList.remove("text-up", "text-down");
      sumEl.classList.add(ok ? "text-up" : "text-down");
    }

    const totalValue = safeNum(totals && totals.value, 0);

    // ── Trade suggestions ──
    rows.forEach((r) => {
      const id = safeStr(r && r.coinId, MAX_ID_LEN);
      if (!id) return;
      const el = view.querySelector(`[data-trade="${CSS.escape(id)}"]`);
      if (!el) return;

      if (!ok || totalValue <= 0) {
        el.innerHTML = '<span class="muted small">Adjust targets</span>';
        return;
      }

      const symbol = safeStr(r.symbol, MAX_SYMBOL_LEN).toUpperCase() || "?";
      const value = safeNum(r.value, 0);
      const price = safeNum(r.price, null);
      const targetValue = (totalValue * (targets[id] || 0)) / 100;
      const delta = targetValue - value;

      if (Math.abs(delta) < totalValue * 0.005) {
        el.innerHTML = '<span class="tag neutral">Hold</span>';
        return;
      }

      const action = delta > 0 ? "Buy" : "Sell";
      const cls = delta > 0 ? "buy" : "sell";

      let qtyText = "—";
      if (price && price > 0) {
        const qty = Math.abs(delta) / price;
        qtyText = qty.toLocaleString(undefined, { maximumFractionDigits: 6 });
      }

      el.innerHTML =
        '<span class="tag ' +
        esc(cls) +
        '">' +
        esc(action) +
        "</span> " +
        esc(qtyText) +
        " " +
        esc(symbol) +
        " " +
        '<span class="muted small">(' +
        esc(fmtMoney(Math.abs(delta))) +
        ")</span>";
    });

    // ── Stats ──
    const beforeConcentration = concentration(
      rows.map((r) => safeNum(r.value, 0)),
    );
    const afterConcentration = concentration(
      rows.map((r) => {
        const id = safeStr(r && r.coinId, MAX_ID_LEN);
        return (totalValue * (targets[id] || 0)) / 100;
      }),
    );
    const avgVol = rows.length
      ? rows.reduce((s, r) => s + Math.abs(safeNum(r.p7, 0)), 0) / rows.length
      : 0;

    const statsEl = view.querySelector("#o-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="card stat">
          <div class="stat-label">Current Value</div>
          <div class="stat-big">${esc(fmtMoney(totalValue))}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Concentration (top-3)</div>
          <div class="stat-big">${esc(beforeConcentration.toFixed(0))}% → <span class="${afterConcentration < beforeConcentration ? "text-up" : ""}">${esc(afterConcentration.toFixed(0))}%</span></div>
        </div>
        <div class="card stat">
          <div class="stat-label">Volatility (avg 7d swing)</div>
          <div class="stat-big">${esc(avgVol.toFixed(1))}%</div>
          <div class="stat-sub">${esc(avgVol > 8 ? "High — consider trimming swingy assets" : "Within normal range")}</div>
        </div>
      `;
    }

    // ── Brief ──
    const worst = rows
      .slice()
      .sort((a, b) => safeNum(b.value, 0) - safeNum(a.value, 0))[0];
    const briefEl = view.querySelector("#o-brief");

    if (briefEl && ok && worst && totalValue > 0) {
      const worstId = safeStr(worst.coinId, MAX_ID_LEN);
      const worstName = safeStr(worst.name, MAX_NAME_LEN) || "Unknown";
      const worstValue = safeNum(worst.value, 0);
      const targetPct = safeNum(targets[worstId], 0);
      const currentPct = (worstValue / totalValue) * 100;

      briefEl.innerHTML = `
        <div class="ai-brief mt">
          🤖 <b>Weaver's plan:</b> your largest position (${esc(worstName)}) moves from
          ${esc(currentPct.toFixed(0))}% to ${esc(targetPct.toFixed(0))}%,
          shifting top-3 concentration ${esc(beforeConcentration.toFixed(0))}% → ${esc(afterConcentration.toFixed(0))}%.
          ${
            afterConcentration < beforeConcentration
              ? "This meaningfully reduces single-asset risk."
              : "Warning: this plan increases concentration — size positions so a 50% drawdown can't wipe you out."
          }
          Execute sells first, then buys. Sells realize gains — check your <a class="link" href="#/settings">Tax Report</a>.
          <span class="muted small">Not financial advice.</span>
        </div>
      `;
    } else if (briefEl) {
      briefEl.innerHTML = "";
    }
  }

  // ── Render ─────────────────────────────────────────────
  async function render(view) {
    if (!view) {
      console.warn("[Optimizer] No view element provided");
      return;
    }

    const gen = ++_renderGen;

    // Guarded enrich. If dashboard throws, we render an error
    // state rather than leaving the previous view in place.
    let data = { rows: [], totals: null };
    try {
      data = W.dashboard ? await W.dashboard.enrich() : data;
    } catch (e) {
      console.warn("[Optimizer] enrich() failed:", e && e.message);
    }

    if (gen !== _renderGen || !view.isConnected) return;

    rows = Array.isArray(data.rows) ? data.rows : [];
    totals = data.totals || null;

    const totalValue = safeNum(totals && totals.value, 0);
    if (!rows.length || totalValue <= 0) {
      view.innerHTML = W.ui.empty(
        "🧮",
        "Nothing to optimize",
        "Add holdings first — the optimizer will rebalance them.",
      );
      return;
    }

    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🧮 Portfolio Optimizer</h3>
          <div class="qa">
            <button class="chip" data-preset="equal">Equal Weight</button>
            <button class="chip active" data-preset="balanced">Balanced 50/30/20</button>
            <button class="chip" data-preset="btc">BTC Maximalist</button>
          </div>
        </div>
        <p class="muted small">Pick a strategy or edit targets manually — Weaver computes the exact trades live, plus before/after risk.</p>
      </div>
      <div class="cards" id="o-stats"></div>
      <div class="card"><div id="o-table"></div></div>
      <div id="o-brief"></div>
    `;

    // ── Preset buttons ──
    view.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.onclick = () => {
        view
          .querySelectorAll("[data-preset]")
          .forEach((x) => x.classList.remove("active"));
        btn.classList.add("active");

        const preset = btn.getAttribute("data-preset");
        // Whitelist — no dynamic name ever reaches presetTargets.
        if (!["equal", "balanced", "btc"].includes(preset)) return;

        const t = presetTargets(preset, rows);
        rows.forEach((r) => {
          const id = safeStr(r && r.coinId, MAX_ID_LEN);
          if (!id) return;
          const input = view.querySelector(`[data-target="${CSS.escape(id)}"]`);
          if (input) input.value = safeNum(t[id], 0).toFixed(1);
        });
        recompute(view);
      };
    });

    // ── Initial draw ──
    drawTable(view, presetTargets("balanced", rows));
    recompute(view);
  }

  return {
    render,
    recompute,
    presetTargets,
    concentration,
  };
})();

console.log(
  "[Optimizer] Module loaded v2 — attribute-safe, URL allowlist, prototype-safe.",
);
