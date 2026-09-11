// ===============================================================
//         Decision Journal Module
// ===============================================================
// CSP Compliant: Zero inline styles.
//
// CONFIDENCE POLICY (WEAVER_CONSTITUTION §2.9.1):
//   - If the user does not enter a confidence, it is stored as `null`.
//   - It is never defaulted to 0.5.
//   - The UI hides the confidence line when no value was recorded.
//
// REPLAY RENDERING:
//   - Replay badges render synchronously with placeholder data so
//     the UI is never blocked on external market data.
//   - A second async pass updates badges when prices arrive.
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

  // Parse confidence from user input. Empty → null. Invalid → null.
  // Valid numeric string in [0,1] → number.
  function parseConfidenceInput(raw) {
    if (raw === "" || raw === null || raw === undefined) return null;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < 0 || parsed > 1) return null;
    return parsed;
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
      confidence: parseConfidenceInput(data.confidence),
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

  async function render(view) {
    const activeTheses = W.theses
      ? W.theses.all().filter((t) => t.status === "active")
      : [];

    view.innerHTML = `
      <div class="card">
        <h3>📓 Decision Journal</h3>
        <p class="text-muted small-text">Record WHY you are making a trade. A transaction records WHAT happened; this records WHY.</p>
        <button class="btn primary" id="btn-new-decision">+ Log Decision</button>
      </div>

      <div id="decision-list" class="mt-16">
        ${decisions.length === 0 ? '<p class="text-muted">No decisions logged yet.</p>' : ""}
        ${decisions
          .map((d) => {
            const linkedThesis = activeTheses.find((t) => t.id === d.thesisId);
            const actionColor =
              d.action === "Buy"
                ? "text-up"
                : d.action === "Sell"
                  ? "text-down"
                  : "text-muted";

            // Only show a confidence line when one was actually recorded.
            const confidenceLine =
              d.confidence !== null && d.confidence !== undefined
                ? `<span><b>Confidence:</b> ${(d.confidence * 100).toFixed(0)}%</span>`
                : `<span class="italic"><b>Confidence:</b> not stated</span>`;

            return `
          <div class="card">
            <div class="flex-between mb-8">
              <div>
                <span class="${actionColor} font-bold text-2xl">${d.action.toUpperCase()}</span> 
                <b>${W.fmt.escapeHTML(d.asset)}</b>
                <span class="replay-container" data-decision-id="${d.id}"></span>
                <span class="text-muted small-text"> @ ${W.fmt.price(d.price)}</span>
              </div>
              <span class="text-muted small-text">${W.fmt.relativeTime(d.timestamp)}</span>
            </div>
            <p class="small-text"><b>Reasoning:</b> ${W.fmt.escapeHTML(d.reasoning)}</p>
            <div class="flex-between mt-8 small-text text-muted">
              ${confidenceLine}
              <span><b>Horizon:</b> ${W.fmt.escapeHTML(d.horizon)}</span>
              ${linkedThesis ? `<span><b>Linked Thesis:</b> ${W.fmt.escapeHTML(linkedThesis.statement.substring(0, 40))}...</span>` : ""}
            </div>
            <div class="mt-8 text-center">
              <button class="btn tiny danger" data-action="delete" data-id="${d.id}">Delete</button>
            </div>
          </div>
          `;
          })
          .join("")}
      </div>

      <div id="decision-form-container" class="card hidden mt-16">
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
          <input type="number" id="d-confidence" placeholder="Confidence (0.0 to 1.0, optional)" step="0.1" min="0" max="1" class="input">
          <input type="text" id="d-horizon" placeholder="Time Horizon (e.g. 2 weeks)" class="input">
          <textarea id="d-reasoning" placeholder="Why are you making this decision? What is the context?" required class="input col-span-full" rows="3"></textarea>
          <div class="flex-center gap-16 mt-16 col-span-full">
            <button type="submit" class="btn primary">Save Decision</button>
            <button type="button" class="btn ghost" id="btn-cancel-decision">Cancel</button>
          </div>
        </form>
      </div>
    `;

    view.querySelector("#btn-new-decision").onclick = () => {
      view.querySelector("#decision-form-container").classList.remove("hidden");
    };
    view.querySelector("#btn-cancel-decision").onclick = () => {
      view.querySelector("#decision-form-container").classList.add("hidden");
    };

    view.querySelector("#decision-form").onsubmit = async (e) => {
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
      await render(view); // critical for the E2E test to find the badge
      W.ui.toast("Decision logged", "ok");
    };

    view.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.onclick = () => {
        remove(btn.dataset.id);
        render(view);
        W.ui.toast("Decision deleted", "ok");
      };
    });

    // ── Decision Replay Integration ─────────────
    // Badges are rendered synchronously first so the UI is never empty,
    // then updated in the background if market data arrives. This keeps
    // the journal responsive and does not block on external APIs.
    if (W.decisionReplay && decisions.length > 0) {
      // Pass 1 — immediate render. No current price yet, so
      // `evaluate` returns "Inconclusive", which is honest: we don't
      // have enough data yet to judge the outcome.
      decisions.forEach((d) => {
        const outcome = W.decisionReplay.evaluate(d, { price: null });
        const container = view.querySelector(
          `.replay-container[data-decision-id="${d.id}"]`,
        );
        if (container) {
          container.innerHTML = W.decisionReplay.renderBadge(outcome);
        }
      });

      // Pass 2 — fetch prices and update badges. Not awaited, so a slow
      // or unavailable market API never blocks the journal from rendering.
      const uniqueAssets = [
        ...new Set(decisions.map((d) => d.asset?.toLowerCase())),
      ].filter(Boolean);

      if (uniqueAssets.length > 0 && W.api?.markets) {
        W.api
          .markets(uniqueAssets.join(","))
          .then((markets) => {
            const priceMap = {};
            markets.forEach((m) => {
              if (m && m.id) priceMap[m.id.toLowerCase()] = m.current_price;
            });

            decisions.forEach((d) => {
              const currentPrice = priceMap[d.asset?.toLowerCase()] || null;
              if (currentPrice === null) return;

              const outcome = W.decisionReplay.evaluate(d, {
                price: currentPrice,
              });
              const container = view.querySelector(
                `.replay-container[data-decision-id="${d.id}"]`,
              );
              if (container) {
                container.innerHTML = W.decisionReplay.renderBadge(outcome);
              }
            });
          })
          .catch((e) => {
            console.warn(
              "[Journal] Replay market data unavailable:",
              e.message,
            );
          });
      }
    }
  }

  W.journal = { all, create, remove, render };
})();

console.log("[Journal] Decision module loaded (CSP compliant).");
