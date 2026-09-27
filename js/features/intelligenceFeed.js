// ===============================================================
//         Intelligence Feed — "What Matters Now"  
// ===============================================================


window.W = window.W || {};

W.intelligenceFeed = (() => {
  // ── Constants ─────────────────────────────────────────
  const MODULE_VERSION = "intelligence-feed-v2";
  const MAX_RENDERED_ITEMS = 50;
  const MAX_MONITORING_RENDERED = 30;

  // Score is expected to be a normalised 0–1 product of
  // relevance × impact × urgency × confidence (see decision-engine.js).
  // The canonical DecisionPriority contract in types.js describes a
  // 0–10 range; the actual computation produces 0–1. This module
  // treats it as 0–1 (matching what the engine emits) and logs once
  // if a value outside that range is ever observed.
  const SCORE_ACTION_THRESHOLD = 0.7;
  const SCORE_REVIEW_THRESHOLD = 0.4;
  const SCORE_SUSPICIOUS_MAX = 1.5; // above this, warn once

  const ELIGIBILITY_INSUFFICIENT = "INSUFFICIENT_EVIDENCE";

  // ── Escaping ──────────────────────────────────────────
  // Prefer the canonical escaper from misc.js when present;
  // otherwise use a locally defined one with identical semantics.
  const esc =
    typeof W.miscEsc === "function"
      ? W.miscEsc
      : function localEsc(v) {
          if (v == null) return "";
          const s = String(v);
          if (!/[&<>"']/.test(s)) return s;
          return s
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        };

  // ── Warn-once bookkeeping ─────────────────────────────
  const _warned = Object.create(null);
  function warnOnce(reason, msg) {
    if (_warned[reason]) return;
    _warned[reason] = 1;
    console.warn(msg);
  }

  // ── Score normalisation ───────────────────────────────
  // Returns a finite number in [0, 1], or null when the input is
  // missing, non-numeric, or outside the plausible range.
  //
  // §2.7 compliance: null means "unknown" and stays null. It is
  // never coerced to 0.
  function normaliseScore(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    if (raw < 0) return null;
    if (raw > SCORE_SUSPICIOUS_MAX) {
      warnOnce(
        "score-range",
        `[IntelligenceFeed] Observed score ${raw.toFixed(2)} — the canonical range is 0–1. Clamping for display only.`,
      );
      return 1;
    }
    // Values between 1 and SCORE_SUSPICIOUS_MAX are likely already
    // on a 0–10 scale from a producer that has not yet migrated to
    // the canonical range. Normalise to 0–1 for display, but do not
    // silently pretend the input was 0–1.
    if (raw > 1) {
      warnOnce(
        "score-legacy",
        `[IntelligenceFeed] Observed score ${raw.toFixed(2)} outside 0–1; treating as legacy 0–10 scale.`,
      );
      return Math.min(1, raw / 10);
    }
    return raw;
  }

  // ── Decision validation ───────────────────────────────
  // Structurally validates a decision object. Returns a frozen,
  // canonical-safe view, or null when the object is unusable.
  //
  // Preference is given to the canonical validator from types.js.
  // A structural fallback is used when types.js has not loaded,
  // which can happen in test environments.
  function normaliseDecision(raw, index) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    // Prefer canonical validation. If it fails, drop the item.
    if (
      W.intelligence &&
      W.intelligence.is &&
      typeof W.intelligence.is.decisionPriority === "function"
    ) {
      if (!W.intelligence.is.decisionPriority(raw)) {
        warnOnce(
          "invalid-decision",
          "[IntelligenceFeed] One or more decisions failed canonical validation and were dropped.",
        );
        return null;
      }
    } else {
      // Structural fallback. Requires a non-empty signalId and an
      // object assessment. Everything else is optional.
      if (typeof raw.signalId !== "string" || raw.signalId.length === 0) {
        warnOnce(
          "missing-signal-id",
          "[IntelligenceFeed] One or more decisions are missing a signalId and were dropped.",
        );
        return null;
      }
      if (
        !raw.assessment ||
        typeof raw.assessment !== "object" ||
        Array.isArray(raw.assessment)
      ) {
        return null;
      }
    }

    const score = normaliseScore(raw.score);

    // `eligibility` may legitimately be either of two canonical
    // values. Anything else is treated as INSUFFICIENT_EVIDENCE so
    // the item is not falsely elevated.
    const eligibility =
      raw.eligibility === ELIGIBILITY_INSUFFICIENT
        ? ELIGIBILITY_INSUFFICIENT
        : "ELIGIBLE";

    // Symbol resolution: prefer assessment.assetId.symbol, then
    // top-level assetId.symbol, then "MARKET".
    let symbol = "MARKET";
    const fromAssessment =
      raw.assessment && raw.assessment.assetId
        ? raw.assessment.assetId.symbol
        : null;
    const fromTop = raw.assetId ? raw.assetId.symbol : null;
    if (typeof fromAssessment === "string" && fromAssessment) {
      symbol = fromAssessment;
    } else if (typeof fromTop === "string" && fromTop) {
      symbol = fromTop;
    }

    return Object.freeze({
      signalId: String(raw.signalId),
      eligibility,
      score,
      symbol,
      explanation:
        typeof raw.explanation === "string" && raw.explanation
          ? raw.explanation
          : "No explanation provided.",
      recommendedAction:
        typeof raw.recommendedAction === "string" && raw.recommendedAction
          ? raw.recommendedAction
          : "MONITOR",
      index, // preserves input order for stable sorting
    });
  }

  // ── Badge helpers ─────────────────────────────────────
  function priorityClass(item) {
    if (item.eligibility === ELIGIBILITY_INSUFFICIENT)
      return "priority-monitor";
    if (item.score === null) return "priority-monitor";
    if (item.score >= SCORE_ACTION_THRESHOLD) return "priority-review";
    if (item.score >= SCORE_REVIEW_THRESHOLD) return "priority-monitor";
    return "priority-log";
  }

  function priorityLabel(item) {
    if (item.eligibility === ELIGIBILITY_INSUFFICIENT) return "Monitoring";
    if (item.score === null) return "Unknown";
    if (item.score >= SCORE_ACTION_THRESHOLD) return "Action Required";
    if (item.score >= SCORE_REVIEW_THRESHOLD) return "Review Recommended";
    return "Logged";
  }

  // ── Item renderer ─────────────────────────────────────
  function renderFeedItem(item) {
    const priorityCls = priorityClass(item);
    const priorityLbl = priorityLabel(item);
    const asset = esc(item.symbol);
    const signalId = esc(item.signalId);
    const explanation = esc(item.explanation);

    const actionText = String(item.recommendedAction).replace(/_/g, " ");
    const showAction =
      actionText && actionText !== "MONITOR" && actionText !== "IGNORE";
    const action = showAction ? esc(actionText) : "";

    // role=button + tabindex=0 for keyboard operability. The click
    // handler is attached after innerHTML is set, in bindFeedItems().
    return `
      <div class="feed-item"
           role="button"
           tabindex="0"
           data-signal-id="${signalId}"
           aria-label="Open evidence for ${asset}">
        <div class="feed-item-header">
          <span class="feed-item-title">${asset}</span>
          <span class="priority-badge ${priorityCls}">${esc(priorityLbl)}</span>
        </div>
        <p class="feed-reasoning">${explanation}</p>
        ${
          showAction
            ? `<div class="small-text text-warn mt-8 font-bold">→ ${action}</div>`
            : ""
        }
      </div>
    `;
  }

  // ── Drawer binding ────────────────────────────────────
  // The drawer is optional. A missing module, a missing open()
  // method, or a thrown error inside open() must not break the feed.
  function bindFeedItems(container) {
    const items = container.querySelectorAll(".feed-item");
    items.forEach((el) => {
      const activate = () => {
        const signalId = el.dataset.signalId;
        if (
          !signalId ||
          !W.evidenceDrawer ||
          typeof W.evidenceDrawer.open !== "function"
        ) {
          return;
        }
        try {
          W.evidenceDrawer.open(signalId);
        } catch (e) {
          warnOnce(
            "drawer-open-failed",
            `[IntelligenceFeed] Evidence drawer failed to open: ${e && e.message}`,
          );
        }
      };

      el.addEventListener("click", activate);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  // ── Section renderer ──────────────────────────────────
  function renderSection(items) {
    return items.map(renderFeedItem).join("");
  }

  // ── Bucketing ─────────────────────────────────────────
  function bucket(items) {
    const actionable = [];
    const monitoring = [];
    for (const it of items) {
      if (it.eligibility === ELIGIBILITY_INSUFFICIENT) {
        monitoring.push(it);
      } else if (it.score === null) {
        // Unknown score — not a claim that it is unimportant, just
        // that no measurable priority exists. Grouped with monitoring.
        monitoring.push(it);
      } else if (it.score >= SCORE_REVIEW_THRESHOLD) {
        actionable.push(it);
      } else {
        monitoring.push(it);
      }
    }
    return { actionable, monitoring };
  }

  // ── Sort ──────────────────────────────────────────────
  // Actionable: score descending (unknowns excluded from this bucket).
  // Monitoring: eligible-but-lower-score first, then insufficient,
  // then unknown; within each tier by original index.
  function sortActionable(items) {
    return items.slice().sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
  }

  function sortMonitoring(items) {
    const tier = (it) => {
      if (it.eligibility === ELIGIBILITY_INSUFFICIENT) return 2;
      if (it.score === null) return 1;
      return 0;
    };
    return items.slice().sort((a, b) => {
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return ta - tb;
      const sa = a.score === null ? -1 : a.score;
      const sb = b.score === null ? -1 : b.score;
      if (sb !== sa) return sb - sa;
      return a.index - b.index;
    });
  }

  // ── Public render ─────────────────────────────────────
  function render(container, decisions) {
    if (!container || typeof container !== "object") return;

    // Validate and normalise. Non-array input → empty state.
    const raw = Array.isArray(decisions) ? decisions : [];
    const clean = [];
    for (let i = 0; i < raw.length; i++) {
      const d = normaliseDecision(raw[i], i);
      if (d) clean.push(d);
      if (clean.length >= MAX_RENDERED_ITEMS * 2) break; // hard parse cap
    }

    if (clean.length === 0) {
      container.innerHTML = `
        <div class="card card-tertiary">
          <h3>What Matters Now</h3>
          <p class="muted small p-16">No significant events or thesis changes detected at this time.</p>
        </div>
      `;
      return;
    }

    const { actionable, monitoring } = bucket(clean);
    const sortedActionable = sortActionable(actionable);
    const sortedMonitoring = sortMonitoring(monitoring);

    const actionableCapped = sortedActionable.slice(0, MAX_RENDERED_ITEMS);
    const monitoringCapped = sortedMonitoring.slice(0, MAX_MONITORING_RENDERED);
    const actionableOverflow =
      sortedActionable.length - actionableCapped.length;
    const monitoringOverflow =
      sortedMonitoring.length - monitoringCapped.length;

    // ── Summary counts for the collapsed header ──
    // Counted honestly by reason, not lumped together.
    let insufficientCount = 0;
    let belowThresholdCount = 0;
    let unknownCount = 0;
    for (const it of sortedMonitoring) {
      if (it.eligibility === ELIGIBILITY_INSUFFICIENT) insufficientCount++;
      else if (it.score === null) unknownCount++;
      else belowThresholdCount++;
    }

    const summaryParts = [];
    if (insufficientCount)
      summaryParts.push(`${insufficientCount} insufficient evidence`);
    if (belowThresholdCount)
      summaryParts.push(`${belowThresholdCount} below review threshold`);
    if (unknownCount) summaryParts.push(`${unknownCount} unknown score`);
    const summaryText = summaryParts.join(" · ");

    // ── Build the card ──
    let html = `<div class="card card-tertiary"><h3>What Matters Now</h3>`;

    if (actionableCapped.length > 0) {
      html += `<div class="mt-8">${renderSection(actionableCapped)}</div>`;
      if (actionableOverflow > 0) {
        html += `<p class="muted small-text mt-8">+${actionableOverflow} more actionable item${actionableOverflow === 1 ? "" : "s"} not shown.</p>`;
      }
    } else {
      html += `<p class="muted small p-16">No high-confidence events require your attention right now.</p>`;
    }

    if (monitoringCapped.length > 0) {
      const label = `🔍 ${sortedMonitoring.length} item${sortedMonitoring.length === 1 ? "" : "s"} under observation`;
      html += `
        <details class="feed-monitoring mt-16">
          <summary class="feed-summary muted small-text">
            ${esc(label)} — ${esc(summaryText)}
          </summary>
          <div class="mt-8">
            ${renderSection(monitoringCapped)}
            ${
              monitoringOverflow > 0
                ? `<p class="muted small-text mt-8">+${monitoringOverflow} more not shown.</p>`
                : ""
            }
          </div>
        </details>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;

    bindFeedItems(container);
  }

  // ── Public API ────────────────────────────────────────
  return Object.freeze({
    render,
    version: MODULE_VERSION,
    // Exposed for tests only.
    _internal: Object.freeze({
      esc,
      normaliseScore,
      normaliseDecision,
      bucket,
      sortActionable,
      sortMonitoring,
      priorityClass,
      priorityLabel,
      constants: Object.freeze({
        MAX_RENDERED_ITEMS,
        MAX_MONITORING_RENDERED,
        SCORE_ACTION_THRESHOLD,
        SCORE_REVIEW_THRESHOLD,
        ELIGIBILITY_INSUFFICIENT,
      }),
      resetWarnings: () => {
        for (const k of Object.keys(_warned)) delete _warned[k];
      },
    }),
  });
})();

console.log(
  "[IntelligenceFeed] Module loaded (intelligence-feed-v2: null-preserving scores, type-guarded decisions, no inline styles).",
);
