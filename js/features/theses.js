// ===============================================================
//         Investment Thesis Tracking Module
// ===============================================================
//
// Purpose: Track WHY a user holds an asset and evaluate the
// health of that thesis against current market evidence.
// Integrates with W.thesisHealth (Task 19).
//
// ===============================================================

window.W = window.W || {};
W.theses = W.theses || {};

(function () {
  const THESES_KEY = "investment_theses";

  // ── State ──────────────────────────────────────────────
  let theses = W.store.get(THESES_KEY, []);

  function save() {
    W.store.set(THESES_KEY, theses);
  }

  // ── CRUD Operations ────────────────────────────────────

  function all() {
    return theses;
  }

  function create(data) {
    const thesis = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      asset: data.asset || "UNKNOWN",
      statement: data.statement || "",
      reasons: data.reasons || "",
      signals: data.signals || "",
      invalidation: data.invalidation || "",
      horizon: data.horizon || "Medium-term",
      target: data.target || null,
      createdAt: new Date().toISOString(),
      status: "active", // active, invalidated, completed
    };
    theses.push(thesis);
    save();
    return thesis;
  }

  function remove(id) {
    theses = theses.filter((t) => t.id !== id);
    save();
  }

  // ── Render UI ──────────────────────────────────────────

  async function render(view) {
    // 1. Get active theses and unique assets for efficient fetching
    const activeTheses = theses.filter((t) => t.status === "active");
    const uniqueAssets = [
      ...new Set(activeTheses.map((t) => t.asset?.toLowerCase())),
    ].filter(Boolean);

    // 2. Fetch market data for these assets in bulk (Rule 31)
    let marketData = {};
    if (uniqueAssets.length > 0 && W.api?.markets) {
      try {
        const markets = await W.api.markets(uniqueAssets.join(","));
        markets.forEach((m) => {
          if (m && m.id) marketData[m.id.toLowerCase()] = m.current_price;
        });
      } catch (e) {
        console.warn(
          "[Theses] Failed to fetch market data for health check:",
          e.message,
        );
      }
    }

    // 3. Generate HTML with Health Badges
    view.innerHTML = `
      <div class="card">
        <h3>📝 Investment Theses</h3>
        <p class="muted small">Track WHY you hold an asset. The system will evaluate your thesis against market evidence.</p>
        <button class="btn primary" id="btn-new-thesis">+ New Thesis</button>
      </div>

      <div id="theses-list" class="grid-2">
        ${activeTheses.length === 0 ? '<p class="muted">No active theses. Create one to start tracking.</p>' : ""}
        ${activeTheses
          .map((t) => {
            // Calculate health using the new engine (Rule 21: handles null price gracefully)
            const currentPrice = marketData[t.asset?.toLowerCase()] || null;
            const health = W.thesisHealth
              ? W.thesisHealth.evaluate(t, currentPrice, null)
              : null;

            const badgeHtml = health
              ? W.thesisHealth.renderBadge(t.id, health)
              : "";

            return `
          <div class="card" data-thesis-id="${t.id}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4 style="margin:0;">${W.fmt.escapeHTML(t.asset)} ${badgeHtml}</h4>
            </div>
            <p class="small"><b>Statement:</b> ${W.fmt.escapeHTML(t.statement)}</p>
            <p class="small muted"><b>Horizon:</b> ${W.fmt.escapeHTML(t.horizon)} | <b>Target:</b> ${t.target ? "$" + t.target : "N/A"}</p>
            <p class="small muted"><b>Invalidation:</b> ${W.fmt.escapeHTML(t.invalidation)}</p>
            
            <!-- Hook for health details (injected below) -->
            <div class="thesis-health-details" data-details-id="${t.id}" style="margin-top: 12px;"></div>

            <div style="margin-top:10px; display:flex; gap:10px;">
              <button class="btn tiny warn" data-action="invalidate" data-id="${t.id}">Mark Invalidated</button>
              <button class="btn tiny" data-action="delete" data-id="${t.id}">Delete</button>
            </div>
          </div>
          `;
          })
          .join("")}
      </div>

      <div id="thesis-form-container" class="card hidden" style="margin-top:20px;">
        <h4>Create New Thesis</h4>
        <form id="thesis-form" class="form-grid">
          <input type="text" id="t-asset" placeholder="Asset (e.g. BTC)" required class="input">
          <input type="text" id="t-horizon" placeholder="Time Horizon (e.g. 6 months)" class="input">
          <input type="number" id="t-target" placeholder="Price Target (Optional)" step="any" class="input">
          <textarea id="t-statement" placeholder="Core Thesis Statement (Why are you buying?)" required class="input" rows="3"></textarea>
          <textarea id="t-signals" placeholder="Expected confirming signals" class="input" rows="2"></textarea>
          <textarea id="t-invalidation" placeholder="What would prove this thesis wrong?" class="input" rows="2"></textarea>
          <div style="grid-column: 1 / -1; display:flex; gap:10px;">
            <button type="submit" class="btn primary">Save Thesis</button>
            <button type="button" class="btn" id="btn-cancel-thesis">Cancel</button>
          </div>
        </form>
      </div>
    `;

    // 4. Inject Health Details after DOM is rendered (Rule 15: Safe rendering)
    if (W.thesisHealth) {
      activeTheses.forEach((t) => {
        const currentPrice = marketData[t.asset?.toLowerCase()] || null;
        const health = W.thesisHealth.evaluate(t, currentPrice, null);

        // Only show detailed breakdown if it's not perfectly healthy, to save UI space
        if (health && health.status !== "Healthy") {
          const detailsContainer = view.querySelector(
            `.thesis-health-details[data-details-id="${t.id}"]`,
          );
          if (detailsContainer) {
            W.thesisHealth.renderDetails(detailsContainer, health);
          }
        }
      });
    }

    // ── Event Listeners ──────────────────────────────────
    const newThesisBtn = view.querySelector("#btn-new-thesis");
    if (newThesisBtn) {
      newThesisBtn.onclick = () => {
        view.querySelector("#thesis-form-container").classList.remove("hidden");
      };
    }

    const cancelThesisBtn = view.querySelector("#btn-cancel-thesis");
    if (cancelThesisBtn) {
      cancelThesisBtn.onclick = () => {
        view.querySelector("#thesis-form-container").classList.add("hidden");
      };
    }

    const form = view.querySelector("#thesis-form");
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        create({
          asset: view.querySelector("#t-asset").value.trim().toUpperCase(),
          horizon: view.querySelector("#t-horizon").value.trim(),
          target: parseFloat(view.querySelector("#t-target").value) || null,
          statement: view.querySelector("#t-statement").value.trim(),
          signals: view.querySelector("#t-signals").value.trim(),
          invalidation: view.querySelector("#t-invalidation").value.trim(),
        });
        render(view);
        W.ui.toast("Thesis created", "ok");
      };
    }

    view.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.onclick = () => {
        remove(btn.dataset.id);
        render(view);
        W.ui.toast("Thesis deleted", "ok");
      };
    });

    view.querySelectorAll("[data-action='invalidate']").forEach((btn) => {
      btn.onclick = () => {
        const t = theses.find((x) => x.id === btn.dataset.id);
        if (t) {
          t.status = "invalidated";
          save();
          render(view);
          W.ui.toast("Thesis invalidated", "warn");
        }
      };
    });
  }

  // ── Exports ────────────────────────────────────────────
  W.theses = { all, create, remove, render };
})();

console.log("[Theses] Module loaded (with Health Monitor integration).");
