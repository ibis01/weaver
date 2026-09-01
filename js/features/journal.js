// ===============================================================
//         Decision Journal Module – with Rich Replay
// ===============================================================

window.W = window.W || {};
W.journal = W.journal || {};

(function () {
  const JOURNAL_KEY = "decision_journal";
  let decisions = W.store.get(JOURNAL_KEY, []);

  function save() {
    W.store.set(JOURNAL_KEY, decisions);
  }

  function all() {
    return decisions;
  }

  function create(data) {
    const decision = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      asset: data.asset || "UNKNOWN",
      action: data.action || "Hold",
      amount: parseFloat(data.amount) || 0,
      price: parseFloat(data.price) || 0,
      thesisId: data.thesisId || null,
      reasoning: data.reasoning || "",
      confidence: parseFloat(data.confidence) || 0.5,
      horizon: data.horizon || "Short-term",
      timestamp: new Date().toISOString(),
    };
    decisions.unshift(decision);
    save();
    return decision;
  }

  function remove(id) {
    decisions = decisions.filter((d) => d.id !== id);
    save();
  }

  // ── Render UI ──────────────────────────────────────────

  async function render(view) {
    const activeTheses = W.theses
      ? W.theses.all().filter((t) => t.status === "active")
      : [];

    view.innerHTML = `
      <div class="card">
        <h3>📓 Decision Journal</h3>
        <p class="muted small">Record WHY you are making a trade. A transaction records WHAT happened; this records WHY.</p>
        <button class="btn primary" id="btn-new-decision">+ Log Decision</button>
      </div>

      <div id="decision-list" style="margin-top: 20px;">
        ${decisions.length === 0 ? '<p class="muted">No decisions logged yet.</p>' : ""}
        ${decisions
          .map((d) => {
            const linkedThesis = activeTheses.find((t) => t.id === d.thesisId);
            const actionColor =
              d.action === "Buy"
                ? "var(--up)"
                : d.action === "Sell"
                  ? "var(--down)"
                  : "var(--text-muted)";

            // ── Replay Evaluation ─────────────────────────
            let replayOutcome = null;
            let hasReplay = false;
            // We'll fetch current price in the main loop.
            // For now, we'll render a placeholder that will be updated later.
            // We'll use a container for replay data.

            return `
          <div class="card" style="margin-bottom: 15px;" data-decision-id="${d.id}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div>
                <span style="color:${actionColor}; font-weight:bold; font-size:1.1em;">${d.action.toUpperCase()}</span> 
                <b>${W.fmt.escapeHTML(d.asset)}</b>
                <span class="replay-badge-container" data-decision-id="${d.id}"></span>
                <span class="muted small"> @ ${W.fmt.price(d.price)}</span>
              </div>
              <span class="muted small">${W.fmt.relativeTime(d.timestamp)}</span>
            </div>
            
            <p class="small"><b>Reasoning:</b> ${W.fmt.escapeHTML(d.reasoning)}</p>
            
            <div style="display:flex; gap:15px; margin-top:10px; font-size:0.85em;">
              <span class="muted"><b>Confidence:</b> ${(d.confidence * 100).toFixed(0)}%</span>
              <span class="muted"><b>Horizon:</b> ${W.fmt.escapeHTML(d.horizon)}</span>
              ${linkedThesis ? `<span class="muted"><b>Linked Thesis:</b> ${W.fmt.escapeHTML(linkedThesis.statement.substring(0, 40))}...</span>` : ""}
            </div>

            <!-- Replay Details (expandable) -->
            <div class="replay-details-container" data-decision-id="${d.id}" style="margin-top:10px; display:none;"></div>

            <div style="margin-top:10px; text-align:right;">
              <button class="btn tiny" data-action="toggle-replay" data-id="${d.id}">📊 Show Replay</button>
              <button class="btn tiny warn" data-action="delete" data-id="${d.id}">Delete</button>
            </div>
          </div>
          `;
          })
          .join("")}
      </div>

      <div id="decision-form-container" class="card hidden" style="margin-top:20px;">
        <h4>Log New Decision</h4>
        <form id="decision-form" class="form-grid">
          <input type="text" id="d-asset" placeholder="Asset (e.g. BTC)" required class="input">
          <select id="d-action" class="input">
            <option value="Buy">Buy</option>
            <option value="Sell">Sell</option>
            <option value="Hold">Hold / DCA</option>
          </select>
          <input type="number" id="d-amount" placeholder="Amount" step="any" class="input">
          <input type="number" id="d-price" placeholder="Execution Price" step="any" class="input">
          <select id="d-thesis" class="input">
            <option value="">-- Link to Thesis (Optional) --</option>
            ${activeTheses.map((t) => `<option value="${t.id}">${W.fmt.escapeHTML(t.asset)}: ${W.fmt.escapeHTML(t.statement.substring(0, 30))}...</option>`).join("")}
          </select>
          <input type="number" id="d-confidence" placeholder="Confidence (0.0 to 1.0)" step="0.1" min="0" max="1" class="input">
          <input type="text" id="d-horizon" placeholder="Time Horizon (e.g. 2 weeks)" class="input">
          <textarea id="d-reasoning" placeholder="Why are you making this decision? What is the context?" required class="input" rows="3" style="grid-column: 1 / -1;"></textarea>
          <div style="grid-column: 1 / -1; display:flex; gap:10px;">
            <button type="submit" class="btn primary">Save Decision</button>
            <button type="button" class="btn" id="btn-cancel-decision">Cancel</button>
          </div>
        </form>
      </div>
    `;

    // ── Event Listeners ──────────────────────────────────
    view.querySelector("#btn-new-decision").onclick = () => {
      view.querySelector("#decision-form-container").classList.remove("hidden");
    };
    view.querySelector("#btn-cancel-decision").onclick = () => {
      view.querySelector("#decision-form-container").classList.add("hidden");
    };

    view.querySelector("#decision-form").onsubmit = (e) => {
      e.preventDefault();
      create({
        asset: view.querySelector("#d-asset").value.trim().toUpperCase(),
        action: view.querySelector("#d-action").value,
        amount: view.querySelector("#d-amount").value,
        price: view.querySelector("#d-price").value,
        thesisId: view.querySelector("#d-thesis").value || null,
        confidence: view.querySelector("#d-confidence").value,
        horizon: view.querySelector("#d-horizon").value.trim(),
        reasoning: view.querySelector("#d-reasoning").value.trim(),
      });
      render(view);
      W.ui.toast("Decision logged", "ok");
    };

    view.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.onclick = () => {
        remove(btn.dataset.id);
        render(view);
        W.ui.toast("Decision deleted", "ok");
      };
    });

    // ── Toggle Replay Details ────────────────────────────
    view.querySelectorAll("[data-action='toggle-replay']").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const container = view.querySelector(
          `.replay-details-container[data-decision-id="${id}"]`,
        );
        if (!container) return;

        if (container.style.display === "none") {
          // Fetch replay data
          const decision = decisions.find((d) => d.id === id);
          if (!decision) return;

          // Get current price (we'll use asset symbol)
          const asset = decision.asset;
          let currentPrice = null;
          let btcPrice = null;
          try {
            const markets = await W.api.markets(asset);
            if (markets && markets.length) {
              currentPrice = markets[0].current_price;
            }
            // Also get BTC price for benchmark
            const btcData = await W.api.markets("bitcoin");
            if (btcData && btcData.length) {
              btcPrice = btcData[0].current_price;
            }
          } catch (e) {}

          // Build currentData and benchmarkData
          const currentData = { price: currentPrice, btcPrice: btcPrice };
          const benchmarkData = {}; // We could fetch historical prices, but for simplicity we use current BTC.
          // In a full implementation, we'd store BTC price at decision time.

          // Evaluate
          if (W.decisionReplay) {
            const outcome = W.decisionReplay.evaluate(
              decision,
              currentData,
              benchmarkData,
            );
            // Render details
            W.decisionReplay.renderDetails(container, outcome);
            // Also update badge
            const badgeContainer = view.querySelector(
              `.replay-badge-container[data-decision-id="${id}"]`,
            );
            if (badgeContainer) {
              badgeContainer.innerHTML = W.decisionReplay.renderBadge(outcome);
            }
            container.style.display = "block";
            btn.textContent = "📊 Hide Replay";
          }
        } else {
          container.style.display = "none";
          btn.textContent = "📊 Show Replay";
        }
      };
    });

    // ── Initial badge rendering ───────────────────────────
    // For decisions that already have a replay, we could pre‑load.
    // We'll leave it to user click.
  }

  // ── Exports ────────────────────────────────────────────
  W.journal = { all, create, remove, render };
})();

console.log("[Journal] Decision module loaded (with rich replay).");
