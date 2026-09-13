// ===============================================================
// Data freshness status UI
// ===============================================================

window.W = window.W || {};
W.ui = W.ui || {};

W.ui.renderDataStatus = function (container, resources = []) {
  if (!container) return;
  container.replaceChildren();
  const statuses = resources.map(
    (resource) =>
      W.dataHealth?.get(resource) || {
        resource,
        source: "unknown",
        state: "unknown",
        ageMs: null,
      },
  );
  const stale = statuses.filter((item) => item.state === "stale");
  const unknown = statuses.filter((item) => item.state === "unknown");
  const wrapper = document.createElement("div");
  wrapper.className = `data-status ${stale.length ? "data-status-stale" : "data-status-ok"}`;
  const title = document.createElement("strong");
  title.textContent = stale.length ? "⚠ Data may be stale" : "✓ Data freshness";
  wrapper.appendChild(title);

  const details = document.createElement("span");
  details.className = "data-status-details";
  details.textContent = statuses
    .map((item) => {
      const label = item.resource.replaceAll("-", " ");
      if (item.state === "unknown") return `${label}: unavailable`;
      const age = formatAge(item.ageMs);
      return `${label}: ${age} (${item.source})`;
    })
    .join(" · ");
  wrapper.appendChild(details);

  if (unknown.length || stale.length) {
    const note = document.createElement("span");
    note.className = "data-status-note";
    note.textContent = "Verify important decisions against a current source.";
    wrapper.appendChild(note);
  }
  container.appendChild(wrapper);
};

function formatAge(ageMs) {
  if (!Number.isFinite(ageMs)) return "unknown age";
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

W.ui.formatDataAge = formatAge;
console.log("[DataStatus] Freshness UI loaded.");
