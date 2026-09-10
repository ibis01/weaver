// ===============================================================
//         Whale Tracker Module
// ===============================================================
// Purpose: Track significant on-chain movements.
// P0 Security Task 3: Mask wallet addresses in console logs.
// ===============================================================

window.W = window.W || {};
W.whales = W.whales || {};

(function () {
  const WHALES_KEY = "whale_alerts";
  let alerts = W.store.get(WHALES_KEY, []);

  function save() {
    W.store.set(WHALES_KEY, alerts);
  }
  function all() {
    return alerts;
  }

  // ── Render UI ────────────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🐋 Whale Tracker</h3>
        <p class="muted small">Monitor large on-chain movements. Privacy-first: addresses are masked in logs and UI.</p>
      </div>
      <div id="whale-list" class="grid-2">
        ${alerts.length === 0 ? '<p class="muted">No whale alerts tracked yet.</p>' : ""}
        ${alerts
          .map(
            (w) => `
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4>${W.fmt.escapeHTML(w.chain)}</h4>
              <span class="tag ${w.type === "inflow" ? "sell" : "buy"}">${w.type}</span>
            </div>
            <p class="small muted">Wallet: <code>${W.fmt.maskAddress(w.addr)}</code></p>
            <p class="small"><b>Amount:</b> ${w.amount} ${W.fmt.escapeHTML(w.symbol)}</p>
            <p class="small muted">${W.fmt.relativeTime(w.timestamp)}</p>
            <button class="btn tiny warn" data-del="${w.id}" style="margin-top:10px;">Remove</button>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    // ─ Event Listeners ──────────────────────────────────
    view.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        alerts = alerts.filter((a) => a.id !== btn.dataset.del);
        save();
        render(view);
      };
    });

    // ── Privacy Check: Mask logs (P0 Task 3) ─────────────
    try {
      if (alerts.length > 0) {
        // SAFE: Never log raw wallet data
        const maskedSample = alerts
          .map((a) => `${a.chain}: ${W.fmt.maskAddress(a.addr)}`)
          .join(", ");
        console.log(
          `[Whales] Loaded ${alerts.length} alerts. Sample: ${maskedSample}`,
        );
      }
    } catch (e) {
      console.warn("[Whales] Error processing alerts.");
    }
  }

  W.whales = { all, render };
})();

console.log("[Whales] Module loaded (privacy-safe logging).");
