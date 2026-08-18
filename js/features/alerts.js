// js/features/alerts.js – Price Alerts


window.W = window.W || {};

W.alerts = (() => {
  const KEY = "alerts";

  // ── Data Access ────────────────────────────────────────
  function list() {
    return W.store.get(KEY, []);
  }

  function save(alerts) {
    W.store.set(KEY, alerts);
    updateBadge();
  }

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function condText(a) {
    switch (a.cond) {
      case "above":
        return `price above ${W.fmt.price(a.val)}`;
      case "below":
        return `price below ${W.fmt.price(a.val)}`;
      case "move24":
        return `24h move exceeds ±${a.val}%`;
      case "volume":
        return `volume spike (±${a.val}% move)`;
      default:
        return "";
    }
  }

  function updateBadge() {
    const badge = document.getElementById("alert-badge");
    if (!badge) return;
    const count = list().filter((a) => !a.triggered).length;
    badge.textContent = count || "";
    badge.style.display = count ? "inline-block" : "none";
  }

  // ── Render ─────────────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🚨 Create Alert</h3>
        <form id="a-form" class="alert-form">
          <div id="a-picker" style="grid-column:1/-1;"></div>
          <label>Condition
            <select name="cond">
              <option value="above">Price goes above</option>
              <option value="below">Price goes below</option>
              <option value="move24">24h % movement exceeds</option>
              <option value="volume">Volume spike (big 24h move)</option>
            </select>
          </label>
          <label>Value
            <input type="number" step="any" name="val" required placeholder="e.g. 70000 or 10">
          </label>
          <button class="btn primary" type="submit">Create Alert</button>
        </form>
      </div>
      <div class="card">
        <h3>Active Alerts</h3>
        <div id="a-list"></div>
      </div>
    `;

    // ── Coin picker ──────────────────────────────────────
    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#a-picker"), (p) => (picked = p));
    } else {
      console.warn("[Alerts] coinPicker not available");
    }

    // ── Form submit ──────────────────────────────────────
    view.querySelector("#a-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      const val = parseFloat(f.val.value);
      if (isNaN(val) || val <= 0)
        return W.ui.toast("Enter a valid value", "warn");

      const alerts = list();
      alerts.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        coinId: picked.id,
        symbol: picked.symbol.toUpperCase(),
        name: picked.name,
        img: picked.img,
        cond: f.cond.value,
        val: val,
        triggered: false,
        created: Date.now(),
      });
      save(alerts);
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      W.ui.toast("Alert created 🚨", "ok");
      render(view);
    };

    // ── Draw list ────────────────────────────────────────
    drawList(view);
    updateBadge();
  }

  function drawList(view) {
    const el = view.querySelector("#a-list");
    const alerts = list();
    if (!alerts.length) {
      el.innerHTML = W.ui.empty(
        "🚨",
        "No alerts yet",
        "Create one above — Weaver watches the market for you",
      );
      return;
    }

    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Coin</th><th>Condition</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${alerts
              .map(
                (a) => `
              <tr>
                <td class="coin-cell">
                  <img src="${a.img}" alt="${a.name}">
                  <b>${escapeHTML(a.name)}</b>
                </td>
                <td>${escapeHTML(condText(a))}</td>
                <td>${a.triggered ? '<span class="tag triggered">Triggered</span>' : '<span class="tag live">Watching</span>'}</td>
                <td><button class="icon-btn" data-del="${a.id}">🗑️</button></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // ── Delete buttons ──────────────────────────────────
    el.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.del;
        W.ui.confirm("Delete this alert?", () => {
          save(list().filter((a) => a.id !== id));
          drawList(view);
          updateBadge();
        });
      };
    });
  }

  // ── Check Alerts ──────────────────────────────────────
  async function check() {
    updateBadge();
    const alerts = list();
    const active = alerts.filter((a) => !a.triggered);
    if (!active.length) return;

    const ids = [...new Set(active.map((a) => a.coinId))].join(",");
    let markets;
    try {
      markets = await W.api.markets(ids);
    } catch (e) {
      console.warn("[Alerts] Check error:", e);
      return;
    }

    const triggered = [];
    active.forEach((a) => {
      const m = markets.find((c) => c.id === a.coinId);
      if (!m) return;
      const p24 = m.price_change_percentage_24h_in_currency ?? 0;
      let hit = false;
      if (a.cond === "above" && m.current_price >= a.val) hit = true;
      if (a.cond === "below" && m.current_price <= a.val) hit = true;
      if (
        (a.cond === "move24" || a.cond === "volume") &&
        Math.abs(p24) >= a.val
      )
        hit = true;
      if (hit) {
        a.triggered = true;
        const msg = `🚨 <b>${a.name}</b> — ${condText(a)} (now ${W.fmt.price(m.current_price)})`;
        W.ui.toast(msg, "warn", 6000);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Weaver Alert", {
            body: `${a.name}: ${condText(a)}`,
            icon: "assets/logo.png",
          });
        }
        if (W.tg) W.tg.notify("alert:" + a.id, msg);
        triggered.push(a.id);
      }
    });

    if (triggered.length) {
      save(alerts);
      updateBadge();
    }
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    render,
    check,
    list,
    save,
    updateBadge,
  };
})();

console.log("[Alerts] Module loaded.");
