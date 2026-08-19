// ===============================================================
//         "What Changed" Delta Engine
// ===============================================================
//
// Purpose: Compare current portfolio state with a previous
// snapshot to surface meaningful changes (Section 24).
//
// ===============================================================

window.W = window.W || {};
W.delta = (() => {
  const SNAPSHOT_KEY = "w_portfolio_snapshot";
  const SNAPSHOT_TTL = 60 * 60 * 1000; // 1 hour

  // ── Utilities (Section 21 & 22) ─────────────────────────
  function safeNum(val, fallback = 0) {
    return typeof val === "number" && !isNaN(val) ? val : fallback;
  }

  // ── Snapshot Management ─────────────────────────────────
  function getSnapshot() {
    const stored = W.store?.get(SNAPSHOT_KEY);
    if (!stored) return null;

    // If snapshot is too old, treat it as stale (optional, but good for UX)
    // For now, we return it regardless of age to show long-term deltas.
    return stored;
  }

  function saveSnapshot(currentTotals) {
    if (!currentTotals || !W.store) return;

    const snapshot = {
      timestamp: Date.now(),
      value: currentTotals.value,
      cost: currentTotals.cost,
      day: currentTotals.day,
      week: currentTotals.week,
    };

    W.store.set(SNAPSHOT_KEY, snapshot);
  }

  // ── Delta Computation ───────────────────────────────────
  function computePortfolioDeltas(currentTotals) {
    const previous = getSnapshot();
    const deltas = [];

    // Section 21: Never silently invent missing values.
    if (!previous) {
      return deltas;
    }

    const metrics = [
      { key: "value", label: "Total Portfolio Value" },
      { key: "day", label: "24h P/L" },
      { key: "week", label: "7d P/L" },
    ];

    metrics.forEach((m) => {
      const prev = safeNum(previous[m.key], 0);
      const curr = safeNum(currentTotals[m.key], 0);

      // Deterministic arithmetic (Section 22)
      const abs = curr - prev;
      const pct = prev !== 0 ? (abs / prev) * 100 : 0;

      // Only surface significant changes (e.g., > $10 or > 1%)
      if (Math.abs(abs) > 10 || Math.abs(pct) > 1) {
        deltas.push({
          type: "portfolio_value",
          metric: m.label,
          previousValue: prev,
          currentValue: curr,
          deltaAbsolute: abs,
          deltaPercent: pct,
          timestamp: new Date().toISOString(),
          significance: Math.abs(pct) > 5 ? "high" : "medium",
        });
      }
    });

    return deltas;
  }

  // ── Safe UI Renderer (Section 15) ───────────────────────
  function renderCard(container, deltas) {
    if (!container) return;
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = "📊 What Changed";
    card.appendChild(title);

    if (!deltas || deltas.length === 0) {
      const p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "No significant changes since your last visit.";
      card.appendChild(p);
    } else {
      const list = document.createElement("ul");
      list.style.cssText = "list-style:none; padding:0; margin:0;";

      deltas.forEach((d) => {
        const li = document.createElement("li");
        li.style.cssText =
          "padding: 8px 0; border-bottom: 1px solid var(--border, #30363d); display:flex; justify-content:space-between; align-items:center;";

        const label = document.createElement("span");
        label.textContent = d.metric; // SAFE: textContent

        const value = document.createElement("span");
        const isUp = d.deltaAbsolute >= 0;
        value.style.color = isUp
          ? "var(--up, #2ee6a8)"
          : "var(--down, #ff5c7a)";
        value.style.fontWeight = "bold";
        value.textContent = `${isUp ? "+" : ""}${W.fmt.money(d.deltaAbsolute)} (${isUp ? "+" : ""}${d.deltaPercent.toFixed(2)}%)`; // SAFE

        li.appendChild(label);
        li.appendChild(value);
        list.appendChild(li);
      });
      card.appendChild(list);
    }
    container.appendChild(card);
  }

  return { getSnapshot, saveSnapshot, computePortfolioDeltas, renderCard };
})();

console.log("[Delta] What Changed engine loaded.");
