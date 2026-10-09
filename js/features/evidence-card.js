// Evidence Card — renders a single provenance entry (refusal or signal)
// as a compact card. Clicking "View details" opens an in-page modal
// with the full provenance chain, evidence sections, and raw JSON.
//
// Phase 2, Block 1.

(function () {
  "use strict";

  const WORKER_BASE = (() => {
    if (W.config && typeof W.config.workerBase === "string" && W.config.workerBase) {
      return W.config.workerBase;
    }
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

  // Plain-English translation of the pipeline's reason codes. Shown
  // in the detail modal so a user does not have to read the pipeline
  // source to understand what happened.
  const REASON_EXPLAINERS = {
    "insufficient-independent-wallets":
      "Weaver found fewer than three independent historically-early wallets buying this token within the last 15 minutes. It needs at least three whose trading histories are not correlated with each other before it will call the pattern meaningful. Zero qualifying wallets is the common case.",
    "no-holders":
      "The on-chain indexer (Blockscout) did not return a holder list for this token. This is usually a transient issue with the indexer rather than a property of the token. Weaver will retry on the next cycle.",
    "no-candidates-profiled":
      "The holder list came back, but none of the eligible holders could be profiled — likely because their trade history could not be fetched within the timeout.",
    "smart-fetchHolders-unavailable":
      "The holder-fetch module was not loaded when this cycle ran. This is a wiring problem, not a market signal.",
    "convergence-detector-unavailable":
      "The convergence detector module was not loaded when this cycle ran.",
    "momentum-detector-unavailable":
      "The momentum detector module was not loaded when this cycle ran.",
    "smart-entry-engine-unavailable":
      "The signal composition module was not loaded when this cycle ran.",
    "pipeline-error":
      "The pipeline threw an exception while processing this token. The message field carries the specific error.",
    "no-signal":
      "No signal was emitted this cycle. No further detail was recorded.",
  };

  function fmtTime(ms) {
    if (!Number.isFinite(ms)) return "—";
    try {
      const d = new Date(ms);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    } catch { return "—"; }
  }

  function fmtDateTime(ms) {
    if (!Number.isFinite(ms)) return "—";
    try { return new Date(ms).toLocaleString(); } catch { return "—"; }
  }

  function statusLabel(status) {
    if (status === "SIGNAL") return { text: "Signal", cls: "badge-signal" };
    if (status === "REFUSED_ANALYSIS") return { text: "No signal", cls: "badge-refused" };
    if (status === "REFUSED_PIPELINE") return { text: "Incomplete", cls: "badge-pipeline" };
    return { text: "Unknown", cls: "badge-unknown" };
  }

  function extractEvidence(entry) {
    const r = entry.result || {};
    const supporting = [];
    const contradicting = [];
    const unknowns = [];

    if (r.signal && r.signal.evidence) {
      const ev = r.signal.evidence;
      for (const s of ev.supporting || []) supporting.push(s);
      for (const c of ev.contradicting || []) contradicting.push(c);
      for (const u of ev.unknowns || []) unknowns.push(u);
    }

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

  // ── Card (compact view) ─────────────────────────────
  function renderCard(entry, index) {
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
      <article class="evidence-card" data-index="${index}" data-symbol="${esc(entry.symbol)}">
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
          <button class="btn ghost" data-action="details" type="button">View details</button>
        </footer>
      </article>
    `;
  }

  // ── Detail modal content ────────────────────────────
  function buildDetailModalHTML(entry) {
    const r = entry.result || {};
    const s = statusLabel(entry.status);
    const ev = extractEvidence(entry);
    const explainer = REASON_EXPLAINERS[entry.reason] || "No explanation recorded for this reason code.";

    // Provenance chain — the invariant. Every Weaver claim must be
    // traceable through this sequence.
    const chain = [
      "Signal (" + esc(entry.symbol || "?") + ")",
      "Assessment",
      "Evidence",
      "Observation",
      "Source",
    ].map((step, i) => {
      const arrow = i > 0 ? '<span class="ec-detail-chain-arrow">→</span>' : "";
      return `${arrow}<span class="ec-detail-chain-step">${step}</span>`;
    }).join("");

    // Qualifying wallets (populated only on SIGNAL)
    let walletsHTML = "";
    if (r.convergence && Array.isArray(r.convergence.qualifyingWallets) && r.convergence.qualifyingWallets.length) {
      const rows = r.convergence.qualifyingWallets.map((w) => {
        const addr = typeof w.wallet === "string" ? w.wallet : (w.address || "");
        const short = addr.slice(0, 8) + "…" + addr.slice(-6);
        const link = addr
          ? `<a class="link small" href="https://etherscan.io/address/${encodeURIComponent(addr)}" target="_blank" rel="noopener noreferrer">${esc(short)} ↗</a>`
          : esc(short);
        const rate = Number.isFinite(w.historicalEarlyEntryRate)
          ? (w.historicalEarlyEntryRate * 100).toFixed(0) + "%"
          : "—";
        return `<li>${link} · early-entry rate ${esc(rate)} · ${esc(w.buyCount || 0)} buys</li>`;
      }).join("");
      walletsHTML = `<section class="ec-section"><h4>🎯 Qualifying wallets</h4><ul>${rows}</ul></section>`;
    }

    // Block explorer links
    const tokenAddr = entry.tokenAddress || (r.tokenAddress);
    const links = [];
    if (tokenAddr) {
      links.push(`<a class="link small" href="https://etherscan.io/token/${encodeURIComponent(tokenAddr)}" target="_blank" rel="noopener noreferrer">Token on Etherscan ↗</a>`);
      links.push(`<a class="link small" href="https://eth.blockscout.com/token/${encodeURIComponent(tokenAddr)}" target="_blank" rel="noopener noreferrer">Token on Blockscout ↗</a>`);
    }

    return `
      <div class="ec-detail">
        <dl class="ec-detail-summary">
          <dt>Symbol</dt><dd>${esc(entry.symbol || "?")}</dd>
          <dt>Status</dt><dd><span class="ec-status ${s.cls}">${esc(s.text)}</span></dd>
          <dt>Reason</dt><dd><code>${esc(entry.reason || "—")}</code></dd>
          <dt>Ran at</dt><dd>${esc(fmtDateTime(entry.ranAt))}</dd>
          ${tokenAddr ? `<dt>Token</dt><dd><code>${esc(tokenAddr)}</code></dd>` : ""}
        </dl>

        <div class="ec-detail-reason-explainer">
          <b>What this means:</b> ${esc(explainer)}
        </div>

        <section class="ec-detail-chain-section">
          <h4>🔗 Provenance chain</h4>
          <div class="ec-detail-chain">${chain}</div>
          <p class="muted small">Every Weaver claim traces backward through this sequence. Click through the evidence below to verify.</p>
        </section>

        ${walletsHTML}

        ${renderSection("Supporting evidence", ev.supporting, "None recorded.", "🟢")}
        ${renderSection("Contradicting evidence", ev.contradicting, "None recorded.", "🔴")}
        ${renderSection("Unknowns", ev.unknowns, "No gaps recorded.", "❓")}

        ${links.length ? `<section class="ec-detail-links">${links.join(" ")}</section>` : ""}

        <details class="ec-detail-raw">
          <summary>Raw provenance JSON</summary>
          <pre>${esc(JSON.stringify(entry, null, 2))}</pre>
        </details>
      </div>
    `;
  }

  function openDetailModal(entry) {
    const html = buildDetailModalHTML(entry);
    if (W.ui && typeof W.ui.modal === "function") {
      let modal = null;
      try {
        modal = W.ui.modal({
          title: `${entry.symbol || "?"} · ${statusLabel(entry.status).text}`,
          body: html,
          footer: '<button class="btn ghost" data-a="close" type="button">Close</button>',
        });
      } catch (e) {
        console.warn("[EvidenceCard] modal failed:", e.message);
      }
      if (modal && modal.el) {
        const btn = modal.el.querySelector('[data-a="close"]');
        if (btn && modal.close) btn.onclick = modal.close;
      }
      return modal;
    }
    // Fallback: simple overlay if W.ui.modal is not available
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;padding:40px;overflow:auto;";
    overlay.innerHTML = `<div style="max-width:760px;margin:0 auto;background:#111;border:1px solid #222;border-radius:10px;padding:20px;">${html}</div>`;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
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
    container.innerHTML = `<div class="evidence-list">${entries.map((e, i) => renderCard(e, i)).join("")}</div>`;
    container.querySelectorAll(".evidence-card").forEach((el) => {
      el.addEventListener("click", (event) => {
        const target = event.target;
        if (!target || typeof target.closest !== "function") return;
        const btn = target.closest('[data-action="details"]');
        if (!btn) return;
        const idx = parseInt(el.dataset.index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= entries.length) return;
        openDetailModal(entries[idx]);
      });
    });
  }

  async function mount(container) {
    if (!container) return;
    container.innerHTML = '<div class="card"><p class="muted small">Loading investigations…</p></div>';
    const entries = await fetchProvenance(50);
    render(container, entries);
  }

  W.evidenceCard = {
    render,
    renderCard,
    mount,
    fetchProvenance,
    extractEvidence,
    openDetailModal,
    buildDetailModalHTML,
    REASON_EXPLAINERS,
  };
  console.log("[EvidenceCard] Module loaded (phase-2-block-1: detail modal, reason explainers)");
})();
