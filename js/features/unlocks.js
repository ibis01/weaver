// ================================================================
// js/features/unlocks.js – Token Unlock Calendar
// ================================================================

window.W = window.W || {};

W.unlocks = (() => {
  const KEY = "token-unlocks";
  const DAY = 864e5;

  // ── Sample data (relative dates so the demo always shows upcoming events) ──
  const seed = () => [
    {
      id: "s1",
      coinId: "arbitrum",
      symbol: "arb",
      name: "Arbitrum",
      amount: 92e6,
      type: "Cliff",
      date: Date.now() + 2 * DAY,
      note: "Sample: investor allocation",
    },
    {
      id: "s2",
      coinId: "sui",
      symbol: "sui",
      name: "Sui",
      amount: 42e6,
      type: "Linear",
      date: Date.now() + 6 * DAY,
      note: "Sample: monthly ecosystem release",
    },
    {
      id: "s3",
      coinId: "aptos",
      symbol: "apt",
      name: "Aptos",
      amount: 11.3e6,
      type: "Cliff",
      date: Date.now() + 13 * DAY,
      note: "Sample: team vesting",
    },
    {
      id: "s4",
      coinId: "optimistic-ethereum",
      symbol: "op",
      name: "Optimism",
      amount: 31e6,
      type: "Cliff",
      date: Date.now() + 27 * DAY,
      note: "Sample: core contributors",
    },
    {
      id: "s5",
      coinId: "celestia",
      symbol: "tia",
      name: "Celestia",
      amount: 8.9e6,
      type: "Cliff",
      date: Date.now() + 41 * DAY,
      note: "Sample: early backer unlock",
    },
    {
      id: "s6",
      coinId: "starknet",
      symbol: "strk",
      name: "Starknet",
      amount: 127e6,
      type: "Cliff",
      date: Date.now() + 75 * DAY,
      note: "Sample: investor cliff",
    },
  ];

  // ── Data Management ──────────────────────────────────
  function list() {
    const stored = W.store.get(KEY, null);
    if (stored) return stored;
    const s = seed();
    W.store.set(KEY, s);
    return s;
  }

  function save(list) {
    W.store.set(KEY, list);
  }

  // ── Helpers ────────────────────────────────────────────
  function daysLeft(date) {
    return Math.ceil((date - Date.now()) / DAY);
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function pressureTag(ratio) {
    if (ratio >= 0.5) return '<span class="tag sell">High pressure</span>';
    if (ratio >= 0.15) return '<span class="tag triggered">Medium</span>';
    return '<span class="tag buy">Low</span>';
  }

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Add Modal ──────────────────────────────────────────
  function addModal() {
    const m = W.ui.modal({
      title: "Add Token Unlock",
      body: `
        <div id="u-picker"></div>
        <label>
          Unlock date
          <input type="date" id="u-date" required>
        </label>
        <label>
          Token amount
          <input type="number" step="any" id="u-amt" placeholder="1000000">
        </label>
        <label>
          Type
          <select id="u-type">
            <option value="Cliff">Cliff</option>
            <option value="Linear">Linear</option>
            <option value="Emission">Emission</option>
          </select>
        </label>
        <label>
          Note (optional)
          <input id="u-note" placeholder="e.g. team vesting">
        </label>
      `,
      footer: `
        <button class="btn ghost" id="u-cancel">Cancel</button>
        <button class="btn primary" id="u-save">Add</button>
      `,
    });

    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(m.el.querySelector("#u-picker"), (p) => (picked = p));
    }

    m.el.querySelector("#u-cancel").onclick = m.close;
    m.el.querySelector("#u-save").onclick = () => {
      const date = new Date(m.el.querySelector("#u-date").value).getTime();
      const amount = parseFloat(m.el.querySelector("#u-amt").value);
      const type = m.el.querySelector("#u-type").value;
      const note = m.el.querySelector("#u-note").value.trim();

      if (!picked) return W.ui.toast("Pick a token first", "warn");
      if (!date || isNaN(date)) return W.ui.toast("Enter a valid date", "warn");
      if (!amount || amount <= 0)
        return W.ui.toast("Enter a valid amount", "warn");

      const unlocks = list();
      unlocks.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        coinId: picked.id,
        symbol: picked.symbol,
        name: picked.name,
        amount,
        type,
        date,
        note,
      });
      save(unlocks);
      m.close();
      W.ui.toast("Unlock scheduled 🔓", "ok");
      W.refresh();
    };
  }

  // ── Load and Render ───────────────────────────────────
  async function load(view, range) {
    const el = view.querySelector("#u-list");
    const stats = view.querySelector("#u-stats");
    if (!el) return;

    const items = list()
      .filter((u) => daysLeft(u.date) <= range && daysLeft(u.date) >= -1)
      .sort((a, b) => a.date - b.date);

    if (!items.length) {
      el.innerHTML = W.ui.empty("🔓", "No unlocks in this window");
      stats.innerHTML = "";
      return;
    }

    // ── Fetch market data ──────────────────────────────
    const ids = [...new Set(items.map((u) => u.coinId))].join(",");
    let mk = {};
    try {
      const data = await W.api.markets(ids);
      data.forEach((c) => (mk[c.id] = c));
    } catch (e) {
      console.warn("[Unlocks] Market fetch error:", e);
    }

    let v7 = 0,
      v30 = 0,
      worst = null;

    const rows = items
      .map((u) => {
        const m = mk[u.coinId] || {};
        const price = m.current_price || 0,
          vol = m.total_volume || 0;
        const value = u.amount * price;
        const ratio = vol ? value / vol : 0;
        const dl = daysLeft(u.date);

        if (dl <= 7) v7 += value;
        if (dl <= 30) v30 += value;
        if (!worst || ratio > worst.ratio) worst = { u, ratio };

        return `
          <tr>
            <td>
              <b>${dl <= 0 ? "Today" : dl + "d"}</b>
              <div class="muted small">${formatDate(u.date)}</div>
            </td>
            <td class="coin-cell">
              ${m.image ? `<img src="${m.image}" alt="${u.name}">` : ""}
              <div>
                <b>${escapeHTML(u.name)}</b>
                <br><span class="muted small">${u.symbol.toUpperCase()}</span>
              </div>
            </td>
            <td><span class="tag ${u.type === "Cliff" ? "rank" : "live"}">${escapeHTML(u.type)}</span></td>
            <td>${u.amount.toLocaleString()}</td>
            <td><b>${W.fmt.money(value, { compact: true })}</b></td>
            <td>${(ratio * 100).toFixed(0)}% of 24h vol<br>${pressureTag(ratio)}</td>
            <td class="row-actions">
              <button class="icon-btn" data-del="${u.id}" title="Delete">🗑️</button>
            </td>
          </tr>
        `;
      })
      .join("");

    // ── Stats ──────────────────────────────────────────
    stats.innerHTML = `
      <div class="card stat">
        <div class="stat-label">Unlocks · 7d</div>
        <div class="stat-big">${W.fmt.money(v7, { compact: true })}</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Unlocks · 30d</div>
        <div class="stat-big">${W.fmt.money(v30, { compact: true })}</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Highest Pressure</div>
        <div class="stat-big">${worst ? worst.u.symbol.toUpperCase() : "—"}</div>
        <div class="stat-sub">${worst ? (worst.ratio * 100).toFixed(0) + "% of 24h volume" : ""}</div>
      </div>
    `;

    // ── Table ────────────────────────────────────────────
    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Token</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Value</th>
              <th>Sell Pressure</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${
        worst && worst.ratio >= 0.5
          ? `
        <div class="ai-brief mt">
          🤖 <b>Weaver:</b> ${escapeHTML(worst.u.name)}'s upcoming unlock equals
          ${(worst.ratio * 100).toFixed(0)}% of its daily trading volume — events
          like this historically increase short-term volatility. Not financial advice.
        </div>
      `
          : ""
      }
    `;

    // ── Delete buttons ──────────────────────────────────
    el.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.del;
        W.ui.confirm("Delete this unlock event?", () => {
          save(list().filter((x) => x.id !== id));
          load(view, range);
          W.ui.toast("Unlock removed", "info");
        });
      };
    });
  }

  // ── Main Render ───────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🔓 Token Unlock Calendar</h3>
          <div class="qa">
            <button class="chip" data-range="7">7D</button>
            <button class="chip active" data-range="30">30D</button>
            <button class="chip" data-range="90">90D</button>
            <button class="chip" data-range="all">All</button>
            <button class="btn primary" id="u-add">+ Add Unlock</button>
          </div>
        </div>
        <p class="muted small">
          Upcoming vesting cliffs & emissions. <b>Pressure</b> = unlock value ÷ 24h volume —
          high ratios often precede sell pressure. Ships with sample data; add real schedules manually
          or plug a TokenUnlocks API key in Pro.
        </p>
      </div>
      <div class="cards" id="u-stats"></div>
      <div class="card"><div id="u-list">${W.ui.spinner()}</div></div>
    `;

    let range = 30;
    const rangeBtns = view.querySelectorAll("[data-range]");
    rangeBtns.forEach((c) => {
      c.onclick = () => {
        rangeBtns.forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        range = c.dataset.range === "all" ? 1e5 : +c.dataset.range;
        load(view, range);
      };
    });

    const addBtn = view.querySelector("#u-add");
    if (addBtn) addBtn.onclick = addModal;

    await load(view, range);
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    list,
    save,
    addModal,
    load,
  };
})();

console.log("[Unlocks] Module loaded.");
