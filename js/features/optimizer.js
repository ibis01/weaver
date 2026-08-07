window.W = window.W || {};

W.optimizer = (() => {
  let rows = [],
    totals = null;

  const concentration = (vals) => {
    const t = vals.reduce((a, b) => a + b, 0);
    if (!t) return 0;
    return (
      ([...vals]
        .sort((a, b) => b - a)
        .slice(0, 3)
        .reduce((a, b) => a + b, 0) /
        t) *
      100
    );
  };

  function presetTargets(kind, rows) {
    const t = {},
      ids = rows.map((r) => r.coinId);
    if (kind === "equal") {
      ids.forEach((id) => (t[id] = 100 / ids.length));
      return t;
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
    anchors.forEach(([id, w]) => {
      if (ids.includes(id)) {
        t[id] = w;
        anchorSum += w;
      }
    });
    const others = ids.filter((id) => !(id in t));
    others.forEach((id) => (t[id] = (100 - anchorSum) / others.length));
    return t;
  }

  function drawTable(view, t) {
    view.querySelector("#o-table").innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Asset</th><th>Value</th><th>Current %</th><th>Target %</th><th>Suggested Trade</th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
        <td class="coin-cell"><img src="${r.image || r.img || ""}"><b>${r.name}</b></td>
        <td>${W.fmt.money(r.value)}</td>
        <td>${((r.value / totals.value) * 100).toFixed(1)}%</td>
        <td><input type="number" step="0.1" min="0" max="100" data-t="${r.coinId}" style="width:90px" value="${+t[r.coinId].toFixed(1)}"></td>
        <td data-trade="${r.coinId}"></td>
      </tr>`,
        )
        .join("")}
      <tr><td colspan="3"></td><td><b id="o-sum"></b></td><td></td></tr></tbody></table></div>`;
    view
      .querySelectorAll("[data-t]")
      .forEach((i) => (i.oninput = W.debounce(() => recompute(view), 250)));
  }

  function recompute(view) {
    const targets = {};
    let sum = 0;
    rows.forEach((r) => {
      const v =
        parseFloat(view.querySelector(`[data-t="${r.coinId}"]`).value) || 0;
      targets[r.coinId] = v;
      sum += v;
    });
    const ok = Math.abs(sum - 100) <= 0.5;
    const sumEl = view.querySelector("#o-sum");
    sumEl.textContent = `${sum.toFixed(1)}% ${ok ? "✓" : ""}`;
    sumEl.className = ok ? "up" : "down";

    rows.forEach((r) => {
      const el = view.querySelector(`[data-trade="${r.coinId}"]`);
      const delta = (totals.value * (targets[r.coinId] || 0)) / 100 - r.value;
      if (!ok) {
        el.innerHTML = "";
        return;
      }
      if (Math.abs(delta) < totals.value * 0.01) {
        el.innerHTML = '<span class="tag">Hold</span>';
        return;
      }
      const qty = Math.abs(delta) / r.price;
      el.innerHTML = `<span class="tag ${delta > 0 ? "buy" : "sell"}">${delta > 0 ? "Buy" : "Sell"}</span>
        ${qty.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${r.symbol.toUpperCase()}
        <span class="muted small">(${W.fmt.money(Math.abs(delta))})</span>`;
    });

    const before = concentration(rows.map((r) => r.value));
    const after = concentration(
      rows.map((r) => (totals.value * (targets[r.coinId] || 0)) / 100),
    );
    const vol = rows.reduce((s, r) => s + Math.abs(r.p7 ?? 0), 0) / rows.length;
    view.querySelector("#o-stats").innerHTML = `
      <div class="card stat"><div class="stat-label">Current Value</div><div class="stat-big">${W.fmt.money(totals.value)}</div></div>
      <div class="card stat"><div class="stat-label">Concentration (top-3)</div><div class="stat-big">${before.toFixed(0)}% → <span class="${after < before ? "up" : ""}">${after.toFixed(0)}%</span></div></div>
      <div class="card stat"><div class="stat-label">Volatility (avg 7d swing)</div><div class="stat-big">${vol.toFixed(1)}%</div><div class="stat-sub">${vol > 8 ? "High — consider trimming swingy assets" : "Within normal range"}</div></div>`;

    const worst = [...rows].sort((a, b) => b.value - a.value)[0];
    view.querySelector("#o-brief").innerHTML = ok
      ? `<div class="ai-brief">🤖 <b>Weaver's plan:</b> your largest position (${worst.name}) moves from ${((worst.value / totals.value) * 100).toFixed(0)}% to ${(targets[worst.coinId] || 0).toFixed(0)}%, shifting top-3 concentration ${before.toFixed(0)}% → ${after.toFixed(0)}%. ${after < before ? "This meaningfully reduces single-asset risk." : "Warning: this plan increases concentration — size positions so a 50% drawdown can't wipe you out."} Execute sells first, then buys. Sells realize gains — check your <a class="link" href="#/settings">Tax Report</a>. Not financial advice.</div>`
      : "";
  }

  async function render(view) {
    const data = await W.dashboard.enrich();
    rows = data.rows;
    totals = data.totals;
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
        <div class="watch-head"><h3>🧮 Portfolio Optimizer</h3>
          <div class="qa">
            <button class="chip" data-p="equal">Equal Weight</button>
            <button class="chip active" data-p="balanced">Balanced 50/30/20</button>
            <button class="chip" data-p="btc">BTC Maximalist</button>
          </div>
        </div>
        <p class="muted small">Pick a strategy or edit targets manually — Weaver computes the exact trades live, plus before/after risk.</p>
      </div>
      <div class="cards" id="o-stats"></div>
      <div class="card"><div id="o-table"></div></div>
      <div id="o-brief"></div>`;

    view.querySelectorAll("[data-p]").forEach(
      (c) =>
        (c.onclick = () => {
          view
            .querySelectorAll("[data-p]")
            .forEach((x) => x.classList.remove("active"));
          c.classList.add("active");
          const t = presetTargets(c.dataset.p, rows);
          rows.forEach((r) => {
            const inp = view.querySelector(`[data-t="${r.coinId}"]`);
            if (inp) inp.value = +t[r.coinId].toFixed(1);
          });
          recompute(view);
        }),
    );

    drawTable(view, presetTargets("balanced", rows));
    recompute(view);
  }

  return { render };
})();
