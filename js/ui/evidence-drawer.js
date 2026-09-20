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
// Every evidence item renders six provenance fields:
//   source, observedAt, freshness, methodologyVersion,
//   relationship, reliability.
// Missing values render as "unknown". A missing relationship is
// never silently upgraded to "supporting".
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
      // Relationship is inferred from the domain's own status field.
      // That is the domain's claim about itself, not ours.
      const status = (d && d.status) || "unknown";
      const relationship =
        status === "verified" || status === "available"
          ? "supporting"
          : status === "failed"
            ? "contradicting"
            : "unknown";
      const e = {
        name,
        status,
        source: d && d.source,
        observedAt: d && (d.observedAt || d.asOf),
        freshness: d && d.freshness,
        methodologyVersion: d && d.methodologyVersion,
        relationship,
        reliability: d && d.reliability,
        reasons: Array.isArray(d && d.reasons) ? d.reasons : [],
      };
      if (relationship === "supporting") out.supporting.push(e);
      else if (relationship === "contradicting") out.contradicting.push(e);
      else out.unknowns.push(e);
    });
    return out;
  }

  // ── Provenance rendering ────────────────────────────────
  // Every field renders. Missing values become the literal string
  // "unknown" — they are never omitted, because an omitted field
  // reads as "not applicable" rather than "not known".
  function formatProvenanceField(label, rawValue) {
    const v =
      rawValue === null || rawValue === undefined || rawValue === ""
        ? "unknown"
        : String(rawValue);
    return label + ": " + v;
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? Math.round(value * 100) + "%" : null;
  }

  function formatDate(value) {
    if (!value) return null;
    try {
      const d = new Date(value);
      if (!Number.isFinite(d.getTime())) return null;
      return d.toLocaleString();
    } catch (_) {
      return null;
    }
  }

  function renderProvenance(it) {
    const fields = [
      formatProvenanceField("Source", it.source),
      formatProvenanceField("Observed", formatDate(it.observedAt)),
      formatProvenanceField("Freshness", formatPercent(it.freshness)),
      formatProvenanceField("Methodology", it.methodologyVersion),
      formatProvenanceField("Relationship", it.relationship),
      formatProvenanceField("Reliability", formatPercent(it.reliability)),
    ];
    return '<p class="muted text-2xs mt-4">' + esc(fields.join(" · ")) + "</p>";
  }

  function renderItems(items, empty) {
    if (!items.length) return '<p class="muted small">' + esc(empty) + "</p>";
    return (
      '<ul class="tx-list">' +
      items
        .map((it) => {
          const title = esc(it.title || it.name || "Evidence");
          const meta = esc(it.status || "");
          const detail = it.detail || it.evidence;
          const reasons = (it.reasons || [])
            .map((r) => '<p class="muted small mt-4">• ' + esc(r) + "</p>")
            .join("");
          return (
            '<li><div class="flex-between"><b>' +
            title +
            '</b><span class="muted small">' +
            meta +
            "</span></div>" +
            renderProvenance(it) +
            (detail
              ? '<p class="muted small mt-4">' + esc(detail) + "</p>"
              : "") +
            reasons +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  // Carry provenance fields from a source evidence object onto the
  // drawer item, so renderItems() has all six fields regardless of
  // which layer produced the item.
  function carryProvenance(item, source) {
    const s = source || {};
    return {
      ...item,
      source: item.source ?? s.source,
      observedAt: item.observedAt ?? s.observedAt ?? s.timestamp,
      freshness: item.freshness ?? s.freshness,
      methodologyVersion: item.methodologyVersion ?? s.methodologyVersion,
      relationship: item.relationship ?? s.relationship ?? "unknown",
      reliability: item.reliability ?? s.reliability,
    };
  }

  function open(result) {
    const r = result || {};
    const b = bucket(r.domains);

    const supporting = [
      ...(r.bullishEvidence || []).map((e) =>
        carryProvenance(
          {
            title: e.title,
            detail: e.evidence,
            status: "supporting",
            relationship: "supporting",
          },
          e,
        ),
      ),
      ...b.supporting,
    ];

    const contradicting = [
      ...(r.bearishEvidence || []).map((e) =>
        carryProvenance(
          {
            title: e.title,
            detail: e.evidence,
            status: "contradicting",
            relationship: "contradicting",
          },
          e,
        ),
      ),
      ...(r.contradictions || []).map((c) =>
        carryProvenance({
          title: c.bull + " vs " + c.bear,
          detail: c.details,
          status: "contradicting",
          relationship: "contradicting",
        }),
      ),
      ...b.contradicting,
    ];

    const unknowns = [
      ...b.unknowns,
      ...((r.evidenceQuality && r.evidenceQuality.reasons) || []).map((x) =>
        carryProvenance({
          title: "Evidence gap",
          detail: x,
          relationship: "unknown",
        }),
      ),
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

  return {
    open,
    // Exposed for tests only.
    _internal: { bucket, renderItems, renderProvenance, carryProvenance },
  };
})();

console.log("[EvidenceDrawer] Module loaded (CSP compliant).");
