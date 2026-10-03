// ================================================================
//  Miscellaneous Features 
// ================================================================


window.W = window.W || {};

const MISC_VERSION = "misc-v5";
const MISC_STORE_VERSION = 5;

// ── Shared helpers ─────────────────────────────────────────
(function installHelpers() {
  function esc(v) {
    if (v == null) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  Object.defineProperty(W, "miscEsc", {
    value: esc,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  function storeArray(key) {
    try {
      const v = W.store?.get?.(key, null);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  function storeObject(key) {
    try {
      const v = W.store?.get?.(key, null);
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }
  Object.defineProperty(W, "miscStoreArray", {
    value: storeArray,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(W, "miscStoreObject", {
    value: storeObject,
    writable: false,
    configurable: false,
  });

  function safeStoreSet(key, value) {
    try {
      W.store?.set?.(key, value);
      return true;
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "unknown";
      if (/quota/i.test(msg)) {
        try {
          W.ui?.toast?.(
            "Storage full — remove some data to continue.",
            "warn",
            6000,
          );
        } catch {
          /* toast failure is non-fatal */
        }
      } else {
        console.warn("[Misc] Store write failed for", key, msg);
      }
      return false;
    }
  }
  Object.defineProperty(W, "miscStoreSet", {
    value: safeStoreSet,
    writable: false,
    configurable: false,
  });

  function safeStoreDelete(key) {
    try {
      W.store?.delete?.(key);
      return true;
    } catch (e) {
      console.warn("[Misc] Store delete failed for", key, e && e.message);
      return false;
    }
  }
  Object.defineProperty(W, "miscStoreDelete", {
    value: safeStoreDelete,
    writable: false,
    configurable: false,
  });

  function safeSessionGet(key) {
    try {
      return W.secureSession?.get?.(key) || null;
    } catch (e) {
      console.warn("[Misc] secureSession read failed for", key, e && e.message);
      return null;
    }
  }
  Object.defineProperty(W, "miscSessionGet", {
    value: safeSessionGet,
    writable: false,
    configurable: false,
  });

  function canonText(v, maxLen) {
    if (v == null) return "";
    let s = String(v);
    try {
      s = s.normalize("NFC");
    } catch {
      /* very old engines */
    }
    s = s.replace(/[\u0000-\u0008\u000A-\u001F\u007F-\u009F]/g, "");
    s = s.trim();
    if (typeof maxLen === "number" && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }
  Object.defineProperty(W, "miscCanonText", {
    value: canonText,
    writable: false,
    configurable: false,
  });

  function deepFreeze(obj, seen) {
    if (obj == null || typeof obj !== "object") return obj;
    seen = seen || new WeakSet();
    if (seen.has(obj)) return obj;
    seen.add(obj);
    if (Object.isFrozen(obj)) return obj;
    Object.freeze(obj);
    for (const k of Object.keys(obj)) {
      try {
        deepFreeze(obj[k], seen);
      } catch {
        /* getter threw; leave as-is */
      }
    }
    return obj;
  }
  Object.defineProperty(W, "miscDeepFreeze", {
    value: deepFreeze,
    writable: false,
    configurable: false,
  });

  function isReservedKey(k) {
    return k === "__proto__" || k === "constructor" || k === "prototype";
  }
  Object.defineProperty(W, "miscIsReservedKey", {
    value: isReservedKey,
    writable: false,
    configurable: false,
  });

  try {
    const cur = W.store?.get?.("misc_version", null);
    if (cur !== MISC_STORE_VERSION) {
      W.miscStoreSet("misc_version", MISC_STORE_VERSION);
    }
  } catch {
    /* non-fatal */
  }
})();

// ── Achievements Module ───────────────────────────────────
W.achievements = (() => {
  const DEFS = W.miscDeepFreeze([
    {
      id: "first-coin",
      icon: "🌱",
      name: "First Thread",
      desc: "Add your first holding",
      test: () => (W.portfolio?.all?.()?.length || 0) >= 1,
    },
    {
      id: "five-coins",
      icon: "🧺",
      name: "Diversifier",
      desc: "Hold 5+ different assets",
      test: () => (W.portfolio?.all?.()?.length || 0) >= 5,
    },
    {
      id: "first-tx",
      icon: "↔️",
      name: "Trader",
      desc: "Record a buy/sell transaction",
      test: () => (W.portfolio?.txs?.()?.length || 0) >= 1,
    },
    {
      id: "first-alert",
      icon: "🚨",
      name: "Watchdog",
      desc: "Create a price alert",
      test: () => W.miscStoreArray("alerts").length >= 1,
    },
    {
      id: "student",
      icon: "🎓",
      name: "Student",
      desc: "Complete a lesson",
      test: () => {
        const l = W.miscStoreObject("learn");
        return Array.isArray(l.done) && l.done.length >= 1;
      },
    },
    {
      id: "web3",
      icon: "🔗",
      name: "Web3 Native",
      desc: "Connect a wallet",
      test: () => {
        const w = W.miscStoreObject("web3_wallets");
        return !!w.evm || !!w.sol;
      },
    },
    {
      id: "journalist",
      icon: "📰",
      name: "Journalist",
      desc: "Read 10 news articles",
      test: () => W.miscStoreArray("news-read").length >= 10,
    },
    {
      id: "curator",
      icon: "🔖",
      name: "Curator",
      desc: "Save 5 articles to your Reading List",
      test: () => W.miscStoreArray("news-saved").length >= 5,
    },
    // v5: test both keys. If the whale tracker writes to either one,
    // the achievement fires. Removing this ambiguity means the
    // achievement matches whichever module the app actually ships.
    {
      id: "whale",
      icon: "🐋",
      name: "Whale Watcher",
      desc: "Track a whale wallet",
      test: () =>
        W.miscStoreArray("whale-wallets").length >= 1 ||
        W.miscStoreArray("whale_alerts").length >= 1,
    },
    {
      id: "optimizer",
      icon: "🧮",
      name: "Optimizer",
      desc: "Run the portfolio optimizer",
      test: () => W.store?.get?.("optimizer-used", false) === true,
    },
  ]);

  const _internal = W.miscStoreObject("achievements");

  function earned() {
    const out = Object.create(null);
    for (const k of Object.keys(_internal)) {
      if (W.miscIsReservedKey(k)) continue;
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(k)) continue;
      const v = Number(_internal[k]);
      if (Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  }

  function save(e) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return;
    const clean = Object.create(null);
    for (const k of Object.keys(e)) {
      if (W.miscIsReservedKey(k)) continue;
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(k)) continue;
      const v = Number(e[k]);
      if (Number.isFinite(v) && v > 0) clean[k] = v;
    }
    W.miscStoreSet("achievements", clean);
    for (const k of Object.keys(clean)) {
      if (!W.miscIsReservedKey(k)) _internal[k] = clean[k];
    }
  }

  function check() {
    const snapshot = earned();
    const unlocked = [];
    for (const d of DEFS) {
      if (snapshot[d.id]) continue;
      let hit = false;
      try {
        hit = d.test() === true;
      } catch {
        hit = false;
      }
      if (hit) {
        snapshot[d.id] = Date.now();
        unlocked.push(d);
      }
    }
    if (!unlocked.length) return earned();
    save(snapshot);
    try {
      if (unlocked.length === 1) {
        const safeName = W.miscEsc(String(unlocked[0].name || ""));
        W.ui?.toast?.(
          `🏅 Achievement unlocked: <b>${safeName}</b>`,
          "ok",
          5000,
        );
      } else {
        const names = unlocked
          .map((d) => W.miscEsc(String(d.name || "")))
          .join(", ");
        W.ui?.toast?.(
          `🏅 ${unlocked.length} achievements unlocked: <b>${names}</b>`,
          "ok",
          6000,
        );
      }
    } catch {
      /* toast failure is non-fatal */
    }
    return earned();
  }

  return W.miscDeepFreeze({ DEFS, earned, save, check });
})();

// ── Misc UI ──────────────────────────────────────────────
W.misc = (() => {
  const esc = W.miscEsc;
  const canonText = W.miscCanonText;

  const LIMITS = Object.freeze({
    proto: 64,
    amount: 32,
    apy: 12,
    aiUrl: 500,
    aiKey: 200,
    aiModel: 100,
    tgToken: 100,
    tgChat: 32,
    sentryDsn: 500,
    maxDefiPositions: 500,
  });

  // ── Shared key lists ──────────────────────────────────
  // Single source of truth for what gets exported and imported.
  // Both `whale_alerts` and `whale-wallets` are included so the
  // backup covers whichever key the whale tracker module uses.
  const ARRAY_KEYS = Object.freeze([
    "portfolio",
    "transactions",
    "watchlist",
    "alerts",
    "news-read",
    "news-saved",
    "whale_alerts",
    "whale-wallets",
    "defi",
  ]);
  const OBJECT_KEYS = Object.freeze([
    "learn",
    "achievements",
    "wallet_cost_basis",
    "airdrops",
  ]);

  let _renderGen = 0;
  let _saving = false;
  let _testing = false;

  // v5: passphrase-declined flag persisted in sessionStorage so the
  // auto-prompt does not reappear on every navigation. Cleared when
  // the tab closes. Explicit Unlock/Lock clicks override it.
  const PROMPT_DECLINED_KEY = "misc_settings_prompt_declined";

  function isPromptDeclined() {
    try {
      return sessionStorage.getItem(PROMPT_DECLINED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setPromptDeclined(v) {
    try {
      if (v) sessionStorage.setItem(PROMPT_DECLINED_KEY, "1");
      else sessionStorage.removeItem(PROMPT_DECLINED_KEY);
    } catch {
      /* storage unavailable; prompt shows every time, which is
                 the safest default for that environment */
    }
  }

  // ── Defi ─────────────────────────────────────────────
  const DEFI_KEY = "defi";
  const DEFI_TYPES = Object.freeze(["Staking", "Yield", "Farming", "LP"]);
  const DEFI_TYPES_SET = new Set(DEFI_TYPES);
  const DEFI_PROTO_RE = /^[\w .\-()&/]{1,64}$/;

  function defiList() {
    const raw = W.miscStoreArray(DEFI_KEY);
    const out = [];
    for (const d of raw) {
      if (!d || typeof d !== "object" || Array.isArray(d)) continue;
      if (typeof d.proto !== "string" || !DEFI_PROTO_RE.test(d.proto)) continue;
      if (typeof d.type !== "string" || !DEFI_TYPES_SET.has(d.type)) continue;
      const amt = Number(d.amount);
      if (!Number.isFinite(amt) || amt <= 0 || amt > 1e15) continue;
      let apy = null;
      if (d.apy != null) {
        const n = Number(d.apy);
        if (Number.isFinite(n) && n >= 0 && n <= 100000) apy = n;
      }
      out.push({ proto: d.proto, type: d.type, amount: amt, apy });
    }
    return out;
  }

  function defiWrite(list) {
    const clean = [];
    for (const d of list) {
      if (!d || typeof d !== "object") continue;
      if (typeof d.proto !== "string" || !DEFI_PROTO_RE.test(d.proto)) continue;
      if (typeof d.type !== "string" || !DEFI_TYPES_SET.has(d.type)) continue;
      const amt = Number(d.amount);
      if (!Number.isFinite(amt) || amt <= 0 || amt > 1e15) continue;
      let apy = null;
      if (d.apy != null) {
        const n = Number(d.apy);
        if (Number.isFinite(n) && n >= 0 && n <= 100000) apy = n;
      }
      clean.push({ proto: d.proto, type: d.type, amount: amt, apy });
    }
    const capped = clean.slice(-LIMITS.maxDefiPositions);
    W.miscStoreSet(DEFI_KEY, capped);
    return capped;
  }

  // ── Profile ─────────────────────────────────────────────
  function renderProfile(view) {
    const e = W.achievements.earned();
    const streak = W.portfolio?.getStreak?.() || { count: 1 };
    const streakN = Number(streak.count);
    const streakSafe = Number.isFinite(streakN) && streakN > 0 ? streakN : 1;
    const holdings = W.portfolio?.all?.() || [];
    const txs = W.portfolio?.txs?.() || [];

    let alertsCount = 0;
    try {
      if (W.alerts && typeof W.alerts.list === "function") {
        alertsCount = W.alerts.list().length;
      } else {
        alertsCount = W.miscStoreArray("alerts").length;
      }
    } catch {
      alertsCount = W.miscStoreArray("alerts").length;
    }

    const readCount = W.miscStoreArray("news-read").length;
    const earnedCount = Object.keys(e).length;
    const totalDefs = W.achievements.DEFS.length;

    view.innerHTML = `
      <div class="cards">
        <div class="card stat">
          <div class="stat-label">Learning Streak</div>
          <div class="stat-big">🔥 ${esc(streakSafe)} day${streakSafe > 1 ? "s" : ""}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Assets Held</div>
          <div class="stat-big">${esc(holdings.length)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Transactions</div>
          <div class="stat-big">${esc(txs.length)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Badges</div>
          <div class="stat-big">${esc(earnedCount)}/${esc(totalDefs)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Alerts</div>
          <div class="stat-big">${esc(alertsCount)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Articles Read</div>
          <div class="stat-big">📖 ${esc(readCount)}</div>
        </div>
      </div>
      <div class="card">
        <h3>🏅 Achievements</h3>
        <div class="badge-grid">
          ${W.achievements.DEFS.map(
            (d) => `
            <div class="badge ${e[d.id] ? "earned" : ""}">
              <div class="badge-icon">${esc(d.icon)}</div>
              <b>${esc(d.name)}</b>
              <span class="muted small">${esc(d.desc)}</span>
              ${e[d.id] && W.fmt?.date ? `<span class="muted small">Earned ${esc(W.fmt.date(e[d.id]))}</span>` : ""}
            </div>
          `,
          ).join("")}
        </div>
      </div>
    `;
  }

  // ── DeFi Tracker ────────────────────────────────────────
  function renderDefi(view) {
    view.innerHTML = `
      <div class="card">
        <h3>💰 DeFi Tracker</h3>
        <p class="muted small">Track staking, yield, farming and LP positions. Automatic on-chain detection ships with Pro — meanwhile log positions manually (stored locally).</p>
      </div>
      <div class="card">
        <h3>Manual Positions</h3>
        <div id="defi-list"></div>
        <form id="defi-form" class="alert-form" autocomplete="off">
          <input name="proto" placeholder="Protocol (e.g. Lido)" required maxlength="${LIMITS.proto}">
          <select name="type">
            ${DEFI_TYPES.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}
          </select>
          <input name="amount" type="number" step="any" min="0" placeholder="Amount" required maxlength="${LIMITS.amount}">
          <input name="apy" type="number" step="any" min="0" max="100000" placeholder="APY %" maxlength="${LIMITS.apy}">
          <button class="btn primary">Add</button>
        </form>
      </div>
    `;

    const draw = () => {
      const list = defiList();
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
                  <td>${esc(d.proto)}</td>
                  <td><span class="tag">${esc(d.type)}</span></td>
                  <td>${esc(d.amount)}</td>
                  <td>${d.apy == null ? "—" : esc(d.apy) + "%"}</td>
                  <td><button class="icon-btn" data-i="${esc(i)}" aria-label="Remove position">🗑️</button></td>
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
          const idx = parseInt(btn.dataset.i, 10);
          if (!Number.isInteger(idx) || idx < 0) return;
          const current = defiList();
          if (idx >= current.length) return;
          current.splice(idx, 1);
          defiWrite(current);
          draw();
        };
      });
    };
    draw();

    view.querySelector("#defi-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;

      const proto = canonText(f.proto.value, LIMITS.proto);
      if (!proto || !DEFI_PROTO_RE.test(proto)) {
        return W.ui?.toast?.("Invalid protocol name.", "warn");
      }
      const type = canonText(f.type.value, 16);
      if (!DEFI_TYPES_SET.has(type)) {
        return W.ui?.toast?.("Invalid position type.", "warn");
      }
      const amount = Number(f.amount.value);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e15) {
        return W.ui?.toast?.("Amount must be a positive number.", "warn");
      }
      const apyRaw = canonText(f.apy.value, LIMITS.apy);
      let apy = null;
      if (apyRaw) {
        const n = Number(apyRaw);
        if (!Number.isFinite(n) || n < 0 || n > 100000) {
          return W.ui?.toast?.("APY must be between 0 and 100000.", "warn");
        }
        apy = n;
      }

      const list = defiList();
      list.push({ proto, type, amount, apy });
      defiWrite(list);
      draw();
      f.reset();
    };
  }

  // ── Airdrop Hunter ──────────────────────────────────────
  const DROPS = W.miscDeepFreeze([
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
  ]);

  function airdropDone() {
    const raw = W.miscStoreObject("airdrops");
    const out = Object.create(null);
    for (const d of DROPS) {
      const arr = raw[d.id];
      if (Array.isArray(arr)) {
        out[d.id] = arr
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v >= 0 && v < d.tasks.length);
      } else {
        out[d.id] = [];
      }
    }
    return out;
  }

  function airdropWrite(done) {
    const safe = Object.create(null);
    for (const d of DROPS) {
      const arr = done?.[d.id];
      safe[d.id] = Array.isArray(arr)
        ? arr
            .map((v) => Number(v))
            .filter((v) => Number.isInteger(v) && v >= 0 && v < d.tasks.length)
        : [];
    }
    W.miscStoreSet("airdrops", safe);
    return safe;
  }

  function renderAirdrops(view) {
    const done = airdropDone();

    view.innerHTML = `
      <div class="card">
        <h3>🎯 Airdrop Hunter</h3>
        <p class="muted small">Campaign checklists saved locally. Eligibility checker + rewards tracker ship with Pro. 🔒</p>
      </div>
      <div class="grid-2">
        ${DROPS.map((d) => {
          const dk = done[d.id] || [];
          const pct =
            d.tasks.length > 0
              ? Math.max(0, Math.min(100, (dk.length / d.tasks.length) * 100))
              : 0;
          return `
            <div class="card">
              <div class="drop-head">
                <h3>${esc(d.name)}</h3>
                <span class="tag live">${esc(d.kind)}</span>
              </div>
              <ul class="task-list">
                ${d.tasks
                  .map(
                    (t, i) => `
                  <li>
                    <label>
                      <input type="checkbox" data-drop="${esc(d.id)}" data-task="${esc(i)}" ${dk.includes(i) ? "checked" : ""}>
                      ${esc(t)}
                    </label>
                  </li>
                `,
                  )
                  .join("")}
              </ul>
              <div class="meter-bar">
                <div class="progress-fill" data-width="${esc(pct.toFixed(1))}"></div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    view.querySelectorAll("[data-width]").forEach((el) => {
      const w = Number(el.dataset.width);
      if (Number.isFinite(w)) el.style.width = `${w}%`;
    });

    function updateProgress(dropId) {
      const dropDef = DROPS.find((x) => x.id === dropId);
      if (!dropDef) return;
      const done = airdropDone();
      const dk = done[dropId] || [];
      const pct =
        dropDef.tasks.length > 0
          ? Math.max(0, Math.min(100, (dk.length / dropDef.tasks.length) * 100))
          : 0;
      const bar = view
        .querySelector(`input[data-drop="${CSS.escape(dropId)}"]`)
        ?.closest(".card")
        ?.querySelector("[data-width]");
      if (bar) bar.style.width = `${pct.toFixed(1)}%`;
    }

    view.querySelectorAll('input[type="checkbox"][data-drop]').forEach((cb) => {
      cb.onchange = () => {
        const dropId = cb.dataset.drop;
        const taskIdx = parseInt(cb.dataset.task, 10);
        const dropDef = DROPS.find((x) => x.id === dropId);
        if (
          !dropDef ||
          !Number.isInteger(taskIdx) ||
          taskIdx < 0 ||
          taskIdx >= dropDef.tasks.length
        )
          return;
        const done = airdropDone();
        const set = new Set(done[dropId] || []);
        if (cb.checked) set.add(taskIdx);
        else set.delete(taskIdx);
        done[dropId] = [...set].sort((a, b) => a - b);
        airdropWrite(done);
        updateProgress(dropId);
      };
    });
  }

  // ── Pro ─────────────────────────────────────────────────
  const PRO_FEATURES = W.miscDeepFreeze([
    ["🐋", "Whale Wallet Tracker"],
    ["💸", "Smart Money Tracker"],
    ["⛓️", "On-chain Analytics"],
    ["🔓", "Token Unlock Calendar"],
    ["🧮", "Portfolio Optimizer"],
    ["🤖", "AI Trading Assistant"],
    ["🧾", "Tax Reports"],
    ["🔄", "Multi-device Sync"],
  ]);

  function renderPro(view) {
    view.innerHTML = `
      <div class="card pro-hero">
        <h2>🔮 Weaver Pro</h2>
        <p class="muted">Institutional-grade tools for serious traders.</p>
        <div class="pro-price">
          <b>$9</b>
          <span class="muted">/month (planned)</span>
          <button class="btn primary" data-action="join-waitlist">Join Waitlist</button>
        </div>
      </div>
      <div class="grid-2">
        ${PRO_FEATURES.map(
          ([icon, name]) => `
          <div class="card pro-card">
            <span class="pro-ico">${esc(icon)}</span>
            <b>${esc(name)}</b>
            <span class="tag lock">🔒 Pro</span>
          </div>
        `,
        ).join("")}
      </div>
    `;
    const waitlistBtn = view.querySelector('[data-action="join-waitlist"]');
    if (waitlistBtn) {
      waitlistBtn.onclick = () =>
        W.ui?.toast?.("Pro launches soon — you are on the list! ✨", "ok");
    }
  }

  // ── Passphrase Helpers ─────────────────────────────────
  // Prompts for a passphrase. The value returned to the caller is
  // used immediately (as an argument to saveWithPassphrase/unlock)
  // and is never cached by this module — W.secureSession owns the
  // in-memory caching and never exposes the passphrase itself.
  async function promptPassphrase() {
    return W.ui.promptPassword({
      title: "Unlock API Keys",
      message:
        "Enter your passphrase to access API keys (leave blank to skip encryption).",
      confirmLabel: "Unlock",
      minLength: 12,
    });
  }

  function clearPassphrase() {
    W.secureSession?.lock?.();
  }

  // ── Sentry DSN validation ──────────────────────────────
  function isValidDsn(v) {
    if (!v) return true;
    if (typeof v !== "string" || v.length > LIMITS.sentryDsn) return false;
    let u;
    try {
      u = new URL(v);
    } catch {
      return false;
    }
    if (u.protocol !== "https:") return false;
    if (!u.username) return false;
    if (!u.pathname || u.pathname === "/") return false;
    if (!u.hostname || u.hostname.length < 4) return false;
    return true;
  }

  // ── Settings ────────────────────────────────────────────
  async function renderSettings(view, opts = {}) {
    const gen = ++_renderGen;
    // v5: decline state now persists across page reloads via
    // sessionStorage. Explicit clicks still override it.
    const skipPrompt = opts.skipPrompt === true || isPromptDeclined();

    const settings = W.miscStoreObject("settings");
    let sensitive = null;
    let wasUnlocked = false;

    const currencyRaw = String(settings.currency || "usd").toLowerCase();
    const currency = ["usd", "eur", "gbp", "inr", "jpy", "aud", "cad"].includes(
      currencyRaw,
    )
      ? currencyRaw
      : "usd";
    const refreshRaw = Number(settings.refresh);
    const refresh = Number.isFinite(refreshRaw)
      ? Math.max(0, Math.min(3600, Math.floor(refreshRaw)))
      : 60;
    const sentryDsnSafe = isValidDsn(settings.sentryDsn)
      ? String(settings.sentryDsn || "").slice(0, LIMITS.sentryDsn)
      : "";

    let encryptedBlob = null;
    try {
      encryptedBlob = W.store?.get?.("encrypted_settings", null);
    } catch (e) {
      console.warn("[Misc] Encrypted settings read failed:", e && e.message);
    }

    if (encryptedBlob) {
      if (W.secureSession?.isUnlocked?.()) {
        wasUnlocked = true;
        sensitive = {
          ai: W.miscSessionGet("ai") || {},
          telegram: W.miscSessionGet("telegram") || {},
        };
        settings.ai = sensitive.ai;
        settings.telegram = sensitive.telegram;
      } else if (!skipPrompt) {
        const passphrase = await promptPassphrase();
        if (gen !== _renderGen || !view.isConnected) return;
        if (passphrase) {
          try {
            sensitive = await W.secureSession.unlock(passphrase);
            if (gen !== _renderGen || !view.isConnected) return;
            wasUnlocked = true;
            settings.ai = sensitive.ai || {};
            settings.telegram = sensitive.telegram || {};
            // v5: user actively unlocked; clear the declined flag so
            // the auto-prompt resumes on a future lock.
            setPromptDeclined(false);
          } catch (e) {
            W.ui?.toast?.(
              "Incorrect passphrase or corrupted data. API keys will not be shown.",
              "warn",
            );
            settings.ai = { url: "", key: "", model: "" };
            settings.telegram = { on: false, token: "", chat: "" };
          }
        } else {
          // v5: persist the decline across navigations and reloads.
          setPromptDeclined(true);
          settings.ai = { url: "", key: "", model: "" };
          settings.telegram = { on: false, token: "", chat: "" };
        }
      } else {
        settings.ai = { url: "", key: "", model: "" };
        settings.telegram = { on: false, token: "", chat: "" };
      }
    }

    const tg = settings.telegram || {};
    const ai = settings.ai || {};

    view.innerHTML = `
      <div class="card">
        <h3>⚙️ Settings</h3>
        <label>
          Currency
          <select id="set-cur">
            ${["usd", "eur", "gbp", "inr", "jpy", "aud", "cad"]
              .map(
                (c) =>
                  `<option value="${esc(c)}" ${currency === c ? "selected" : ""}>${esc(c)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>
          Auto-refresh seconds (0 = off)
          <input id="set-refresh" type="number" min="0" max="3600" value="${esc(refresh)}">
        </label>
        <h3 class="mt">🩺 Error Reporting (optional)</h3>
        <p class="muted small">Add a Sentry DSN to get crash/error reports if something breaks for you. DSNs are safe to store in plain text — they only allow sending error reports, not reading any data.</p>
        <label>
          Sentry DSN
          <input id="set-sentrydsn" placeholder="https://abc123@o000000.ingest.sentry.io/000000" value="${esc(sentryDsnSafe)}" maxlength="${LIMITS.sentryDsn}" autocomplete="off">
        </label>
        <h3 class="mt">🤖 AI Assistant (optional)</h3>
        <p class="muted small">Plug in any OpenAI-compatible endpoint to power "Ask Weaver". Without a key, Weaver answers with live on-chain data.</p>
        <label>
          API URL
          <input id="set-aiurl" placeholder="https://api.openai.com/v1/chat/completions" value="${esc(ai.url || "")}" maxlength="${LIMITS.aiUrl}" autocomplete="off">
        </label>
        <label>
          API Key
          <input id="set-aikey" type="password" value="${esc(ai.key || "")}" maxlength="${LIMITS.aiKey}" autocomplete="new-password" spellcheck="false">
        </label>
        <label>
          Model
          <input id="set-aimodel" placeholder="gpt-4o-mini" value="${esc(ai.model || "")}" maxlength="${LIMITS.aiModel}" autocomplete="off">
        </label>
        <button class="btn primary mt" id="set-save">Save Settings</button>
        <button class="btn ghost mt${encryptedBlob ? "" : " hidden"}" id="set-unlock">🔓 Unlock Keys</button>
        <button class="btn ghost mt${W.secureSession?.isUnlocked?.() ? "" : " hidden"}" id="set-lock">🔒 Lock Keys</button>
      </div>
      <div class="card">
        <h3>📨 Telegram Alerts (optional)</h3>
        <p class="muted small">Bot created via <b>@BotFather</b>, Chat ID from <b>@userinfobot</b>, and you've sent the bot one message. Alerts, triggers and new gems will ping your phone.</p>
        <label>
          Bot Token
          <input id="set-tgtoken" type="password" placeholder="123456789:AAF..." value="${esc(tg.token || "")}" maxlength="${LIMITS.tgToken}" autocomplete="new-password" spellcheck="false">
        </label>
        <label>
          Chat ID
          <input id="set-tgchat" placeholder="e.g. 7099096813" value="${esc(tg.chat || "")}" maxlength="${LIMITS.tgChat}" autocomplete="off">
        </label>
        <label class="small">
          <input type="checkbox" id="set-tgon" ${tg.on ? "checked" : ""} class="w-auto">
          Enable Telegram alerts
        </label>
        <div class="qa mt">
          <button class="btn" id="set-tgtest">📨 Send Test Message</button>
        </div>
      </div>
      <div class="card">
        <h3>🔐 Vault</h3>
        <p class="muted small">
          Encrypt your portfolio, watchlist, transactions, journal,
          and other sensitive data with a passphrase. If you forget
          it, the encrypted data cannot be recovered.
        </p>
        ${
          W.vault && W.vault.hasStoredVault && W.vault.hasStoredVault()
            ? `<button class="btn ghost" id="vault-lock" type="button">🔒 Lock Now</button>
               <p class="muted small mt-8">Vault is ${W.vault.isUnlocked() ? "unlocked" : "locked"} for this session.</p>`
            : `<button class="btn primary" id="vault-enable" type="button">Enable Vault</button>`
        }
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

    // ── Save handler ──────────────────────────────────────
    view.querySelector("#set-save").onclick = async () => {
      if (_saving) return;
      _saving = true;
      const saveBtn = view.querySelector("#set-save");
      if (saveBtn) saveBtn.disabled = true;
      try {
        const aiSettings = {
          url: canonText(view.querySelector("#set-aiurl").value, LIMITS.aiUrl),
          key: canonText(view.querySelector("#set-aikey").value, LIMITS.aiKey),
          model: canonText(
            view.querySelector("#set-aimodel").value,
            LIMITS.aiModel,
          ),
        };
        const tgSettings = {
          on: view.querySelector("#set-tgon").checked === true,
          token: canonText(
            view.querySelector("#set-tgtoken").value,
            LIMITS.tgToken,
          ),
          chat: canonText(
            view.querySelector("#set-tgchat").value,
            LIMITS.tgChat,
          ),
        };

        const refreshInput = Number(view.querySelector("#set-refresh").value);
        const refreshVal = Number.isFinite(refreshInput)
          ? Math.max(0, Math.min(3600, Math.floor(refreshInput)))
          : 60;

        const dsnRaw = canonText(
          view.querySelector("#set-sentrydsn").value,
          LIMITS.sentryDsn,
        );
        if (!isValidDsn(dsnRaw)) {
          W.ui?.toast?.(
            "Sentry DSN must be a valid https:// URL (or leave blank).",
            "warn",
          );
          return;
        }

        const hasSensitive = !!(aiSettings.key || tgSettings.token);

        const nonSensitive = {
          currency: view.querySelector("#set-cur").value,
          refresh: refreshVal,
          sentryDsn: dsnRaw,
        };

        if (hasSensitive) {
          const payload = { ai: aiSettings, telegram: tgSettings };
          let passphrase = null;
          if (!W.secureSession.isUnlocked()) {
            passphrase = await promptPassphrase();
            if (gen !== _renderGen || !view.isConnected) return;
            if (!passphrase) {
              W.miscStoreSet("settings", nonSensitive);
              W.ui?.toast?.(
                "Non-sensitive settings saved. Passphrase required to update API keys.",
                "info",
              );
              renderSettings(view, { skipPrompt: true });
              return;
            }
          }
          try {
            if (passphrase) {
              await W.secureSession.saveWithPassphrase(payload, passphrase);
            } else {
              await W.secureSession.save(payload);
            }
            if (gen !== _renderGen || !view.isConnected) return;
            W.miscStoreSet("settings", nonSensitive);
            // v5: user just actively used a passphrase; make sure the
            // auto-prompt is allowed again on a future lock.
            setPromptDeclined(false);
            W.ui?.toast?.("Settings saved (sensitive data encrypted) ✓", "ok");
          } catch (e) {
            W.ui?.toast?.(`Save failed: ${e.message}`, "warn");
          }
        } else {
          if (!encryptedBlob) {
            W.miscStoreSet("settings", nonSensitive);
            W.ui?.toast?.("Settings saved ✓", "ok");
          } else if (wasUnlocked) {
            W.secureSession?.clear?.();
            W.miscStoreSet("settings", nonSensitive);
            W.ui?.toast?.("Settings saved (encrypted keys removed) ✓", "ok");
          } else {
            W.miscStoreSet("settings", nonSensitive);
            W.ui?.toast?.(
              "Non-sensitive settings saved. Encrypted keys preserved.",
              "info",
            );
          }
        }
        if (gen === _renderGen && view.isConnected) {
          renderSettings(view, { skipPrompt: isPromptDeclined() });
        }
      } finally {
        _saving = false;
        const b = view.querySelector("#set-save");
        if (b) b.disabled = false;
      }
    };

    // ── Unlock handler ─────────────────────────────────────
    view.querySelector("#set-unlock").onclick = async () => {
      // v5: explicit unlock request overrides any prior decline.
      setPromptDeclined(false);
      const pwd = await promptPassphrase();
      if (gen !== _renderGen || !view.isConnected) return;
      if (pwd) {
        try {
          await W.secureSession.unlock(pwd);
          if (gen !== _renderGen || !view.isConnected) return;
          renderSettings(view);
          W.ui?.toast?.("Passphrase stored for this session.", "ok");
        } catch (e) {
          W.ui?.toast?.(`Unlock failed: ${e.message}`, "warn");
        }
      }
    };

    // ── Lock handler ───────────────────────────────────────
    view.querySelector("#set-lock").onclick = () => {
      clearPassphrase();
      // v5: explicit lock is a user instruction to stop being asked.
      // Set the declined flag so the auto-prompt does not nag until
      // the user clicks Unlock again.
      setPromptDeclined(true);
      renderSettings(view, { skipPrompt: true });
      W.ui?.toast?.("Keys locked.", "info");
    };

    // ── Telegram test ─────────────────────────────────────
    const vaultEnable = view.querySelector("#vault-enable");
    if (vaultEnable) {
      vaultEnable.onclick = async () => {
        const pw = await W.ui.promptPassword({
          title: "Enable Vault",
          message:
            "Choose a passphrase (min 12 chars). Your sensitive data will be encrypted with it. If you forget it, the data cannot be recovered.",
          confirmLabel: "Enable Vault",
          minLength: 12,
        });
        if (!pw) return;
        try {
          await W.vault.setup(pw);
          const result = await W.vault.migrateKeys([...W.vault.VAULT_KEYS]);
          W.ui.toast(
            `Vault enabled. Migrated ${result.migrated.length} key(s).`,
            "ok",
          );
          setTimeout(() => location.reload(), 800);
        } catch (e) {
          W.ui.toast(
            "Vault setup failed: " + (e && e.message ? e.message : "unknown"),
            "warn",
          );
        }
      };
    }
    const vaultLock = view.querySelector("#vault-lock");
    if (vaultLock) {
      vaultLock.onclick = () => {
        if (W.vault && W.vault.lock) W.vault.lock();
      };
    }

    view.querySelector("#set-tgtest").onclick = async () => {
      if (_testing) return;
      _testing = true;
      const btn = view.querySelector("#set-tgtest");
      if (btn) btn.disabled = true;
      try {
        const token = canonText(
          view.querySelector("#set-tgtoken").value,
          LIMITS.tgToken,
        );
        const chat = canonText(
          view.querySelector("#set-tgchat").value,
          LIMITS.tgChat,
        );
        if (!token || !chat)
          return W.ui?.toast?.("Enter token and Chat ID first", "warn");
        if (!W.tg) return W.ui?.toast?.("Telegram module not loaded", "warn");
        const ok = await W.tg.send(
          `✅ Weaver connected! Alerts will arrive here.`,
          { token, chatId: chat },
        );
        if (gen !== _renderGen || !view.isConnected) return;
        W.ui?.toast?.(
          ok ? "Test sent 📨" : "Failed — check token/Chat ID",
          ok ? "ok" : "warn",
        );
      } finally {
        _testing = false;
        const b = view.querySelector("#set-tgtest");
        if (b) b.disabled = false;
      }
    };

    function csvCell(v) {
      let s = v == null ? "" : String(v);
      s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }

    view.querySelector("#set-tax").onclick = () => {
      const txs = W.portfolio?.txs?.() || [];
      if (!txs.length)
        return W.ui?.toast?.("No transactions to export.", "warn");
      const header = [
        "Date",
        "Type",
        "Coin",
        "Symbol",
        "Quantity",
        "Price",
        "Total",
      ].join(",");
      const lines = [header];
      const limit = Math.min(txs.length, 100000);
      for (let i = 0; i < limit; i++) {
        const t = txs[i];
        let date = "";
        try {
          const d = new Date(t.date);
          if (!isNaN(d.getTime())) date = d.toISOString().split("T")[0];
        } catch {
          date = "";
        }
        const qty = Number(t.qty);
        const price = Number(t.price);
        const total =
          Number.isFinite(qty) && Number.isFinite(price)
            ? (qty * price).toFixed(2)
            : "";
        lines.push(
          [
            csvCell(date),
            csvCell(t.type),
            csvCell(t.name),
            csvCell(String(t.symbol || "").toUpperCase()),
            csvCell(Number.isFinite(qty) ? qty : ""),
            csvCell(Number.isFinite(price) ? price : ""),
            csvCell(total),
          ].join(","),
        );
      }
      const csv = "\uFEFF" + lines.join("\r\n");
      downloadBlob(
        csv,
        "text/csv;charset=utf-8;",
        `weaver-tax-report-${new Date().getFullYear()}.csv`,
      );
      W.ui?.toast?.("Tax report downloaded 🧾", "ok");
    };

    view.querySelector("#set-export").onclick = () => {
      // v5: uses the shared ARRAY_KEYS / OBJECT_KEYS lists. Both
      // whale keys are included, so whichever the whale tracker
      // writes, it lands in the backup.
      const data = {
        version: MISC_VERSION,
        schema: MISC_STORE_VERSION,
        exportedAt: Date.now(),
      };
      for (const k of ARRAY_KEYS) data[k] = W.miscStoreArray(k);
      for (const k of OBJECT_KEYS) data[k] = W.miscStoreObject(k);

      const rawSettings = W.miscStoreObject("settings");
      data.settings = {
        currency: String(rawSettings.currency || "usd"),
        refresh: Number.isFinite(Number(rawSettings.refresh))
          ? Number(rawSettings.refresh)
          : 60,
        sentryDsn: String(rawSettings.sentryDsn || ""),
      };

      downloadBlob(
        JSON.stringify(data, null, 2),
        "application/json",
        "weaver-backup.json",
      );
    };

    view.querySelector("#set-wipe").onclick = () => {
      W.ui?.confirm?.(
        "This deletes ALL Weaver data from this browser. Continue?",
        () => {
          W.store?.clearAll?.();
          location.reload();
        },
      );
    };
  }

  function downloadBlob(content, mime, filename) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    try {
      a.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  function importBackup(text, mode = "merge") {
    if (typeof text !== "string" || text.length > 10 * 1024 * 1024) {
      return { ok: false, error: "Backup exceeds 10 MB or is not a string" };
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "Invalid JSON" };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Backup is not a JSON object" };
    }

    // v5: use the shared key lists so export and import stay in sync.
    const ARRAY_SET = new Set(ARRAY_KEYS);
    const OBJECT_SET = new Set(OBJECT_KEYS);

    for (const k of Object.keys(parsed)) {
      if (k === "version" || k === "schema" || k === "exportedAt") continue;
      if (W.miscIsReservedKey(k)) {
        return { ok: false, error: `Reserved key rejected: ${k}` };
      }
      if (!ARRAY_SET.has(k) && !OBJECT_SET.has(k)) continue;
      const v = parsed[k];
      if (ARRAY_SET.has(k) && !Array.isArray(v)) {
        return { ok: false, error: `Key "${k}" must be an array` };
      }
      if (
        OBJECT_SET.has(k) &&
        (v === null || typeof v !== "object" || Array.isArray(v))
      ) {
        return { ok: false, error: `Key "${k}" must be an object` };
      }
    }

    if (mode === "replace") {
      for (const k of ARRAY_KEYS) W.miscStoreDelete(k);
      for (const k of OBJECT_KEYS) W.miscStoreDelete(k);
    }

    let written = 0;
    for (const k of Object.keys(parsed)) {
      if (k === "version" || k === "schema" || k === "exportedAt") continue;
      if (!ARRAY_SET.has(k) && !OBJECT_SET.has(k)) continue;
      if (W.miscIsReservedKey(k)) continue;
      if (!W.miscStoreSet(k, parsed[k])) {
        return { ok: false, error: `Write failed for "${k}"` };
      }
      written++;
    }
    return { ok: true, written };
  }

  return W.miscDeepFreeze({
    version: MISC_VERSION,
    renderProfile,
    renderSettings,
    renderPro,
    renderDefi,
    renderAirdrops,
    importBackup,
  });
})();

console.log(
  `[Misc] Module loaded (${MISC_VERSION}: whale-key reconciliation, persistent passphrase-decline).`,
);
