// ===============================================================
//         Weaver Evidence Drawer
// ===============================================================
// Modal listing supporting evidence, contradicting evidence, and
// unknowns for a Weaver conclusion.
//
// Constitution §2.2 (Transparency): every score or verdict must
// show its reasoning.
// Constitution §2.7 (Evidence Provenance): sources and methodology
// surfaced alongside conclusions.
//
// CSP Compliant: no style="" attributes. All user content passes
// through W.fmt.escapeHTML before insertion.
// ===============================================================

window.W = window.W || {};
W.ui = W.ui || {};

W.ui.evidenceDrawer = (() => {
  const esc = (s) =>
    W.fmt?.escapeHTML ? W.fmt.escapeHTML(String(s ?? "")) : String(s ?? "");

  function bucket(domains) {
    const out = { supporting: [], contradicting: [], unknowns: [] };
    if (!domains || typeof domains !== "object") return out;
    Object.entries(domains).forEach(([name, d]) => {
      const e = {
        name,
        status: (d && d.status) || "unknown",
        source: d && d.source,
        reasons: Array.isArray(d && d.reasons) ? d.reasons : [],
      };
      if (e.status === "verified" || e.status === "available")
        out.supporting.push(e);
      else if (e.status === "failed") out.contradicting.push(e);
      else out.unknowns.push(e);
    });
    return out;
  }

  function renderItems(items, empty) {
    if (!items.length) return '<p class="muted small">' + esc(empty) + "</p>";
    return (
      '<ul class="tx-list">' +
      items
        .map((it) => {
          const title = esc(it.title || it.name || "Evidence");
          const meta = esc([it.status, it.source].filter(Boolean).join(" · "));
          const detail = it.detail || it.evidence;
          const reasons = (it.reasons || [])
            .map((r) => '<p class="muted small mt-4">• ' + esc(r) + "</p>")
            .join("");
          return (
            "<li><div class=\"flex-between\"><b>" +
            title +
            '</b><span class="muted small">' +
            meta +
            "</span></div>" +
            (detail ? '<p class="muted small mt-4">' + esc(detail) + "</p>" : "") +
            reasons +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function open(result) {
    const r = result || {};
    const b = bucket(r.domains);
    const supporting = [
      ...(r.bullishEvidence || []).map((e) => ({
        title: e.title,
        detail: e.evidence,
        status: "supporting",
      })),
      ...b.supporting,
    ];
    const contradicting = [
      ...(r.bearishEvidence || []).map((e) => ({
        title: e.title,
        detail: e.evidence,
        status: "contradicting",
      })),
      ...(r.contradictions || []).map((c) => ({
        title: c.bull + " vs " + c.bear,
        detail: c.details,
        status: "contradicting",
      })),
      ...b.contradicting,
    ];
    const unknowns = [
      ...b.unknowns,
      ...((r.evidenceQuality && r.evidenceQuality.reasons) || []).map((x) => ({
        title: "Evidence gap",
        detail: x,
      })),
    ];
    const meta = [
      r.methodologyVersion ? "Methodology " + r.methodologyVersion : null,
      r.evidenceVersion ? "Evidence " + r.evidenceVersion : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const body =
      '<p class="small muted">' +
      esc(r.explanation || "Evidence behind the current scenario.") +
      "</p>" +
      (meta ? '<p class="small muted">' + esc(meta) + "</p>" : "") +
      '<div class="mt-12">' +
      "<h4>🟢 Supporting evidence</h4>" +
      renderItems(supporting, "None recorded.") +
      "<h4>🔴 Contradicting evidence</h4>" +
      renderItems(contradicting, "None recorded.") +
      "<h4>❓ Unknowns</h4>" +
      renderItems(unknowns, "No evidence gaps recorded.") +
      "</div>";

    const m = W.ui.modal({
      title: "Why this verdict?",
      body,
      footer: '<button class="btn ghost" data-a="close">Close</button>',
    });
    if (m.el) {
      const btn = m.el.querySelector('[data-a="close"]');
      if (btn) btn.onclick = m.close;
    }
    return m;
  }

  return { open };
})();

console.log("[EvidenceDrawer] Module loaded (CSP compliant).");
