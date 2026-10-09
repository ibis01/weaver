// Evidence Card — renders a single provenance entry (refusal or signal)
// as a compact card with verdict, evidence, unknowns, and provenance.
// Reads from /provenance on the CF Worker.

(function () {
  "use strict";

  const WORKER_BASE = (() => {
    if (W.config && typeof W.config.workerBase === "string" && W.config.workerBase) {
      return W.config.workerBase;
    }
    // Local development: if the page is served from localhost, prefer the
    // local provenance mirror on :3002 so we do not depend on Cloudflare.
    try {
      const h = location.hostname;
      if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") {
        return "http://localhost:3002";
      }
    } catch {}
    return "https://weaver-proxy.ibis01-weaver.workers.dev";
  })();

  const esc = (W.fmt && W.fmt.escapeHTML)
    ? (s) => W.fmt.escapeHTML(String(s == null ? "" : s))
    : (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      }[c]));

  function fmtTime(ms) {
    if (!Number.isFinite(ms)) return "—";
    try {
      const d = new Date(ms);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    } catch { return "—"; }
  }

  function statusLabel(status) {
    if (status === "SIGNAL") return { text: "Signal", cls: "badge-signal" };
    if (status === "REFUSED_ANALYSIS") return { text: "No signal", cls: "badge-refused" };
    if (status === "REFUSED_PIPELINE") return { text: "Incomplete", cls: "badge-pipeline" };
    return { text: "Unknown", cls: "badge-unknown" };
  }

  // Normalize the pipeline result into supporting / contradicting / unknowns.
  function extractEvidence(entry) {
    const r = entry.result || {};
    const supporting = [];
    const contradicting = [];
    const unknowns = [];

    // Preferred: signal.evidence is present (signal fired)
    if (r.signal && r.signal.evidence) {
      const ev = r.signal.evidence;
      for (const s of ev.supporting || []) supporting.push(s);
      for (const c of ev.contradicting || []) contradicting.push(c);
      for (const u of ev.unknowns || []) unknowns.push(u);
    }

    // Analysis-level: derive from convergence + momentum
    if (r.convergence) {
      const c = r.convergence;
      if (c.convergence === true) {
        supporting.push(`Convergence: ${c.independentWalletCount} independent wallets accumulating`);
      } else if (c.reason === "insufficient-independent-wallets") {
        contradicting.push(`Only ${c.independentWalletCount || 0} independent wallets accumulating (need 3+)`);
      } else if (c.reason) {
        contradicting.push(`Convergence not met: ${c.reason}`);
      }
      if (c._limitations) {
        for (const k of Object.keys(c._limitations)) unknowns.push(c._limitations[k]);
      }
    }

    if (r.momentum) {
      const m = r.momentum;
      if (m.momentumState === "PRE_MOMENTUM") {
        supporting.push("Momentum: PRE_MOMENTUM — price and volume are flat");
      } else if (m.momentumState === "MOMENTUM_EMERGING") {
        contradicting.push("Momentum: already emerging — some pre-momentum advantage may be gone");
      } else if (m.momentumState === "MOMENTUM_CONFIRMED") {
        contradicting.push("Momentum: already confirmed — signal is too late");
      } else if (m.momentumState === "unknown") {
        unknowns.push("Momentum state could not be determined");
      }
      if (m.signals) {
        const s = m.signals;
        if (Number.isFinite(s.return1h)) {
          supporting.push(`1h return: ${s.return1h >= 0 ? "+" : ""}${s.return1h.toFixed(2)}%`);
        }
        if (Number.isFinite(s.return6h)) {
          supporting.push(`6h return: ${s.return6h >= 0 ? "+" : ""}${s.return6h.toFixed(2)}%`);
        }
        if (Number.isFinite(s.return24h)) {
          supporting.push(`24h return: ${s.return24h >= 0 ? "+" : ""}${s.return24h.toFixed(2)}%`);
        }
        if (Number.isFinite(s.volumeZ)) {
          supporting.push(`Volume z-score: ${s.volumeZ.toFixed(2)}σ`);
        }
      }
      if (m._limitations) {
        for (const k of Object.keys(m._limitations)) unknowns.push(m._limitations[k]);
      }
    }

    // Pipeline-level refusal (no convergence block at all)
    if (!r.convergence && entry.reason) {
      contradicting.push(`Pipeline refused: ${entry.reason}`);
    }

    return { supporting, contradicting, unknowns };
  }

  function renderSection(title, items, emptyText, icon) {
    if (!items.length) {
      return `<section class="ec-section"><h4>${icon} ${esc(title)}</h4><p class="ec-empty">${esc(emptyText)}</p></section>`;
    }
    return `<section class="ec-section"><h4>${icon} ${esc(title)}</h4><ul>${items
      .map((it) => `<li>${esc(it)}</li>`)
      .join("")}</ul></section>`;
  }

  function renderCard(entry) {
    if (!entry || typeof entry !== "object") return "";
    const s = statusLabel(entry.status);
    const ev = extractEvidence(entry);
    const time = fmtTime(entry.ranAt);
    const verdict =
      entry.status === "SIGNAL"
        ? "Early smart-money accumulation detected"
        : entry.status === "REFUSED_ANALYSIS"
          ? "No signal — evidence does not meet threshold"
          : entry.status === "REFUSED_PIPELINE"
            ? "Analysis incomplete — pipeline could not finish"
            : "Unknown result";

    return `
      <article class="evidence-card" data-symbol="${esc(entry.symbol)}">
        <header class="ec-header">
          <span class="ec-symbol">${esc(entry.symbol || "?")}</span>
          <span class="ec-status ${s.cls}">${esc(s.text)}</span>
          <span class="ec-time">${esc(time)}</span>
        </header>
        <p class="ec-verdict">${esc(verdict)}</p>
        <p class="ec-reason"><b>Reason:</b> ${esc(entry.reason || "—")}</p>
        ${renderSection("Supporting evidence", ev.supporting, "None recorded.", "🟢")}
        ${renderSection("Contradicting evidence", ev.contradicting, "None recorded.", "🔴")}
        ${renderSection("Unknowns", ev.unknowns, "No gaps recorded.", "❓")}
        <footer class="ec-footer">
          <button class="btn ghost" data-action="inspect">Inspect source</button>
          <button class="btn ghost" data-action="watch">Add to watchlist</button>
        </footer>
      </article>
    `;
  }

  async function fetchProvenance(limit = 50) {
    try {
      const url = `${WORKER_BASE}/provenance?limit=${limit}`;
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return Array.isArray(data.entries) ? data.entries : [];
    } catch (e) {
      console.warn("[EvidenceCard] fetch failed:", e.message);
      return null;
    }
  }

  function render(container, entries) {
    if (!container) return;
    if (entries === null) {
      container.innerHTML =
        '<div class="card"><p class="muted small">Could not reach the intelligence worker. Check that weaver-proxy is deployed and the network is available.</p></div>';
      return;
    }
    if (!entries.length) {
      container.innerHTML =
        '<div class="card"><p class="muted small">No investigations yet. The worker records every cycle — check back in a minute.</p></div>';
      return;
    }
    container.innerHTML = `<div class="evidence-list">${entries.map(renderCard).join("")}</div>`;
    container.querySelectorAll(".evidence-card").forEach((el) => {
      el.addEventListener("click", (e) => {
        const action = e.target && e.target.dataset && e.target.dataset.action;
        if (action === "inspect") {
          e.stopPropagation();
          const symbol = el.dataset.symbol;
          const entry = entries.find((x) => x.symbol === symbol);
          if (entry) {
            const json = JSON.stringify(entry, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
          }
        }
      });
    });
  }

  async function mount(container) {
    if (!container) return;
    container.innerHTML = '<div class="card"><p class="muted small">Loading investigations…</p></div>';
    const entries = await fetchProvenance(50);
    render(container, entries);
  }

  W.evidenceCard = { render, renderCard, mount, fetchProvenance, extractEvidence };
  console.log("[EvidenceCard] Module loaded");
})();
