// ===============================================================      
// //     Intelligence Feed — "What Matters Now" 
// ===============================================================

window.W = window.W || {};

W.intelligenceFeed = (() => {
  const MODULE_VERSION = "intelligence-feed-v2";

  // ── Caps ────────────────────────────────────────────────────
  const MAX_DECISIONS = 100;
  const MAX_REASONING_ITEMS = 20;
  const MAX_TITLE_LEN = 400;
  const MAX_REASON_LEN = 300;
  const MAX_SIGNAL_LEN = 80;

  // ── Escaping ───────────────────────────────────────────────
  // Local implementation first, then prefer W.fmt.escapeHTML if it
  // exists and behaves. Cannot throw.
  function localEsc(v) {
    if (v === null || v === undefined) return "";
    let s;
    try {
      s = String(v);
    } catch {
      return "";
    }
    if (!/[&<>"']/.test(s)) return s;
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const esc =
    W.fmt && typeof W.fmt.escapeHTML === "function"
      ? function (v) {
          try {
            return String(W.fmt.escapeHTML(String(v ?? "")));
          } catch {
            return localEsc(v);
          }
        }
      : localEsc;

  function capStr(v, max) {
    if (v === null || v === undefined) return "";
    let s;
    try {
      s = String(v);
    } catch {
      return "";
    }
    if (s.length > max) return s.slice(0, max) + "…";
    return s;
  }

  function safeProp(obj, key) {
    if (!obj || typeof obj !== "object") return undefined;
    try {
      return obj[key];
    } catch {
      return undefined;
    }
  }

  // ── Constitutional action labels ───────────────────────────
  // §2.4 / §4.3: "EXECUTE_TRADE" is NEVER shown to the user.
  //
  // Null-prototype objects so a lookup for "__proto__" or
  // "constructor" cannot reach Object.prototype.
  const ACTION_LABELS = (() => {
    const o = Object.create(null);
    o.MONITOR = "Monitor";
    o.REVIEW_THESIS = "Review Thesis";
    o.REBALANCE = "Review Allocation";
    o.EXECUTE_TRADE = "Review Position";
    o.LOG_DECISION = "Log Decision";
    o.REVIEW = "Review";
    o.ACT = "Review";
    o.EXIT = "Review";
    o.IGNORE = "Ignore";
    return Object.freeze(o);
  })();

  const ACTION_CLASSES = (() => {
    const o = Object.create(null);
    o.MONITOR = "priority-monitor";
    o.REVIEW_THESIS = "priority-review";
    o.REBALANCE = "priority-review";
    o.EXECUTE_TRADE = "priority-risk";
    o.LOG_DECISION = "priority-log";
    o.REVIEW = "priority-review";
    o.ACT = "priority-review";
    o.EXIT = "priority-risk";
    o.IGNORE = "priority-monitor";
    return Object.freeze(o);
  })();

  function lookup(map, key, fallback) {
    if (typeof key !== "string") return fallback;
    if (!Object.prototype.hasOwnProperty.call(map, key)) return fallback;
    return map[key];
  }

  // ── Confidence helpers ─────────────────────────────────────
  function isValidConfidence(c) {
    return typeof c === "number" && Number.isFinite(c);
  }

  function confidenceBucket(confidence) {
    if (!isValidConfidence(confidence)) return null;
    const pct = Math.max(0, Math.min(100, Math.round(confidence * 100)));
    return Math.round(pct / 10) * 10;
  }

  function confidenceColor(confidence) {
    if (!isValidConfidence(confidence)) return "muted";
    if (confidence >= 0.7) return "up";
    if (confidence >= 0.4) return "warn";
    return "down";
  }

  function renderConfidenceBar(confidence) {
    if (!isValidConfidence(confidence)) {
      return (
        '<div class="feed-confidence">' +
        '<span class="feed-confidence-label">Evidence strength unavailable</span>' +
        "</div>"
      );
    }
    const bucket = confidenceBucket(confidence);
    const color = confidenceColor(confidence);
    const pct = Math.round(confidence * 100);
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

  // ── Item rendering ─────────────────────────────────────────
  function renderItem(decision, index) {
    if (!decision || typeof decision !== "object") return "";

    const actionRaw =
      typeof decision.recommendedAction === "string"
        ? decision.recommendedAction
        : "MONITOR";
    const actionLabelRaw = lookup(ACTION_LABELS, actionRaw, "Monitor");
    const actionClass = lookup(ACTION_CLASSES, actionRaw, "priority-monitor");

    const title = capStr(
      decision.explanation || decision._signalTitle || "Signal detected",
      MAX_TITLE_LEN,
    );
    const asset = capStr(decision._assetSymbol || "", MAX_SIGNAL_LEN);
    const signalType = capStr(decision._signalType || "", MAX_SIGNAL_LEN);

    const assessment =
      decision.assessment && typeof decision.assessment === "object"
        ? decision.assessment
        : null;

    const rawReasoning = assessment ? safeProp(assessment, "reasoning") : null;
    const reasoningList = Array.isArray(rawReasoning)
      ? rawReasoning.slice(0, MAX_REASONING_ITEMS)
      : [];

    const reasoningHTML = reasoningList.length
      ? '<div class="feed-reasoning">' +
        reasoningList.map((r) => esc(capStr(r, MAX_REASON_LEN))).join(" · ") +
        "</div>"
      : "";

    const confidence = assessment ? safeProp(assessment, "confidence") : null;

    return (
      '<div class="feed-item" data-index="' +
      index +
      '" tabindex="0" role="button" ' +
      'aria-label="View evidence for ' +
      esc(asset || "signal") +
      '">' +
      '<div class="feed-item-header">' +
      '<span class="feed-item-title">' +
      (asset ? esc(asset) + " · " : "") +
      esc(title) +
      "</span>" +
      '<span class="priority-badge ' +
      actionClass +
      '">' +
      esc(actionLabelRaw) +
      "</span>" +
      "</div>" +
      (signalType
        ? '<div class="small-text text-muted">' + esc(signalType) + "</div>"
        : "") +
      reasoningHTML +
      renderConfidenceBar(confidence) +
      "</div>"
    );
  }

  // ── Drawer wiring ──────────────────────────────────────────
  function openEvidenceDrawer(d, decisions) {
    if (!W.ui || typeof W.ui.evidenceDrawer?.open !== "function") return;
    try {
      W.ui.evidenceDrawer.open({
        title: d._assetSymbol || "Signal Details",
        subtitle: d._signalType || "",
        verdict: {
          score:
            typeof d.score === "number" && Number.isFinite(d.score)
              ? Math.round(d.score * 100)
              : null,
          confidence:
            d.assessment && typeof d.assessment === "object"
              ? d.assessment.confidence
              : null,
          classification: lookup(
            ACTION_LABELS,
            d.recommendedAction,
            "Unclassified",
          ),
          evidenceQuality:
            d.eligibility === "ELIGIBLE" ? "SUFFICIENT" : "INSUFFICIENT",
        },
        reasoning: Array.isArray(d.assessment?.reasoning)
          ? d.assessment.reasoning
          : [],
        risks: [],
        evidence: null,
        sources: [],
        methodology: d.methodologyVersion || "decision-engine-v1",
        timestamp: Date.now(),
      });
    } catch (e) {
      console.warn("[IntelligenceFeed] drawer open failed:", e && e.message);
    }
  }

  // ── Public render ──────────────────────────────────────────
  function render(container, decisions) {
    if (!container || typeof container !== "object") return;

    try {
      const list = Array.isArray(decisions)
        ? decisions.slice(0, MAX_DECISIONS)
        : [];

      if (!list.length) {
        container.innerHTML =
          '<div class="card">' +
          '<p class="text-muted small">' +
          "No actionable intelligence at this time. " +
          "Weaver will surface signals here when evidence warrants your attention." +
          "</p>" +
          "</div>";
        return;
      }

      let html = "";
      for (let i = 0; i < list.length; i++) {
        try {
          html += renderItem(list[i], i);
        } catch (e) {
          console.warn(
            "[IntelligenceFeed] item render failed at index " + i + ":",
            e && e.message,
          );
        }
      }
      container.innerHTML = html;

      container.querySelectorAll(".feed-item").forEach(function (item) {
        const handler = function () {
          const idx = parseInt(item.dataset.index, 10);
          if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return;
          const d = list[idx];
          if (!d) return;
          openEvidenceDrawer(d, list);
        };

        item.addEventListener("click", handler);
        item.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handler();
          }
        });
      });
    } catch (e) {
      console.warn("[IntelligenceFeed] render failed:", e && e.message);
      try {
        container.innerHTML =
          '<div class="card">' +
          '<p class="text-muted small">' +
          "Intelligence feed could not be rendered." +
          "</p>" +
          "</div>";
      } catch {
        /* container itself is unusable; nothing else to do */
      }
    }
  }

  return Object.freeze({
    render,
    version: MODULE_VERSION,
    _internal: Object.freeze({
      esc,
      localEsc,
      capStr,
      safeProp,
      lookup,
      confidenceBucket,
      confidenceColor,
      renderConfidenceBar,
      renderItem,
      ACTION_LABELS,
      ACTION_CLASSES,
      constants: Object.freeze({
        MAX_DECISIONS,
        MAX_REASONING_ITEMS,
        MAX_TITLE_LEN,
        MAX_REASON_LEN,
        MAX_SIGNAL_LEN,
      }),
    }),
  });
})();

console.log(
  "[IntelligenceFeed] Module loaded (intelligence-feed-v2: safe escaper, prototype-safe maps, capped strings).",
);
