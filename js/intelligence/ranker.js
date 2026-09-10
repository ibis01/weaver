// ===============================================================
//         Ranker / Presentation Layer
// ===============================================================
// CSP Compliant: Zero inline styles.
// ===============================================================

window.W = window.W || {};
W.ranker = (() => {
  function renderCard(container, items, context) {
    if (!container) return;

    const top = (items || []).slice(0, 3);
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = "⚡ What Matters Now";
    card.appendChild(title);

    if (top.length === 0) {
      const p = document.createElement("p");
      p.className = "text-muted small-text";
      p.textContent = "No significant events detected right now.";
      card.appendChild(p);
    } else {
      const list = document.createElement("ul");
      list.className = "mt-8";

      top.forEach((item) => {
        const li = document.createElement("li");
        li.className = "py-4 border-b";

        const header = document.createElement("div");
        header.className = "flex-between";

        const sym = document.createElement("b");
        sym.textContent = item.symbol || "MARKET";

        const score = document.createElement("span");
        score.className = "text-muted small-text";
        score.textContent = `Priority: ${(item.score * 100).toFixed(0)}%`;

        header.appendChild(sym);
        header.appendChild(score);
        li.appendChild(header);

        const desc = document.createElement("p");
        desc.className = "small-text text-muted mt-4";
        desc.textContent =
          item.explanation ||
          item.title ||
          item.description ||
          "Event detected.";
        li.appendChild(desc);

        if (item.recommendedAction && item.recommendedAction !== "MONITOR") {
          const action = document.createElement("div");
          action.className = "small-text text-warn mt-8 font-bold";
          action.textContent = `→ ${item.recommendedAction.replace("_", " ")}`;
          li.appendChild(action);
        }

        list.appendChild(li);
      });
      card.appendChild(list);
    }
    container.appendChild(card);
  }

  return { renderCard };
})();

console.log("[Ranker] Presentation layer loaded (CSP compliant).");
