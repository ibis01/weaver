// ===============================================================
//     Intelligence Feed — "What Matters Now"
//     Constitution §2.2: Transparency Over Hype
//     Constitution §2.4: Never Financial Advice (no directive labels)
//     Constitution §4.3: No FOMO Design
//     Constitution §2.9: No False Precision
// ===============================================================
// Renders DecisionPriority[] from the Unified Decision Engine.
// CSP-safe: zero inline styles. Accessible: keyboard navigable.
// ===============================================================

window.W = window.W || {};

W.intelligenceFeed = (() => {
  // §2.4 / §4.3: Constitutional action labels.
  // "EXECUTE_TRADE" is NEVER shown to the user.
  var ACTION_LABELS = {
    MONITOR: "Monitor",
    REVIEW_THESIS: "Review Thesis",
    REBALANCE: "Review Allocation",
    EXECUTE_TRADE: "Review Position",
    LOG_DECISION: "Log Decision",
  };

  var ACTION_CLASSES = {
    MONITOR: "priority-monitor",
    REVIEW_THESIS: "priority-review",
    REBALANCE: "priority-review",
    EXECUTE_TRADE: "priority-risk",
    LOG_DECISION: "priority-log",
  };

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

  function renderConfidenceBar(confidence) {
    if (confidence == null || isNaN(confidence)) {
      return (
        '<div class="feed-confidence">' +
        '<span class="feed-confidence-label">Evidence strength unavailable</span>' +
        "</div>"
      );
    }
    var bucket = confidenceBucket(confidence);
    var color = confidenceColor(confidence);
    var pct = Math.round(confidence * 100);
    return (
      '<div class="feed-confidence">' +
      '<span class="feed-confidence-label">Evidence</span>' +
      '<div class="meter-bar feed-meter">' +
      '<div class="meter-fill meter-fill-' +
      bucket +
      " meter-fill-" +
      color +
      '"></div>' +
      "</div>" +
      '<span class="feed-confidence-label">' +
      pct +
      "%</span>" +
      "</div>"
    );
  }

  function renderItem(decision, index) {
    var action = decision.recommendedAction || "MONITOR";
    var actionLabel = W.fmt.escapeHTML(ACTION_LABELS[action] || action);
    var actionClass = ACTION_CLASSES[action] || "priority-monitor";
    var title = W.fmt.escapeHTML(
      decision.explanation || decision._signalTitle || "Signal detected",
    );
    var asset = W.fmt.escapeHTML(decision._assetSymbol || "");
    var signalType = W.fmt.escapeHTML(decision._signalType || "");

    var reasoningHTML = "";
    if (
      decision.assessment &&
      decision.assessment.reasoning &&
      decision.assessment.reasoning.length
    ) {
      reasoningHTML =
        '<div class="feed-reasoning">' +
        decision.assessment.reasoning
          .map(function (r) {
            return W.fmt.escapeHTML(r);
          })
          .join(" · ") +
        "</div>";
    }

    var confidence = decision.assessment
      ? decision.assessment.confidence
      : null;

    return (
      '<div class="feed-item" data-index="' +
      index +
      '" tabindex="0" role="button" ' +
      'aria-label="View evidence for ' +
      (asset || "signal") +
      '">' +
      '<div class="feed-item-header">' +
      '<span class="feed-item-title">' +
      (asset ? asset + " · " : "") +
      title +
      "</span>" +
      '<span class="priority-badge ' +
      actionClass +
      '">' +
      actionLabel +
      "</span>" +
      "</div>" +
      (signalType
        ? '<div class="small-text text-muted">' + signalType + "</div>"
        : "") +
      reasoningHTML +
      renderConfidenceBar(confidence) +
      "</div>"
    );
  }

  function render(container, decisions) {
    if (!container) return;

    if (!decisions || !decisions.length) {
      container.innerHTML =
        '<div class="card">' +
        '<p class="text-muted small">' +
        "No actionable intelligence at this time. " +
        "Weaver will surface signals here when evidence warrants your attention." +
        "</p>" +
        "</div>";
      return;
    }

    var html = "";
    for (var i = 0; i < decisions.length; i++) {
      html += renderItem(decisions[i], i);
    }
    container.innerHTML = html;

    // Wire click + keyboard handlers → Evidence Drawer (§5.2)
    container.querySelectorAll(".feed-item").forEach(function (item) {
      var handler = function () {
        var idx = parseInt(item.dataset.index, 10);
        var d = decisions[idx];
        if (!d || !W.ui.evidenceDrawer) return;

        W.ui.evidenceDrawer.open({
          title: d._assetSymbol || "Signal Details",
          subtitle: d._signalType || "",
          verdict: {
            score: d.score != null ? Math.round(d.score * 100) : null,
            confidence: d.assessment ? d.assessment.confidence : null,
            classification:
              ACTION_LABELS[d.recommendedAction] || "Unclassified",
            evidenceQuality:
              d.eligibility === "ELIGIBLE" ? "SUFFICIENT" : "INSUFFICIENT",
          },
          reasoning: d.assessment ? d.assessment.reasoning : [],
          risks: [],
          evidence: null,
          sources: [],
          methodology: d.methodologyVersion || "decision-engine-v1",
          timestamp: Date.now(),
        });
      };

      item.addEventListener("click", handler);
      item.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handler();
        }
      });
    });
  }

  return { render: render };
})();

console.log("[IntelligenceFeed] Module loaded.");
