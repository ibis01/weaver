// ================================================================
// js/features/timemachine.js – Time Machine: Replay Portfolio History
// ================================================================

window.W = window.W || {};
W.time = W.time || {};

(function () {
  const SNAPSHOT_KEY = "tm_snapshots";
  const MAX_SNAPSHOTS = 100;

  // ── Snapshot Management ──────────────────────────────────

  function getSnapshots() {
    return W.store.get(SNAPSHOT_KEY, []);
  }

  function saveSnapshots(snapshots) {
    W.store.set(SNAPSHOT_KEY, snapshots);
  }

  function saveCurrentSnapshot() {
    const holdings = W.portfolio?.all() || [];
    if (!holdings.length) return;

    const snapshot = {
      timestamp: Date.now(),
      holdings: holdings.map((h) => ({ ...h })),
      totals: W.portfolio?.getTotals?.() || {
        totalValue: 0,
        totalCost: 0,
        totalPL: 0,
        totalPLPercent: 0,
      },
    };

    const snapshots = getSnapshots();
    snapshots.push(snapshot);

    // Keep only the last MAX_SNAPSHOTS
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);
    }

    saveSnapshots(snapshots);
  }

  // ── Replay Logic ──────────────────────────────────────────

  function getSnapshotAt(daysAgo) {
    const snapshots = getSnapshots();
    if (!snapshots.length) return null;

    const cutoff = Date.now() - daysAgo * 86400000;

    // Find the closest snapshot before or at the cutoff
    let closest = null;
    let closestDiff = Infinity;

    for (const s of snapshots) {
      const diff = Math.abs(s.timestamp - cutoff);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = s;
      }
    }

    return closest;
  }

  function calculatePerformance(currentTotals, historicalTotals) {
    if (!historicalTotals || !currentTotals) return null;

    const valueChange = currentTotals.totalValue - historicalTotals.totalValue;
    const pctChange =
      historicalTotals.totalValue !== 0
        ? (valueChange / historicalTotals.totalValue) * 100
        : 0;

    return {
      valueChange,
      pctChange,
      isPositive: valueChange >= 0,
    };
  }

  // ── Render UI ─────────────────────────────────────────────

  async function render(view) {
    if (!view) {
      console.warn("[TimeMachine] No view element provided");
      return;
    }

    const snapshots = getSnapshots();
    const currentTotals = W.portfolio?.getTotals?.() || { totalValue: 0 };

    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>⏳ Time Machine</h3>
          <button class="btn tiny" id="tm-save-snapshot">💾 Save Current State</button>
        </div>
        <p class="muted small">Replay your portfolio's historical performance. Snapshots are saved automatically when you make changes.</p>
        <div class="qa mt">
          <button class="chip" data-days="1">1 Day</button>
          <button class="chip active" data-days="7">7 Days</button>
          <button class="chip" data-days="30">1 Month</button>
          <button class="chip" data-days="90">3 Months</button>
          <button class="chip" data-days="365">1 Year</button>
        </div>
        <div id="tm-status" class="mt"></div>
      </div>
      <div id="tm-result"></div>
      <div class="card">
        <h3>📊 Snapshot History</h3>
        <div id="tm-history"></div>
      </div>
    `;

    // ── Save snapshot button ──────────────────────────────
    view.querySelector("#tm-save-snapshot").onclick = () => {
      saveCurrentSnapshot();
      W.ui.toast("📸 Snapshot saved", "ok");
      render(view);
    };

    // ── Range buttons ──────────────────────────────────────
    view.querySelectorAll("[data-days]").forEach((btn) => {
      btn.onclick = () => {
        view
          .querySelectorAll("[data-days]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        replay(view, parseInt(btn.dataset.days));
      };
    });

    // ── Show history ──────────────────────────────────────
    renderHistory(view);

    // ── Auto-replay on load ──────────────────────────────
    replay(view, 7);
  }

  function replay(view, daysAgo) {
    const resultContainer = view.querySelector("#tm-result");
    const statusEl = view.querySelector("#tm-status");

    if (!resultContainer) return;

    const snapshot = getSnapshotAt(daysAgo);
    const currentTotals = W.portfolio?.getTotals?.() || { totalValue: 0 };
    const snapshots = getSnapshots();

    if (!snapshot || !snapshots.length) {
      resultContainer.innerHTML = `
        <div class="card">
          ${W.ui.empty("⏳", "Not enough data", "Save a snapshot first or wait for automatic snapshots.")}
        </div>
      `;
      if (statusEl) {
        statusEl.innerHTML = `<p class="muted small">💡 Tip: Make changes to your portfolio, then save a snapshot.</p>`;
      }
      return;
    }

    const performance = calculatePerformance(currentTotals, snapshot.totals);
    const snapshotDate = new Date(snapshot.timestamp);

    // ── Build comparison view ──────────────────────────────
    let html = `
      <div class="grid-2">
        <div class="card">
          <h3>📅 ${daysAgo} Days Ago</h3>
          <p class="muted small">${snapshotDate.toLocaleDateString()} ${snapshotDate.toLocaleTimeString()}</p>
          <div class="cards" style="margin-top:12px;">
            <div class="card stat">
              <div class="stat-label">Value</div>
              <div class="stat-big">${W.fmt.money(snapshot.totals.totalValue)}</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Holdings</div>
              <div class="stat-big">${snapshot.holdings.length}</div>
            </div>
          </div>
          <div class="table-wrap">
            <table class="mini">
              <thead><tr><th>Asset</th><th>Amount</th><th>Value</th></tr></thead>
              <tbody>
                ${snapshot.holdings
                  .map(
                    (h) => `
                  <tr>
                    <td><b>${h.symbol.toUpperCase()}</b></td>
                    <td>${h.amount}</td>
                    <td>${W.fmt.money(h.amount * h.price)}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <h3>📈 Today</h3>
          <p class="muted small">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
          <div class="cards" style="margin-top:12px;">
            <div class="card stat">
              <div class="stat-label">Value</div>
              <div class="stat-big">${W.fmt.money(currentTotals.totalValue)}</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Holdings</div>
              <div class="stat-big">${W.portfolio?.all()?.length || 0}</div>
            </div>
          </div>
          ${
            performance
              ? `
            <div class="card stat" style="margin-top:12px; border-color: ${performance.isPositive ? "var(--up)" : "var(--down)"};">
              <div class="stat-label">Performance</div>
              <div class="stat-big ${performance.isPositive ? "up" : "down"}">
                ${performance.isPositive ? "+" : ""}${W.fmt.money(performance.valueChange)}
              </div>
              <div class="stat-sub">${performance.isPositive ? "+" : ""}${performance.pctChange.toFixed(2)}%</div>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;

    resultContainer.innerHTML = html;

    if (statusEl) {
      const snapCount = snapshots.length;
      statusEl.innerHTML = `<p class="muted small">📸 ${snapCount} snapshot${snapCount > 1 ? "s" : ""} available. Showing data from ${snapshotDate.toLocaleDateString()}.</p>`;
    }
  }

  function renderHistory(view) {
    const container = view.querySelector("#tm-history");
    if (!container) return;

    const snapshots = getSnapshots();

    if (!snapshots.length) {
      container.innerHTML =
        '<p class="muted small">No snapshots yet. Save one or make portfolio changes.</p>';
      return;
    }

    // Show last 10 snapshots (most recent first)
    const recent = [...snapshots].reverse().slice(0, 10);

    container.innerHTML = `
      <div class="table-wrap">
        <table class="mini">
          <thead><tr><th>Date</th><th>Holdings</th><th>Value</th><th></th></tr></thead>
          <tbody>
            ${recent
              .map(
                (s, i) => `
              <tr>
                <td>${new Date(s.timestamp).toLocaleDateString()} ${new Date(s.timestamp).toLocaleTimeString()}</td>
                <td>${s.holdings.length}</td>
                <td>${W.fmt.money(s.totals.totalValue)}</td>
                <td>
                  <button class="btn tiny" data-replay-index="${i}">▶ Replay</button>
                  <button class="icon-btn" data-delete-index="${i}">🗑️</button>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // ── Replay from history ──────────────────────────────
    container.querySelectorAll("[data-replay-index]").forEach((btn) => {
      btn.onclick = () => {
        const index = parseInt(btn.dataset.replayIndex);
        const snapshots = getSnapshots();
        const snapshot = snapshots[snapshots.length - 1 - index];
        if (snapshot) {
          const daysAgo = Math.floor(
            (Date.now() - snapshot.timestamp) / 86400000,
          );
          replay(view, Math.max(1, daysAgo));
        }
      };
    });

    // ── Delete snapshot ──────────────────────────────────
    container.querySelectorAll("[data-delete-index]").forEach((btn) => {
      btn.onclick = () => {
        const index = parseInt(btn.dataset.deleteIndex);
        W.ui.confirm("Delete this snapshot?", () => {
          const snapshots = getSnapshots();
          snapshots.splice(snapshots.length - 1 - index, 1);
          saveSnapshots(snapshots);
          render(view);
          W.ui.toast("Snapshot deleted", "info");
        });
      };
    });
  }

  // ── Auto-save on portfolio changes ──────────────────────

  // Hook into portfolio methods to auto-save
  function hookPortfolio() {
    if (!W.portfolio) return;

    const originalAdd = W.portfolio.add;
    const originalRemove = W.portfolio.remove;
    const originalUpdate = W.portfolio.update;

    if (originalAdd) {
      W.portfolio.add = function (...args) {
        const result = originalAdd.apply(this, args);
        setTimeout(saveCurrentSnapshot, 100);
        return result;
      };
    }

    if (originalRemove) {
      W.portfolio.remove = function (...args) {
        const result = originalRemove.apply(this, args);
        setTimeout(saveCurrentSnapshot, 100);
        return result;
      };
    }

    if (originalUpdate) {
      W.portfolio.update = function (...args) {
        const result = originalUpdate.apply(this, args);
        setTimeout(saveCurrentSnapshot, 100);
        return result;
      };
    }
  }

  // ── Initialize ──────────────────────────────────────────
  setTimeout(hookPortfolio, 500);

  // ── Exports ──────────────────────────────────────────────
  W.time = {
    render,
    replay,
    saveCurrentSnapshot,
    getSnapshots,
    getSnapshotAt,
    calculatePerformance,
  };

  console.log("[TimeMachine] Module loaded.");
})();
