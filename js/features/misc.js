window.W = window.W || {};

W.achievements = (() => {
  const DEFS = [
    {
      id: "first-coin",
      icon: "🌱",
      name: "First Thread",
      desc: "Add your first holding",
      test: () => W.portfolio.all().length >= 1,
    },
    {
      id: "five-coins",
      icon: "🧺",
      name: "Diversifier",
      desc: "Hold 5+ different assets",
      test: () => W.portfolio.all().length >= 5,
    },
    {
      id: "first-tx",
      icon: "↔️",
      name: "Trader",
      desc: "Record a buy/sell transaction",
      test: () => W.portfolio.txs().length >= 1,
    },
    {
      id: "first-alert",
      icon: "🚨",
      name: "Watchdog",
      desc: "Create a price alert",
      test: () => W.store.get("alerts", []).length >= 1,
    },
    {
      id: "student",
      icon: "🎓",
      name: "Student",
      desc: "Complete a lesson",
      test: () => (W.store.get("learn", {}).done || []).length >= 1,
    },
    {
      id: "web3",
      icon: "🔗",
      name: "Web3 Native",
      desc: "Connect a wallet",
      test: () => !!W.store.get("wallet-connected", false),
    },
  ];
  const earned = () => W.store.get("achievements", {});
  function check() {
    const e = earned();
    let changed = false;
    DEFS.forEach((d) => {
      if (!e[d.id] && d.test()) {
        e[d.id] = Date.now();
        changed = true;
        W.ui.toast(`🏅 Achievement unlocked: <b>${d.name}</b>`, "ok", 5000);
      }
    });
    if (changed) W.store.set("achievements", e);
  }
  return { DEFS, earned, check };
})();

W.misc = (() => {
  function renderProfile(view) {
    const e = W.achievements.earned();
    const streak = W.store.get("streak", { count: 1 });
    view.innerHTML = `
      <div class="cards">
        <div class="card stat"><div class="stat-label">Learning Streak</div><div class="stat-big">🔥 ${streak.count || 1} day${(streak.count || 1) > 1 ? "s" : ""}</div></div>
        <div class="card stat"><div class="stat-label">Assets Held</div><div class="stat-big">${W.portfolio.all().length}</div></div>
        <div class="card stat"><div class="stat-label">Transactions</div><div class="stat-big">${W.portfolio.txs().length}</div></div>
        <div class="card stat"><div class="stat-label">Badges</div><div class="stat-big">${Object.keys(e).length}/${W.achievements.DEFS.length}</div></div>
      </div>
      <div class="card"><h3>🏅 Achievements</h3><div class="badge-grid">
        ${W.achievements.DEFS.map((d) => `<div class="badge ${e[d.id] ? "earned" : ""}"><div class="badge-icon">${d.icon}</div><b>${d.name}</b><span class="muted small">${d.desc}</span>${e[d.id] ? `<span class="muted small">Earned ${W.fmt.date(e[d.id])}</span>` : ""}</div>`).join("")}
      </div></div>`;
  }

  function renderDefi(view) {
    const KEY = "defi";
    view.innerHTML = `
      <div class="card"><h3>💰 DeFi Tracker</h3><p class="muted small">Track staking, yield, farming and LP positions. Automatic on-chain position detection (via RPC + wallet) is on the Pro roadmap — meanwhile log positions manually (stored locally).</p></div>
      <div class="card"><h3>Manual Positions</h3><div id="defi-list"></div>
        <form id="defi-form" class="alert-form">
          <input name="proto" placeholder="Protocol (e.g. Lido)" required>
          <select name="type"><option>Staking</option><option>Yield</option><option>Farming</option><option>LP</option></select>
          <input name="amount" type="number" step="any" placeholder="Amount" required>
          <input name="apy" type="number" step="any" placeholder="APY %">
          <button class="btn primary">Add</button>
        </form>
      </div>`;
    const draw = () => {
      const l = W.store.get(KEY, []);
      view.querySelector("#defi-list").innerHTML = l.length
        ? `<div class="table-wrap"><table><thead><tr><th>Protocol</th><th>Type</th><th>Amount</th><th>APY</th><th></th></tr></thead><tbody>${l.map((d, i) => `<tr><td>${d.proto}</td><td><span class="tag">${d.type}</span></td><td>${d.amount}</td><td>${d.apy || "—"}%</td><td><button class="icon-btn" data-i="${i}">🗑️</button></td></tr>`).join("")}</tbody></table></div>`
        : '<p class="muted small">No positions yet.</p>';
      view.querySelectorAll("#defi-list [data-i]").forEach(
        (b) =>
          (b.onclick = () => {
            const l = W.store.get(KEY, []);
            l.splice(+b.dataset.i, 1);
            W.store.set(KEY, l);
            draw();
          }),
      );
    };
    draw();
    view.querySelector("#defi-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const l = W.store.get(KEY, []);
      l.push({
        proto: f.proto.value,
        type: f.type.value,
        amount: f.amount.value,
        apy: f.apy.value,
      });
      W.store.set(KEY, l);
      draw();
      f.reset();
    };
  }

  const DROPS = [
    {
      id: "testnet-1",
      name: "Layer-2 Testnet Season",
      kind: "Testnet",
      tasks: ["Bridge test tokens", "Swap on testnet DEX", "Mint a test NFT"],
    },
    {
      id: "points-1",
      name: "Points Program Grind",
      kind: "Points",
      tasks: ["Daily check-in", "Provide liquidity", "Refer a friend"],
    },
    {
      id: "retro-1",
      name: "Retroactive Hunt",
      kind: "Potential",
      tasks: [
        "Use mainnet dApps",
        "Keep positions active",
        "Vote in governance",
      ],
    },
  ];
  function renderAirdrops(view) {
    const KEY = "airdrops";
    const done = W.store.get(KEY, {});
    view.innerHTML = `
      <div class="card"><h3>🎯 Airdrop Hunter</h3><p class="muted small">Campaign checklists saved locally. Eligibility checker + rewards tracker ship with Pro. 🔒</p></div>
      <div class="grid-2">${DROPS.map((d) => {
        const dk = done[d.id] || [];
        return `<div class="card"><div class="drop-head"><h3>${d.name}</h3><span class="tag live">${d.kind}</span></div>
          <ul class="task-list">${d.tasks.map((t, i) => `<li><label><input type="checkbox" data-d="${d.id}" data-t="${i}" ${dk.includes(i) ? "checked" : ""}> ${t}</label></li>`).join("")}</ul>
          <div class="meter-bar"><div style="width:${(dk.length / d.tasks.length) * 100}%"></div></div>
        </div>`;
      }).join("")}
      </div>`;
    view.querySelectorAll("input[type=checkbox][data-d]").forEach(
      (cb) =>
        (cb.onchange = () => {
          const done = W.store.get(KEY, {});
          const arr = new Set(done[cb.dataset.d] || []);
          cb.checked ? arr.add(+cb.dataset.t) : arr.delete(+cb.dataset.t);
          done[cb.dataset.d] = [...arr];
          W.store.set(KEY, done);
          renderAirdrops(view);
        }),
    );
  }

  const PRO = [
    ["🐋", "Whale Wallet Tracker"],
    ["💸", "Smart Money Tracker"],
    ["⛓️", "On-chain Analytics"],
    ["🔓", "Token Unlock Calendar"],
    ["🧮", "Portfolio Optimizer"],
    ["🤖", "AI Trading Assistant"],
    ["🧾", "Tax Reports"],
    ["🔄", "Multi-device Sync"],
  ];
  function renderPro(view) {
    view.innerHTML = `
      <div class="pro-hero card"><h2>🔮 Weaver Pro</h2><p class="muted">Institutional-grade tools for serious traders.</p>
        <div class="pro-price"><b>$9</b><span class="muted">/month (planned)</span><button class="btn primary" onclick="W.ui.toast('Pro launches soon — you are on the list! ✨','ok')">Join Waitlist</button></div>
      </div>
      <div class="grid-2">${PRO.map(([i, n]) => `<div class="card pro-card"><span class="pro-ico">${i}</span><b>${n}</b><span class="tag lock">🔒 Pro</span></div>`).join("")}</div>`;
  }

  function renderSettings(view) {
    const s = W.store.get("settings", {});
    view.innerHTML = `
      <div class="card"><h3>⚙️ Settings</h3>
        <label>Currency<select id="set-cur">${["usd", "eur", "gbp", "inr", "jpy", "aud", "cad"].map((c) => `<option ${s.currency === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <label>Auto-refresh seconds (0 = off)<input id="set-refresh" type="number" min="0" value="${s.refresh ?? 60}"></label>
        <h3 class="mt">🤖 AI Assistant (optional)</h3>
        <p class="muted small">Plug in any OpenAI-compatible endpoint to power “Ask Weaver”. Without a key, Weaver answers with live on-chain data.</p>
        <label>API URL<input id="set-aiurl" placeholder="https://api.openai.com/v1/chat/completions" value="${s.aiUrl || ""}"></label>
        <label>API Key<input id="set-aikey" type="password" value="${s.aiKey || ""}"></label>
        <label>Model<input id="set-aimodel" placeholder="gpt-4o-mini" value="${s.aiModel || ""}"></label>
        <button class="btn primary mt" id="set-save">Save Settings</button>
        <button class="btn" id="set-tax">🧾 Export Tax Report (CSV)</button>
        <button class="btn" id="set-export">⬇ Export Backup (JSON)</button>
      </div>
      <div class="card"><h3>Your Data</h3>
        <button class="btn" id="set-export">⬇ Export Backup (JSON)</button>
        <button class="btn danger mt" id="set-wipe">🗑 Reset All Data</button>
      </div>`;

    view.querySelector("#set-tax").onclick = () => {
      const txs = W.portfolio.txs();
      if (!txs.length)
        return W.ui.toast(
          "No transactions to export. Record a buy/sell first!",
          "warn",
        );

      // Create CSV Headers
      let csv = "Date,Type,Coin,Symbol,Quantity,Price,Total\n";

      // Format Transactions
      txs.forEach((t) => {
        const date = new Date(t.date).toISOString().split("T")[0]; // YYYY-MM-DD
        const total = (t.qty * t.price).toFixed(2);
        csv += `${date},${t.type},${t.name},${t.symbol.toUpperCase()},${t.qty},${t.price},${total}\n`;
      });

      // Download File
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `weaver-tax-report-${new Date().getFullYear()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      W.ui.toast("Tax report downloaded 🧾", "ok");
    };
    view.querySelector("#set-save").onclick = () => {
      W.store.set("settings", {
        currency: view.querySelector("#set-cur").value,
        refresh: +view.querySelector("#set-refresh").value,
        aiUrl: view.querySelector("#set-aiurl").value.trim(),
        aiKey: view.querySelector("#set-aikey").value.trim(),
        aiModel: view.querySelector("#set-aimodel").value.trim(),
      });
      W.ui.toast("Settings saved ✓", "ok");
      W.applySettings();
    };
    view.querySelector("#set-export").onclick = () => {
      const data = {};
      [
        "portfolio",
        "transactions",
        "watchlist",
        "alerts",
        "settings",
        "learn",
        "achievements",
      ].forEach((k) => (data[k] = W.store.get(k)));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      a.download = "weaver-backup.json";
      a.click();
    };
    view.querySelector("#set-wipe").onclick = () =>
      W.ui.confirm("This deletes ALL Weaver data from this browser.", () => {
        W.store.clearAll();
        location.reload();
      });
  }

  return {
    renderProfile,
    renderSettings,
    renderPro,
    renderDefi,
    renderAirdrops,
  };
})();
