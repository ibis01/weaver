// ===============================================================
//     Evidence Drawer — Progressive Disclosure
//     Constitution §5.2: Summary → Why → Risks → Evidence → Sources
//     Constitution §2.2: Transparency Over Hype
//     Constitution §5.4: Accessibility (focus trap, Escape, ARIA)
//     Constitution §2.9: No False Precision
// ===============================================================
// CSP-safe: zero inline styles. All layout via CSS classes.
// ===============================================================

window.W = window.W || {};
W.ui = W.ui || {};

W.ui.evidenceDrawer = (() => {
  var overlay = null;
  var drawer = null;
  var previousFocus = null;
  var isOpen = false;

  // ── DOM Setup (lazy, created once) ────────────────────────
  function ensureDOM() {
    if (drawer) return;

    overlay = document.createElement("div");
    overlay.className = "drawer-overlay";
    overlay.addEventListener("click", close);

    drawer = document.createElement("div");
    drawer.className = "evidence-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Evidence details");

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) close();
    });
  }

  // ── Confidence Helpers (§2.9 No False Precision) ─────────
  function confidenceBucket(confidence) {
    if (confidence == null || isNaN(confidence)) return null;
    var pct = Math.max(0, Math.min(100, Math.round(confidence * 100)));
    return Math.round(pct / 10) * 10;
  }

  function confidenceColor(confidence) {
    if (confidence == null || isNaN(confidence)) return "muted";
    if (confidence >= 0.7) return "up";
    if (confidence >= 0.4) return "warn";
    return "down";
  }

  // ── Section Renderers ─────────────────────────────────────

  function renderVerdict(data) {
    if (!data.verdict) return "";
    var v = data.verdict;
    var scoreDisplay = v.score != null ? v.score : "—";
    var confDisplay =
      v.confidence != null
        ? Math.round(v.confidence * 100) + "%"
        : "Unavailable";
    var classification = W.fmt.escapeHTML(v.classification || "Unclassified");
    var quality = W.fmt.escapeHTML(v.evidenceQuality || "UNKNOWN");

    return (
      '<div class="drawer-verdict">' +
      "<div>" +
      '<div class="drawer-score">' +
      scoreDisplay +
      "</div>" +
      '<div class="drawer-score-label">Score</div>' +
      "</div>" +
      "<div>" +
      '<div class="font-bold">' +
      classification +
      "</div>" +
      '<div class="small-text text-muted">Evidence: ' +
      quality +
      "</div>" +
      '<div class="small-text text-muted">Confidence: ' +
      confDisplay +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderReasoning(reasons) {
    if (!reasons || !reasons.length)
      return '<p class="text-muted small">No reasoning available.</p>';
    return reasons
      .map(function (r) {
        return (
          '<div class="evidence-item">' +
          '<span class="evidence-icon text-up">+</span>' +
          "<span>" +
          W.fmt.escapeHTML(r) +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderRisks(risks) {
    if (!risks || !risks.length)
      return '<p class="text-muted small">No risk factors identified.</p>';
    return risks
      .map(function (r) {
        return (
          '<div class="evidence-item">' +
          '<span class="evidence-icon text-warn">−</span>' +
          "<span>" +
          W.fmt.escapeHTML(r) +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderEvidenceList(evidence) {
    if (!evidence)
      return '<p class="text-muted small">No evidence available.</p>';
    var html = "";

    if (evidence.supporting && evidence.supporting.length) {
      html += '<div class="drawer-section-title">Supporting Evidence</div>';
      html += evidence.supporting
        .map(function (e) {
          var title = W.fmt.escapeHTML(e.title || e.fact || "Evidence");
          var source = e.source
            ? '<div class="evidence-source">' +
              W.fmt.escapeHTML(e.source) +
              (e.timestamp ? " · " + W.fmt.relativeTime(e.timestamp) : "") +
              "</div>"
            : "";
          return (
            '<div class="evidence-item">' +
            '<span class="evidence-icon text-up">✓</span>' +
            "<div><span>" +
            title +
            "</span>" +
            source +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    if (evidence.conflicting && evidence.conflicting.length) {
      html += '<div class="drawer-section-title">Conflicting Evidence</div>';
      html += evidence.conflicting
        .map(function (e) {
          var title = W.fmt.escapeHTML(e.title || e.fact || "Evidence");
          var source = e.source
            ? '<div class="evidence-source">' +
              W.fmt.escapeHTML(e.source) +
              "</div>"
            : "";
          return (
            '<div class="evidence-item">' +
            '<span class="evidence-icon text-down">✗</span>' +
            "<div><span>" +
            title +
            "</span>" +
            source +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    if (evidence.missing && evidence.missing.length) {
      html += '<div class="drawer-section-title">Missing Evidence</div>';
      html += evidence.missing
        .map(function (m) {
          return (
            '<div class="evidence-item">' +
            '<span class="evidence-icon text-muted">—</span>' +
            '<span class="text-muted">' +
            W.fmt.escapeHTML(m) +
            "</span>" +
            "</div>"
          );
        })
        .join("");
    }

    if (!html) return '<p class="text-muted small">No evidence available.</p>';
    return html;
  }

  function renderSources(sources) {
    if (!sources || !sources.length) return "";
    return (
      '<div class="drawer-section">' +
      '<div class="drawer-section-title">Data Sources</div>' +
      sources
        .map(function (s) {
          var name = W.fmt.escapeHTML(s.name || s.source || "Unknown");
          var time = s.timestamp ? W.fmt.relativeTime(s.timestamp) : "Unknown";
          return (
            '<div class="kv-row">' +
            "<span>" +
            name +
            "</span>" +
            '<span class="text-muted small">' +
            time +
            "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderMethodology(data) {
    var html =
      '<div class="drawer-section">' +
      '<div class="drawer-section-title">Methodology & Provenance</div>';

    if (data.methodology) {
      html +=
        '<div class="kv-row"><span>Version</span>' +
        '<span class="text-muted small">' +
        W.fmt.escapeHTML(data.methodology) +
        "</span></div>";
    }
    if (data.timestamp) {
      html +=
        '<div class="kv-row"><span>Generated</span>' +
        '<span class="text-muted small">' +
        W.fmt.relativeTime(data.timestamp) +
        "</span></div>";
    }
    if (data.verdict && data.verdict.confidence != null) {
      var bucket = confidenceBucket(data.verdict.confidence);
      var color = confidenceColor(data.verdict.confidence);
      var pct = Math.round(data.verdict.confidence * 100);
      html +=
        '<div class="kv-row"><span>Evidence Strength</span>' +
        '<div class="feed-confidence">' +
        '<div class="meter-bar meter-bar-sm">' +
        '<div class="meter-fill meter-fill-' +
        bucket +
        " meter-fill-" +
        color +
        '"></div>' +
        "</div>" +
        '<span class="text-muted small">' +
        pct +
        "%</span>" +
        "</div>" +
        "</div>";
    }

    html += "</div>";
    return html;
  }

  // ── Public API ────────────────────────────────────────────

  function open(data) {
    ensureDOM();
    previousFocus = document.activeElement;

    var title = W.fmt.escapeHTML(data.title || "Evidence Details");
    var subtitle = W.fmt.escapeHTML(data.subtitle || "");
    var bodyHTML = "";

    // §5.2 Progressive Disclosure order:
    // Summary → Why → Risks → Evidence → Sources → Methodology
    bodyHTML += renderVerdict(data);

    if (data.reasoning && data.reasoning.length) {
      bodyHTML +=
        '<div class="drawer-section">' +
        '<div class="drawer-section-title">Why</div>' +
        renderReasoning(data.reasoning) +
        "</div>";
    }

    if (data.risks && data.risks.length) {
      bodyHTML +=
        '<div class="drawer-section">' +
        '<div class="drawer-section-title">Risk Factors</div>' +
        renderRisks(data.risks) +
        "</div>";
    }

    if (data.evidence) {
      bodyHTML +=
        '<div class="drawer-section">' +
        renderEvidenceList(data.evidence) +
        "</div>";
    }

    bodyHTML += renderSources(data.sources);
    bodyHTML += renderMethodology(data);

    drawer.innerHTML =
      '<div class="drawer-header">' +
      "<div>" +
      '<h3 id="drawer-title">' +
      title +
      "</h3>" +
      (subtitle ? '<div class="drawer-subtitle">' + subtitle + "</div>" : "") +
      "</div>" +
      '<button class="drawer-close" aria-label="Close evidence panel">✕</button>' +
      "</div>" +
      '<div class="drawer-body">' +
      bodyHTML +
      "</div>";

    drawer.querySelector(".drawer-close").addEventListener("click", close);

    overlay.classList.add("visible");
    drawer.classList.add("open");
    isOpen = true;

    var closeBtn = drawer.querySelector(".drawer-close");
    if (closeBtn) closeBtn.focus();

    document.body.classList.add("body-drawer-open");
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("visible");
    drawer.classList.remove("open");
    document.body.classList.remove("body-drawer-open");

    if (previousFocus) {
      previousFocus.focus();
      previousFocus = null;
    }
  }

  return { open: open, close: close };
})();

console.log("[EvidenceDrawer] Module loaded.");
