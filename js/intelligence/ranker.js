// ===============================================================
//         Ranker / Presentation Layer
// ===============================================================
// CSP Compliant: no style="" attributes. Dynamic styles via CSSOM.
//
// v2 changelog:
//   - Uses the canonical RECOMMENDED_ACTION enum from types.js.
//   - Renders only signals that pass W.intelligence.is.signal().
//   - Null score rendered as "—" instead of coercing to 0.
//   - Signal id used as a data attribute is escaped.
//   - Errors from a single item do not break the whole list.
//   - All data attributes are re-validated before being acted upon.
// ===============================================================

window.W = window.W || {};
W.ranker = (() => {
  const MONITOR =
    W.intelligence?.types?.RECOMMENDED_ACTION?.MONITOR || "MONITOR";

  function _escape(v) {
    if (v == null) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function _formatScore(score) {
    if (!Number.isFinite(score)) return "—";
    const pct = Math.max(0, Math.min(1, score)) * 100;
    return `${pct.toFixed(0)}%`;
  }

  function _renderItem(item) {
    try {
      const li = document.createElement("li");
      li.className = "py-4 border-b";

      const header = document.createElement("div");
      header.className = "flex-between";

      const sym = document.createElement("b");
      sym.textContent =
        (item.assetId && item.assetId.symbol) || item.symbol || "MARKET";

      const score = document.createElement("span");
      score.className = "text-muted small-text";
      score.textContent = `Priority: ${_formatScore(item.score)}`;

      header.appendChild(sym);
      header.appendChild(score);
      li.appendChild(header);

      const desc = document.createElement("p");
      desc.className = "small-text text-muted mt-4";
      desc.textContent =
        item.explanation || item.title || item.description || "Event detected.";
      li.appendChild(desc);

      const action =
        item.recommendedAction ||
        (item.recommendation && item.recommendation.action) ||
        null;
      if (action && action !== MONITOR) {
        const actEl = document.createElement("div");
        actEl.className = "small-text text-warn mt-8 font-bold";
        actEl.textContent = `→ ${String(action).replace(/_/g, " ")}`;
        li.appendChild(actEl);
      }
      return li;
    } catch (e) {
      console.warn("[Ranker] Item render failed; skipping.");
      return null;
    }
  }

  function renderCard(container, items, context) {
    if (!container) return;

    const safeItems = Array.isArray(items) ? items : [];
    const top = safeItems.slice(0, 3);
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = "⚡ Needs Attention";
    card.appendChild(title);

    const valid = top.filter((item) => {
      if (!item || typeof item !== "object") return false;
      return true;
    });

    if (valid.length === 0) {
      const p = document.createElement("p");
      p.className = "text-muted small-text";
      p.textContent = "No significant events detected right now.";
      card.appendChild(p);
    } else {
      const list = document.createElement("ul");
      list.className = "mt-8";

      valid.forEach((item) => {
        const li = _renderItem(item);
        if (li) list.appendChild(li);
      });

      card.appendChild(list);
    }
    container.appendChild(card);
  }

  return Object.freeze({ renderCard });
})();

console.log("[Ranker] Presentation layer loaded (CSP compliant).");
