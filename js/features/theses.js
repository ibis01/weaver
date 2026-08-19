// ===============================================================
//         Investment Thesis Tracking Module
// ===============================================================
//
// Purpose: Track WHY a user holds an asset and evaluate the
// health of that thesis against current evidence.
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

  // ── Thesis Health Evaluator (Section 26) ───────────────

  /**
   * Compare original thesis vs current evidence.
   * @param {Object} thesis
   * @param {Array} evidenceRecords - Array of W.evidence objects
   * @returns {Object} - { status, confidence, summary }
   */
  function evaluateHealth(thesis, evidenceRecords) {
    if (!thesis || !evidenceRecords || !evidenceRecords.length) {
      return {
        status: "insufficient_evidence",
        confidence: 0,
        summary: "Waiting for market data...",
      };
    }

    // Filter evidence relevant to this asset
    const relevantEvidence = evidenceRecords.filter((e) =>
      e.claim.toLowerCase().includes(thesis.asset.toLowerCase()),
    );

    if (relevantEvidence.length === 0) {
      return {
        status: "insufficient_evidence",
        confidence: 0,
        summary: `No recent evidence found for ${thesis.asset}.`,
      };
    }

    // Simple heuristic evaluator (can be upgraded to AI later)
    let positiveSignals = 0;
    let negativeSignals = 0;
    let totalConfidence = 0;

    relevantEvidence.forEach((e) => {
      totalConfidence += e.confidence || 0.5;
      // Check if evidence matches expected signals or invalidation conditions
      const claimLower = e.claim.toLowerCase();
      const signalsLower = thesis.signals.toLowerCase();
      const invalidationLower = thesis.invalidation.toLowerCase();

      if (signalsLower && claimLower.includes(signalsLower.split(" ")[0]))
        positiveSignals++;
      if (
        invalidationLower &&
        claimLower.includes(invalidationLower.split(" ")[0])
      )
        negativeSignals++;
    });

    const avgConfidence = totalConfidence / relevantEvidence.length;

    if (negativeSignals > positiveSignals) {
      return {
        status: "weakening",
        confidence: avgConfidence,
        summary: "Evidence suggests thesis is weakening.",
      };
    } else if (positiveSignals > negativeSignals) {
      return {
        status: "strengthening",
        confidence: avgConfidence,
        summary: "Evidence supports your thesis.",
      };
    }

    return {
      status: "neutral",
      confidence: avgConfidence,
      summary: "Mixed evidence. Monitor closely.",
    };
  }

  // ── Render UI ──────────────────────────────────────────

  async function render(view) {
    const allEvidence = W.store.get("evidence_cache", []); // Assuming we cache evidence later

    view.innerHTML = `
      <div class="card">
        <h3> Investment Theses</h3>
        <p class="muted small">Track WHY you hold an asset. The system will evaluate your thesis against market evidence.</p>
        <button class="btn primary" id="btn-new-thesis">+ New Thesis</button>
      </div>

      <div id="theses-list" class="grid-2">
        ${theses.length === 0 ? '<p class="muted">No active theses. Create one to start tracking.</p>' : ""}
        ${theses
          .filter((t) => t.status === "active")
          .map((t) => {
            const health = evaluateHealth(t, allEvidence);
            const statusColor =
              health.status === "strengthening"
                ? "var(--up)"
                : health.status === "weakening"
                  ? "var(--down)"
                  : "var(--text-muted)";

            return `
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4>${W.fmt.escapeHTML(t.asset)}</h4>
              <span style="color:${statusColor}; font-weight:bold; font-size:0.8em;">${health.status.replace("_", " ").toUpperCase()}</span>
            </div>
            <p class="small"><b>Statement:</b> ${W.fmt.escapeHTML(t.statement)}</p>
            <p class="small muted"><b>Horizon:</b> ${W.fmt.escapeHTML(t.horizon)} | <b>Target:</b> ${t.target ? "$" + t.target : "N/A"}</p>
            <p class="small muted"><b>Invalidation:</b> ${W.fmt.escapeHTML(t.invalidation)}</p>
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

    // ── Event Listeners ──────────────────────────────────
    view.querySelector("#btn-new-thesis").onclick = () => {
      view.querySelector("#thesis-form-container").classList.remove("hidden");
    };
    view.querySelector("#btn-cancel-thesis").onclick = () => {
      view.querySelector("#thesis-form-container").classList.add("hidden");
    };

    view.querySelector("#thesis-form").onsubmit = (e) => {
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
  W.theses = { all, create, remove, evaluateHealth, render };
})();

console.log("[Theses] Module loaded.");
