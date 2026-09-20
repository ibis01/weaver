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
// RELATIONSHIP POLICY:
//   `relationship` describes how an item relates to the scenario
//   being evaluated: supporting, contradicting, neutral, or unknown.
//   It is NEVER inferred from `status`.
//
//   A domain with status "verified" has not necessarily supported
//   the thesis — it means the data was successfully obtained.
//   A domain with status "failed" has not necessarily contradicted
//   the thesis — it means the data was not obtained.
//
//   When a domain does not declare its relationship, the drawer
//   places it under "Unknowns". It is never silently upgraded to
//   "supporting" or demoted to "contradicting".
//
// TRAJECTORY POLICY:
//   The drawer receives an already-summarised trajectory string. It
//   does not read W.observations or call summariseTrajectory(). The
//   caller is responsible for both. When the summary is absent or
//   empty, the trajectory line is omitted from the body.
//
// OWNER POLICY:
//   Same contract as the trajectory line. The drawer receives an
//   already-summarised owner string. It does not read
//   W.ownerAssociations — the caller does.
//
// DEPLOYER POLICY:
//   Same contract again. The drawer receives an already-summarised
//   deployer string. It does not read W.deployerGraph — the caller
//   does. The absence of the line does not mean the deployer is
//   safe; it means no deployer profile was available for this token.
//
// CSP Compliant: no style="" attributes. All user content passes
// through W.fmt.escapeHTML before insertion.
// ===============================================================

window.W = window.W || {};
W.ui = W.ui || {};

W.ui.evidenceDrawer = (() => {
  const esc = (s) =>
    W.fmt?.escapeHTML ? W.fmt.escapeHTML(String(s ?? "")) : String(s ?? "");

  const RELATIONSHIP_VALUES = new Set([
    "supporting",
    "contradicting",
    "neutral",
    "unknown",
  ]);

  function normalizeRelationship(value) {
    if (typeof value !== "string") return "unknown";
    const v = value.trim().toLowerCase();
    return RELATIONSHIP_VALUES.has(v) ? v : "unknown";
  }

  // ── Bucketing ───────────────────────────────────────────
  // Relationship drives the bucket. Status is preserved on the item
  // for display but does not determine where the item appears.
  //
  // A domain declaring relationship: "neutral" is placed under
  // Unknowns — the drawer has three sections and neutral evidence
  // is neither for nor against the thesis. Callers that want a
  // distinct "neutral" section can extend the return shape, but the
  // current three-bucket contract is unchanged.
  function bucket(domains) {
    const out = { supporting: [], contradicting: [], unknowns: [] };
    if (!domains || typeof domains !== "object") return out;
    Object.entries(domains).forEach(([name, d]) => {
      const relationship = normalizeRelationship(d && d.relationship);
      const e = {
        name,
        status: (d && d.status) || "unknown",
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
  //
  // relationship is NOT defaulted to "supporting" here — a caller
  // that produced bullish evidence has already declared that
  // relationship upstream, and this carry function preserves it.
  function carryProvenance(item, source) {
    const s = source || {};
    return {
      ...item,
      source: item.source ?? s.source,
      observedAt: item.observedAt ?? s.observedAt ?? s.timestamp,
      freshness: item.freshness ?? s.freshness,
      methodologyVersion: item.methodologyVersion ?? s.methodologyVersion,
      relationship: item.relationship ?? normalizeRelationship(s.relationship),
      reliability: item.reliability ?? s.reliability,
    };
  }

  // Renders the optional trajectory line. Returns "" when no
  // summary is supplied, so the caller can concatenate the result
  // unconditionally.
  function renderTrajectoryLine(summary) {
    if (typeof summary !== "string" || !summary.trim()) return "";
    return '<p class="small"><b>Trajectory:</b> ' + esc(summary) + "</p>";
  }

  // Renders the optional owner-association line. Same pattern as
  // renderTrajectoryLine: the drawer receives an already-summarised
  // string from the caller and does not read W.ownerAssociations.
  function renderOwnerLine(summary) {
    if (typeof summary !== "string" || !summary.trim()) return "";
    return '<p class="small"><b>Owner:</b> ' + esc(summary) + "</p>";
  }

  // Renders the optional deployer line. Same pattern as the owner
  // and trajectory lines. The drawer receives an already-summarised
  // string from the caller and does not read W.deployerGraph.
  //
  // The absence of this line does not mean the deployer is safe;
  // it means no deployer profile was available for this token.
  function renderDeployerLine(summary) {
    if (typeof summary !== "string" || !summary.trim()) return "";
    return '<p class="small"><b>Deployer:</b> ' + esc(summary) + "</p>";
  }

  function open(result) {
    const r = result || {};
    const b = bucket(r.domains);

    // Optional. Absent when the token has no retained history,
    // when the observations module is unavailable, or when the
    // caller does not supply it. The drawer renders normally.
    const trajectorySummary =
      typeof r.trajectorySummary === "string" && r.trajectorySummary.trim()
        ? r.trajectorySummary
        : null;

    // Same shape as trajectorySummary: optional, absent when the
    // token has no owner association this session, when the
    // module is unavailable, or when the caller does not supply it.
    const ownerSummary =
      typeof r.ownerSummary === "string" && r.ownerSummary.trim()
        ? r.ownerSummary
        : null;

    // Same shape again: optional. Absent when no deployer profile
    // is cached for the token.
    const deployerSummary =
      typeof r.deployerSummary === "string" && r.deployerSummary.trim()
        ? r.deployerSummary
        : null;

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
      renderTrajectoryLine(trajectorySummary) +
      renderOwnerLine(ownerSummary) +
      renderDeployerLine(deployerSummary) +
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
    _internal: {
      bucket,
      renderItems,
      renderProvenance,
      renderTrajectoryLine,
      renderOwnerLine,
      renderDeployerLine,
      carryProvenance,
      normalizeRelationship,
    },
  };
})();

console.log("[EvidenceDrawer] Module loaded (CSP compliant).");
