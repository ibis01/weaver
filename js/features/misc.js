// ================================================================
// js/features/misc.js – Miscellaneous Features
// ================================================================

window.W = window.W || {};

// ── Achievements Module ───────────────────────────────────
W.achievements = (() => {
  const DEFS = [
    {
      id: "first-coin",
      icon: "🌱",
      name: "First Thread",
      desc: "Add your first holding",
      test: () => (W.portfolio?.all().length || 0) >= 1,
    },
    {
      id: "five-coins",
      icon: "🧺",
      name: "Diversifier",
      desc: "Hold 5+ different assets",
      test: () => (W.portfolio?.all().length || 0) >= 5,
    },
    {
      id: "first-tx",
      icon: "↔️",
      name: "Trader",
      desc: "Record a buy/sell transaction",
      test: () => (W.portfolio?.txs().length || 0) >= 1,
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
      test: () =>
        !!W.store.get("web3_wallets", null)?.evm ||
        !!W.store.get("web3_wallets", null)?.sol,
    },
    {
      id: "journalist",
      icon: "📰",
      name: "Journalist",
      desc: "Read 10 news articles",
      test: () => W.store.get("news-read", []).length >= 10,
    },
    {
      id: "curator",
      icon: "🔖",
      name: "Curator",
      desc: "Save 5 articles to your Reading List",
      test: () => W.store.get("news-saved", []).length >= 5,
    },
    {
      id: "whale",
      icon: "🐋",
      name: "Whale Watcher",
      desc: "Track a whale wallet",
      test: () => W.store.get("whale-wallets", []).length >= 1,
    },
    {
      id: "optimizer",
      icon: "🧮",
      name: "Optimizer",
      desc: "Run the portfolio optimizer",
      test: () => !!W.store.get("optimizer-used", false),
    },
  ];

  const earned = () => W.store.get("achievements", {});
  const save = (e) => W.store.set("achievements", e);

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
    if (changed) save(e);
    return e;
  }

  return { DEFS, earned, save, check };
})();

// ── Misc UI ──────────────────────────────────────────────
W.misc = (() => {
  // ── Helpers ──────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Profile ─────────────────────────────────────────────
  function renderProfile(view) {
    const e = W.achievements.earned();
    const streak = W.portfolio?.getStreak?.() || { count: 1 };
    const holdings = W.portfolio?.all() || [];
    const txs = W.portfolio?.txs() || [];
    const alerts = W.store.get("alerts", []);

    view.innerHTML = `
      <div class="cards">
        <div class="card stat">
          <div class="stat-label">Learning Streak</div>
          <div class="stat-big">🔥 ${streak.count || 1} day${streak.count > 1 ? "s" : ""}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Assets Held</div>
          <div class="stat-big">${holdings.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Transactions</div>
          <div class="stat-big">${txs.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Badges</div>
          <div class="stat-big">${Object.keys(e).length}/${W.achievements.DEFS.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Alerts</div>
          <div class="stat-big">${alerts.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Articles Read</div>
          <div class="stat-big">📖 ${W.store.get("news-read", []).length}</div>
        </div>
      </div>
      <div class="card">
        <h3>🏅 Achievements</h3>
        <div class="badge-grid">
          ${W.achievements.DEFS.map(
            (d) => `
            <div class="badge ${e[d.id] ? "earned" : ""}">
              <div class="badge-icon">${d.icon}</div>
              <b>${escapeHTML(d.name)}</b>
              <span class="muted small">${escapeHTML(d.desc)}</span>
              ${e[d.id] ? `<span class="muted small">Earned ${W.fmt.date(e[d.id])}</span>` : ""}
            </div>
          `,
          ).join("")}
        </div>
      </div>
    `;
  }

  // ── DeFi Tracker ────────────────────────────────────────
  function renderDefi(view) {
    const KEY = "defi";
    const positions = W.store.get(KEY, []);

    view.innerHTML = `
      <div class="card">
        <h3>💰 DeFi Tracker</h3>
        <p class="muted small">Track staking, yield, farming and LP positions. Automatic on-chain detection ships with Pro — meanwhile log positions manually (stored locally).</p>
      </div>
      <div class="card">
        <h3>Manual Positions</h3>
        <div id="defi-list"></div>
        <form id="defi-form" class="alert-form">
          <input name="proto" placeholder="Protocol (e.g. Lido)" required>
          <select name="type">
            <option value="Staking">Staking</option>
            <option value="Yield">Yield</option>
            <option value="Farming">Farming</option>
            <option value="LP">LP</option>
          </select>
          <input name="amount" type="number" step="any" placeholder="Amount" required>
          <input name="apy" type="number" step="any" placeholder="APY %">
          <button class="btn primary">Add</button>
        </form>
      </div>
    `;

    const draw = () => {
      const list = W.store.get(KEY, []);
      const container = view.querySelector("#defi-list");
      if (!container) return;
      if (!list.length) {
        container.innerHTML = '<p class="muted small">No positions yet.</p>';
        return;
      }
      container.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Protocol</th><th>Type</th><th>Amount</th><th>APY</th><th></th></tr></thead>
            <tbody>
              ${list
                .map(
                  (d, i) => `
                <tr>
                  <td>${escapeHTML(d.proto)}</td>
                  <td><span class="tag">${escapeHTML(d.type)}</span></td>
                  <td>${d.amount}</td>
                  <td>${d.apy || "—"}%</td>
                  <td><button class="icon-btn" data-i="${i}">🗑️</button></td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
      container.querySelectorAll("[data-i]").forEach((btn) => {
        btn.onclick = () => {
          const list = W.store.get(KEY, []);
          list.splice(+btn.dataset.i, 1);
          W.store.set(KEY, list);
          draw();
        };
      });
    };
    draw();

    view.querySelector("#defi-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const list = W.store.get(KEY, []);
      list.push({
        proto: f.proto.value,
        type: f.type.value,
        amount: f.amount.value,
        apy: f.apy.value,
      });
      W.store.set(KEY, list);
      draw();
      f.reset();
    };
  }

  // ── Airdrop Hunter ──────────────────────────────────────
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
      <div class="card">
        <h3>🎯 Airdrop Hunter</h3>
        <p class="muted small">Campaign checklists saved locally. Eligibility checker + rewards tracker ship with Pro. 🔒</p>
      </div>
      <div class="grid-2">
        ${DROPS.map((d) => {
          const dk = done[d.id] || [];
          return `
            <div class="card">
              <div class="drop-head">
                <h3>${escapeHTML(d.name)}</h3>
                <span class="tag live">${escapeHTML(d.kind)}</span>
              </div>
              <ul class="task-list">
                ${d.tasks
                  .map(
                    (t, i) => `
                  <li>
                    <label>
                      <input type="checkbox" data-drop="${d.id}" data-task="${i}" ${dk.includes(i) ? "checked" : ""}>
                      ${escapeHTML(t)}
                    </label>
                  </li>
                `,
                  )
                  .join("")}
              </ul>
              <div class="meter-bar">
                <div style="width: ${(dk.length / d.tasks.length) * 100}%"></div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    view.querySelectorAll('input[type="checkbox"][data-drop]').forEach((cb) => {
      cb.onchange = () => {
        const done = W.store.get(KEY, {});
        const arr = new Set(done[cb.dataset.drop] || []);
        if (cb.checked) arr.add(+cb.dataset.task);
        else arr.delete(+cb.dataset.task);
        done[cb.dataset.drop] = [...arr];
        W.store.set(KEY, done);
        renderAirdrops(view);
      };
    });
  }

  // ── Pro ─────────────────────────────────────────────────
  const PRO_FEATURES = [
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
      <div class="card pro-hero">
        <h2>🔮 Weaver Pro</h2>
        <p class="muted">Institutional-grade tools for serious traders.</p>
        <div class="pro-price">
          <b>$9</b>
          <span class="muted">/month (planned)</span>
          <button class="btn primary" onclick="W.ui.toast('Pro launches soon — you are on the list! ✨','ok')">Join Waitlist</button>
        </div>
      </div>
      <div class="grid-2">
        ${PRO_FEATURES.map(
          ([icon, name]) => `
          <div class="card pro-card">
            <span class="pro-ico">${icon}</span>
            <b>${escapeHTML(name)}</b>
            <span class="tag lock">🔒 Pro</span>
          </div>
        `,
        ).join("")}
      </div>
    `;
  }

  // ── Settings ────────────────────────────────────────────
  function renderSettings(view) {
    const s = W.store.get("settings", {});
    const tg = s.telegram || {};
    const ai = s.ai || {};

    view.innerHTML = `
      <div class="card">
        <h3>⚙️ Settings</h3>
        <label>
          Currency
          <select id="set-cur">
            ${["usd", "eur", "gbp", "inr", "jpy", "aud", "cad"].map((c) => `<option ${s.currency === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </label>
        <label>
          Auto-refresh seconds (0 = off)
          <input id="set-refresh" type="number" min="0" value="${s.refresh ?? 60}">
        </label>
        <h3 class="mt">🤖 AI Assistant (optional)</h3>
        <p class="muted small">Plug in any OpenAI-compatible endpoint to power "Ask Weaver". Without a key, Weaver answers with live on-chain data.</p>
        <label>
          API URL
          <input id="set-aiurl" placeholder="https://api.openai.com/v1/chat/completions" value="${escapeHTML(ai.url || "")}">
        </label>
        <label>
          API Key
          <input id="set-aikey" type="password" value="${escapeHTML(ai.key || "")}">
        </label>
        <label>
          Model
          <input id="set-aimodel" placeholder="gpt-4o-mini" value="${escapeHTML(ai.model || "")}">
        </label>
        <button class="btn primary mt" id="set-save">Save Settings</button>
      </div>
      <div class="card">
        <h3>📨 Telegram Alerts (optional)</h3>
        <p class="muted small">Bot created via <b>@BotFather</b>, Chat ID from <b>@userinfobot</b>, and you've sent the bot one message. Alerts, triggers and new gems will ping your phone.</p>
        <label>
          Bot Token
          <input id="set-tgtoken" type="password" placeholder="123456789:AAF..." value="${escapeHTML(tg.token || "")}">
        </label>
        <label>
          Chat ID
          <input id="set-tgchat" placeholder="e.g. 7099096813" value="${escapeHTML(tg.chat || "")}">
        </label>
        <label class="small">
          <input type="checkbox" id="set-tgon" ${tg.on ? "checked" : ""} style="width:auto">
          Enable Telegram alerts
        </label>
        <div class="qa mt">
          <button class="btn" id="set-tgtest">📨 Send Test Message</button>
        </div>
      </div>
      <div class="card">
        <h3>Your Data</h3>
        <div class="qa">
          <button class="btn" id="set-tax">🧾 Export Tax Report (CSV)</button>
          <button class="btn" id="set-export">⬇ Export Backup (JSON)</button>
          <button class="btn danger" id="set-wipe">🗑 Reset All Data</button>
        </div>
      </div>
    `;

    view.querySelector("#set-save").onclick = () => {
      const settings = {
        currency: view.querySelector("#set-cur").value,
        refresh: +view.querySelector("#set-refresh").value,
        ai: {
          url: view.querySelector("#set-aiurl").value.trim(),
          key: view.querySelector("#set-aikey").value.trim(),
          model: view.querySelector("#set-aimodel").value.trim(),
        },
        telegram: {
          on: view.querySelector("#set-tgon").checked,
          token: view.querySelector("#set-tgtoken").value.trim(),
          chat: view.querySelector("#set-tgchat").value.trim(),
        },
      };
      W.store.set("settings", settings);
      W.ui.toast("Settings saved ✓", "ok");
      W.applySettings?.();
    };

    view.querySelector("#set-tgtest").onclick = async () => {
      const token = view.querySelector("#set-tgtoken").value.trim();
      const chat = view.querySelector("#set-tgchat").value.trim();
      if (!token || !chat)
        return W.ui.toast("Enter token and Chat ID first", "warn");
      if (!W.tg) return W.ui.toast("Telegram module not loaded", "warn");
      const ok = await W.tg.send(
        `✅ Weaver connected! Alerts will arrive here.`,
        { on: true, token, chat },
      );
      W.ui.toast(
        ok ? "Test sent 📨" : "Failed — check token/Chat ID",
        ok ? "ok" : "warn",
      );
    };

    view.querySelector("#set-tax").onclick = () => {
      const txs = W.portfolio?.txs() || [];
      if (!txs.length) return W.ui.toast("No transactions to export.", "warn");
      let csv = "Date,Type,Coin,Symbol,Quantity,Price,Total\n";
      txs.forEach((t) => {
        const date = new Date(t.date).toISOString().split("T")[0];
        csv += `${date},${t.type},${t.name},${t.symbol.toUpperCase()},${t.qty},${t.price},${(t.qty * t.price).toFixed(2)}\n`;
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      );
      a.download = `weaver-tax-report-${new Date().getFullYear()}.csv`;
      a.click();
      W.ui.toast("Tax report downloaded 🧾", "ok");
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
        "news-read",
        "news-saved",
      ].forEach((k) => (data[k] = W.store.get(k)));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      a.download = "weaver-backup.json";
      a.click();
    };

    view.querySelector("#set-wipe").onclick = () => {
      W.ui.confirm(
        "This deletes ALL Weaver data from this browser. Continue?",
        () => {
          W.store.clearAll();
          location.reload();
        },
      );
    };
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    renderProfile,
    renderSettings,
    renderPro,
    renderDefi,
    renderAirdrops,
  };
})();

console.log("[Misc] Module loaded.");
