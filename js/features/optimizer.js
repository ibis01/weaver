// ================================================================
// js/features/optimizer.js – Portfolio Optimizer
// ================================================================

window.W = window.W || {};

W.optimizer = (() => {
  let rows = [],
    totals = null;

  // ── Helpers ──────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function concentration(values) {
    const total = values.reduce((a, b) => a + b, 0);
    if (!total) return 0;
    const top3 = [...values].sort((a, b) => b - a).slice(0, 3);
    return (top3.reduce((a, b) => a + b, 0) / total) * 100;
  }

  // ── Preset Targets ──────────────────────────────────────
  function presetTargets(kind, holdings) {
    const targets = {};
    const ids = holdings.map((r) => r.coinId);

    if (kind === "equal") {
      ids.forEach((id) => (targets[id] = 100 / ids.length));
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
      others.forEach((id) => (targets[id] = remaining / others.length));
    }
    return targets;
  }

  // ── Draw Table ──────────────────────────────────────────
  function drawTable(view, targets) {
    const tableEl = view.querySelector("#o-table");
    if (!tableEl) return;

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
            ${rows
              .map(
                (r) => `
              <tr>
                <td class="coin-cell">
                  <img src="${r.image || r.img || ""}" alt="${escapeHTML(r.name)}" style="width:24px;height:24px;border-radius:50%;">
                  <b>${escapeHTML(r.name)}</b>
                  <span class="muted small">${r.symbol.toUpperCase()}</span>
                </td>
                <td class="num">${W.fmt.money(r.value)}</td>
                <td class="num">${totals.value ? ((r.value / totals.value) * 100).toFixed(1) : 0}%</td>
                <td class="num">
                  <input type="number" step="0.1" min="0" max="100" data-target="${r.coinId}" style="width:80px;text-align:right;" value="${+targets[r.coinId].toFixed(1)}">
                </td>
                <td data-trade="${r.coinId}"></td>
              </tr>
            `,
              )
              .join("")}
            <tr>
              <td colspan="3"></td>
              <td class="num"><b id="o-sum"></b></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    // ── Recompute on input ──────────────────────────────
    view.querySelectorAll("[data-target]").forEach((input) => {
      input.oninput = () => recompute(view);
    });
  }

  // ── Recompute ───────────────────────────────────────────
  function recompute(view) {
    const targets = {};
    let sum = 0;

    rows.forEach((r) => {
      const input = view.querySelector(`[data-target="${r.coinId}"]`);
      const val = input ? parseFloat(input.value) || 0 : 0;
      targets[r.coinId] = val;
      sum += val;
    });

    const ok = Math.abs(sum - 100) <= 0.5;
    const sumEl = view.querySelector("#o-sum");
    if (sumEl) {
      sumEl.textContent = `${sum.toFixed(1)}%`;
      sumEl.style.color = ok ? "var(--up)" : "var(--down)";
    }

    // ── Trade suggestions ──────────────────────────────
    rows.forEach((r) => {
      const el = view.querySelector(`[data-trade="${r.coinId}"]`);
      if (!el) return;
      if (!ok) {
        el.innerHTML = '<span class="muted small">Adjust targets</span>';
        return;
      }
      const targetValue = (totals.value * (targets[r.coinId] || 0)) / 100;
      const delta = targetValue - r.value;
      if (Math.abs(delta) < totals.value * 0.005) {
        el.innerHTML = '<span class="tag neutral">Hold</span>';
        return;
      }
      const qty = Math.abs(delta) / r.price;
      const action = delta > 0 ? "Buy" : "Sell";
      const cls = delta > 0 ? "buy" : "sell";
      el.innerHTML = `
        <span class="tag ${cls}">${action}</span>
        ${qty.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${r.symbol.toUpperCase()}
        <span class="muted small">(${W.fmt.money(Math.abs(delta))})</span>
      `;
    });

    // ── Stats ──────────────────────────────────────────
    const beforeConcentration = concentration(rows.map((r) => r.value));
    const afterConcentration = concentration(
      rows.map((r) => (totals.value * (targets[r.coinId] || 0)) / 100),
    );
    const avgVol =
      rows.reduce((s, r) => s + Math.abs(r.p7 || 0), 0) / rows.length;

    const statsEl = view.querySelector("#o-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="card stat">
          <div class="stat-label">Current Value</div>
          <div class="stat-big">${W.fmt.money(totals.value)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Concentration (top-3)</div>
          <div class="stat-big">${beforeConcentration.toFixed(0)}% → <span class="${afterConcentration < beforeConcentration ? "up" : ""}">${afterConcentration.toFixed(0)}%</span></div>
        </div>
        <div class="card stat">
          <div class="stat-label">Volatility (avg 7d swing)</div>
          <div class="stat-big">${avgVol.toFixed(1)}%</div>
          <div class="stat-sub">${avgVol > 8 ? "High — consider trimming swingy assets" : "Within normal range"}</div>
        </div>
      `;
    }

    // ── Brief ──────────────────────────────────────────
    const worst = [...rows].sort((a, b) => b.value - a.value)[0];
    const briefEl = view.querySelector("#o-brief");
    if (briefEl && ok) {
      const targetPct = targets[worst.coinId] || 0;
      briefEl.innerHTML = `
        <div class="ai-brief mt">
          🤖 <b>Weaver's plan:</b> your largest position (${escapeHTML(worst.name)}) moves from
          ${((worst.value / totals.value) * 100).toFixed(0)}% to ${targetPct.toFixed(0)}%,
          shifting top-3 concentration ${beforeConcentration.toFixed(0)}% → ${afterConcentration.toFixed(0)}%.
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

  // ── Render ──────────────────────────────────────────────
  async function render(view) {
    if (!view) {
      console.warn("[Optimizer] No view element provided");
      return;
    }

    // Get portfolio data from dashboard
    const data = W.dashboard
      ? await W.dashboard.enrich()
      : { rows: [], totals: null };

    if (!view.isConnected) return;
    rows = data.rows || [];
    totals = data.totals || null;

    if (!rows.length || !totals?.value) {
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

    // ── Preset buttons ──────────────────────────────────
    view.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.onclick = () => {
        view
          .querySelectorAll("[data-preset]")
          .forEach((x) => x.classList.remove("active"));
        btn.classList.add("active");
        const targets = presetTargets(btn.dataset.preset, rows);
        rows.forEach((r) => {
          const input = view.querySelector(`[data-target="${r.coinId}"]`);
          if (input) input.value = +targets[r.coinId].toFixed(1);
        });
        recompute(view);
      };
    });

    // ── Initial draw ────────────────────────────────────
    drawTable(view, presetTargets("balanced", rows));
    recompute(view);
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    render,
    recompute,
    presetTargets,
    concentration,
  };
})();

console.log("[Optimizer] Module loaded.");
