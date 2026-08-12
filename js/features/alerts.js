window.W = window.W || {};

W.alerts = (() => {
  const KEY = "alerts";
  const list = () => W.store.get(KEY, []);
  const save = (l) => W.store.set(KEY, l);

  const condText = (a) =>
    ({
      above: `price above ${W.fmt.price(a.val)}`,
      below: `price below ${W.fmt.price(a.val)}`,
      move24: `24h move exceeds ±${a.val}%`,
      volume: `volume spike (±${a.val}% move)`,
    })[a.cond];

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🚨 Create Alert</h3>
        <form id="a-form" class="alert-form">
          <div id="a-picker" style="grid-column:1/-1"></div>
          <label>Condition<select name="cond">
            <option value="above">Price goes above</option>
            <option value="below">Price goes below</option>
            <option value="move24">24h % movement exceeds</option>
            <option value="volume">Volume spike (big 24h move)</option>
          </select></label>
          <label>Value<input type="number" step="any" name="val" required placeholder="e.g. 70000 or 10"></label>
          <button class="btn primary" type="submit">Create Alert</button>
        </form>
      </div>
      <div class="card"><h3>Active Alerts</h3><div id="a-list"></div></div>`;
    let picked = null;
    W.ui.coinPicker(view.querySelector("#a-picker"), (p) => (picked = p));
    view.querySelector("#a-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      const val = parseFloat(f.val.value);
      if (isNaN(val)) return;
      const alerts = list();
      alerts.push({
        id: Date.now().toString(36),
        coinId: picked.id,
        symbol: picked.symbol.toUpperCase(),
        name: picked.name,
        img: picked.img,
        cond: f.cond.value,
        val,
        triggered: false,
        created: Date.now(),
      });
      save(alerts);
      if ("Notification" in window && Notification.permission === "default")
        Notification.requestPermission();
      W.ui.toast("Alert created 🚨", "ok");
      render(view);
    };
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
    el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Coin</th><th>Condition</th><th>Status</th><th></th></tr></thead><tbody>
      ${alerts
        .map(
          (a) => `<tr>
        <td class="coin-cell"><img src="${a.img}"><b>${a.name}</b></td>
        <td>${condText(a)}</td>
        <td>${a.triggered ? '<span class="tag triggered">Triggered</span>' : '<span class="tag live">Watching</span>'}</td>
        <td><button class="icon-btn" data-del="${a.id}">🗑️</button></td></tr>`,
        )
        .join("")}
    </tbody></table></div>`;
    el.querySelectorAll("[data-del]").forEach(
      (b) =>
        (b.onclick = () => {
          save(list().filter((x) => x.id !== b.dataset.del));
          drawList(view);
          updateBadge();
        }),
    );
  }

  function updateBadge() {
    const b = document.getElementById("alert-badge");
    if (!b) return;
    const n = list().filter((a) => !a.triggered).length;
    b.textContent = n || "";
    b.style.display = n ? "inline-block" : "none";
  }

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
      return;
    }
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
        W.ui.toast(
          `🚨 <b>${a.name}</b> — ${condText(a)} (now ${W.fmt.price(m.current_price)})`,
          "warn",
          6000,
        );
        if ("Notification" in window && Notification.permission === "granted")
          new Notification("Weaver Alert", {
            body: `${a.name}: ${condText(a)}`,
          });
        if (W.tg)
                  W.tg.notify(
                    "alert:" + a.id,
                    `🚨 <b>${a.name}</b> — ${condText(a)} (now ${W.fmt.price(m.current_price)})`,
                  );
      }
    });
    save(alerts);
    updateBadge();
  }

  return { render, check };
})();
