// ===============================================================
//         Unified Decision Engine (decision-engine-v2)
// ===============================================================

window.W = window.W || {};

W.decisionEngine = (() => {
  const MODULE_VERSION = "decision-engine-v2";
  const CACHE_TTL = 60000;

  // ── Canonical enums (with safe fallbacks for test environments) ──
  const ELIGIBILITY =
    W.intelligence?.types?.ELIGIBILITY ||
    Object.freeze({
      ELIGIBLE: "ELIGIBLE",
      INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
    });

  const ACTION =
    W.intelligence?.types?.RECOMMENDED_ACTION ||
    Object.freeze({
      MONITOR: "MONITOR",
      REVIEW: "REVIEW",
      ACT: "ACT",
      EXIT: "EXIT",
      IGNORE: "IGNORE",
    });

  // Signal types whose mere presence warrants a review, regardless of
  // numeric score. Mapped to ACTION.REVIEW because the canonical
  // enum does not distinguish "review risk" from "review thesis" —
  // that distinction is a UI concern, and the UI has the
  // `_signalType` field available for it.
  const RISK_SIGNAL_TYPES = new Set(["THESIS_DETERIORATION", "SECURITY_RISK"]);

  // Unconditionally market-wide: any instance is relevant to every
  // user regardless of personal context. A regime shift describes
  // the environment itself, not an asset within it.
  const MARKET_WIDE_TYPES = new Set(["REGIME_SHIFT"]);

  // Tier-conditional market-wide: relevant to every user *when the
  // signal is about a major-cap asset*. A 4% BTC move is market
  // news; a 4% move in a $200M token is not. The producer (see
  // events.js collectPriceEvents) tags the signal with
  // rawData.marketCapTier. Mid and small cap moves still require a
  // holdings/watchlist/thesis match, which is the correct default.
  const TIER_CONDITIONAL_TYPES = new Set(["PRICE_MOVE"]);
  const MARKET_WIDE_TIER = "major";

  function isMarketWide(signal) {
    const type = signal?.type;
    if (!type) return false;
    if (MARKET_WIDE_TYPES.has(type)) return true;
    if (TIER_CONDITIONAL_TYPES.has(type)) {
      return signal?.rawData?.marketCapTier === MARKET_WIDE_TIER;
    }
    return false;
  }

  // ── Warn-once bookkeeping ─────────────────────────────
  const _warned = Object.create(null);
  function warnOnce(reason, msg) {
    if (_warned[reason]) return;
    _warned[reason] = 1;
    console.warn(msg);
  }

  // ── Cached run state ──────────────────────────────────
  let _cache = null;
  let _cacheTime = 0;

  // ── Helper: safe module access ────────────────────────
  function safeCall(fn, fallback) {
    try {
      const v = typeof fn === "function" ? fn() : undefined;
      return v === undefined ? fallback : v;
    } catch (e) {
      warnOnce(
        "module-failure",
        `[DecisionEngine] A dependent module threw; using fallback. ${e && e.message}`,
      );
      return fallback;
    }
  }

  // ── Helper: Personal context ──────────────────────────
  function computePersonalContext(
    assetId,
    portfolio,
    watchlist,
    theses,
    journal,
    behavior,
    settings,
  ) {
    const symbol =
      assetId && typeof assetId.symbol === "string"
        ? assetId.symbol.toUpperCase()
        : "";

    let portfolioWeight = 0;
    let watchlistStatus = "NOT_WATCHING";
    let thesisStatus = "NONE";
    let recentDecisions = 0;
    let behavioralRisk = "NONE";
    let thesisHealth = 0;
    let decisionConfidence = null;

    if (Array.isArray(portfolio) && symbol) {
      const totalValue = portfolio.reduce(
        (sum, h) => sum + (Number.isFinite(h?.value) ? h.value : 0),
        0,
      );
      if (totalValue > 0) {
        const held = portfolio
          .filter(
            (h) =>
              typeof h?.symbol === "string" &&
              h.symbol.toUpperCase() === symbol,
          )
          .reduce(
            (sum, h) => sum + (Number.isFinite(h?.value) ? h.value : 0),
            0,
          );
        portfolioWeight = Math.max(0, Math.min(1, held / totalValue));
      }
    }

    if (Array.isArray(watchlist) && symbol) {
      const watching = watchlist.some((w) => {
        const s = typeof w === "string" ? w : w?.symbol;
        return typeof s === "string" && s.toUpperCase() === symbol;
      });
      if (watching) watchlistStatus = "WATCHING";
    }

    if (Array.isArray(theses) && symbol) {
      const thesis = theses.find((t) => {
        const s = t?.assetId?.symbol || t?.symbol;
        return typeof s === "string" && s.toUpperCase() === symbol;
      });
      if (thesis) {
        thesisStatus = thesis.status === "active" ? "ACTIVE" : "INVALIDATED";
        if (thesis.status === "active" && W.thesisHealth?.evaluate) {
          try {
            const holding = portfolio.find(
              (h) =>
                typeof h?.symbol === "string" &&
                h.symbol.toUpperCase() === symbol,
            );
            const price = Number.isFinite(holding?.price)
              ? holding.price
              : null;
            const health = W.thesisHealth.evaluate(thesis, { price }, []);
            if (health && Number.isFinite(health.healthScore)) {
              thesisHealth = Math.max(0, Math.min(100, health.healthScore));
            }
          } catch {
            /* health evaluation is best-effort */
          }
        }
      }
    }

    if (Array.isArray(journal) && symbol) {
      const weekAgo = Date.now() - 7 * 86400000;
      const recent = journal.filter((d) => {
        const s = d?.assetId?.symbol || d?.asset;
        const ts = Number(d?.timestamp);
        return (
          typeof s === "string" &&
          s.toUpperCase() === symbol &&
          Number.isFinite(ts) &&
          ts > weekAgo
        );
      });
      recentDecisions = recent.length;

      const stated = recent
        .map((d) => Number(d?.confidence))
        .filter((c) => Number.isFinite(c) && c >= 0 && c <= 1);
      if (stated.length > 0) {
        decisionConfidence =
          stated.reduce((sum, c) => sum + c, 0) / stated.length;
      }
    }

    if (behavior && typeof behavior.pattern === "string") {
      const p = behavior.pattern.toUpperCase();
      if (p === "PANIC" || p === "FOMO") behavioralRisk = p;
    }

    return {
      assetId,
      portfolioWeight,
      watchlistStatus,
      thesisStatus,
      recentDecisions,
      behavioralRisk,
      thesisHealth,
      decisionConfidence,
      riskLimit:
        Number.isFinite(settings?.riskLimit) &&
        settings.riskLimit >= 0 &&
        settings.riskLimit <= 1
          ? settings.riskLimit
          : 0.5,
      timeHorizon:
        settings?.timeHorizon === "short" ||
        settings?.timeHorizon === "medium" ||
        settings?.timeHorizon === "long"
          ? settings.timeHorizon
          : "medium",
      chainExposure: 0,
      sectorExposure: 0,
    };
  }

  // ── Helper: Assessment ────────────────────────────────
  function computeAssessment(signal, context, evidence) {
    // Relevance — always a number. Built from numeric inputs with
    // well-defined zero defaults.
    let relevance = 0;

    // Market-wide signals carry a baseline relevance regardless of
    // the user's holdings. See isMarketWide for the exact rule. The
    // baseline is deliberately small (0.3): large enough that the
    // resulting score clears the `score > 0` filter in run(), small
    // enough that a held-asset signal outranks it.
    if (isMarketWide(signal)) relevance += 0.3;

    if (context.portfolioWeight > 0) relevance += context.portfolioWeight * 0.4;
    if (context.watchlistStatus === "WATCHING") relevance += 0.2;
    if (context.thesisStatus === "ACTIVE") relevance += 0.2;
    relevance += Math.min(1, context.recentDecisions / 5) * 0.1;
    if (
      context.behavioralRisk === "PANIC" ||
      context.behavioralRisk === "FOMO"
    ) {
      relevance += 0.1;
    }
    relevance = Math.max(0, Math.min(1, relevance));

    // Confidence — preserve null. Only a finite number in [0, 1] is
    // accepted; anything else becomes null.
    let confidence = null;
    if (
      evidence &&
      Number.isFinite(evidence.confidence) &&
      evidence.confidence >= 0 &&
      evidence.confidence <= 1
    ) {
      confidence = evidence.confidence;
    }

    // Severity — the signal's own claim about how large the event is.
    const rawSeverity = signal?.rawData?.impactValue;
    let eventSeverity;
    if (Number.isFinite(rawSeverity)) {
      eventSeverity = Math.max(0, Math.min(1, rawSeverity));
    } else {
      eventSeverity = 0.5;
      warnOnce(
        "severity-fallback",
        "[DecisionEngine] One or more signals have no impactValue; using neutral default 0.5 for severity. Producers should set this field.",
      );
    }

    // Impact — null when confidence is null.
    let impact = null;
    if (confidence !== null) {
      impact = confidence * eventSeverity * (context.portfolioWeight * 2 + 0.2);
      impact = Math.max(0, Math.min(1, impact));
    }

    // Urgency — signal-type aware, always a number.
    let urgency = 0.5;
    if (signal?.type === "UNLOCK") {
      const now = Date.now();
      const eventTime = Number(signal?.rawData?.date);
      const daysLeft = Number.isFinite(eventTime)
        ? (eventTime - now) / 86400000
        : 7;
      urgency = Math.max(0, Math.min(1, 1 - daysLeft / 14));
    } else if (signal?.type === "PRICE_MOVE") {
      const change = Math.abs(
        Number(signal?.rawData?.price_change_percentage_24h) || 0,
      );
      urgency = Math.max(0, Math.min(1, change / 10));
    }

    const reasoning = [
      `Relevance: ${(relevance * 100).toFixed(0)}%`,
      impact === null
        ? `Impact: unavailable (confidence unknown, severity ${(eventSeverity * 100).toFixed(0)}%)`
        : `Impact: ${(impact * 100).toFixed(0)}%`,
      `Urgency: ${(urgency * 100).toFixed(0)}%`,
      confidence === null
        ? "Confidence: unavailable (evidence incomplete)"
        : `Confidence: ${(confidence * 100).toFixed(0)}%`,
    ];

    let userCalibration = null;
    if (W.calibration?.forAsset) {
      try {
        const r = W.calibration.forAsset(signal.assetId);
        if (r && r.score != null) userCalibration = r;
      } catch {
        /* optional */
      }
    }

    return {
      relevance,
      impact,
      urgency,
      confidence,
      reasoning,
      userCalibration,
    };
  }

  // ── Helper: Decision priority ─────────────────────────
  function computeDecisionPriority(signal, assessment) {
    const reasoning = Array.isArray(assessment?.reasoning)
      ? assessment.reasoning
      : [];

    const hasAll =
      Number.isFinite(assessment.relevance) &&
      Number.isFinite(assessment.impact) &&
      Number.isFinite(assessment.urgency) &&
      Number.isFinite(assessment.confidence);

    let score = null;
    if (hasAll) {
      score =
        assessment.relevance *
        assessment.impact *
        assessment.urgency *
        assessment.confidence;
      score = Math.max(0, Math.min(1, score));
    }

    const eligibility = hasAll
      ? ELIGIBILITY.ELIGIBLE
      : ELIGIBILITY.INSUFFICIENT_EVIDENCE;

    let recommendedAction = ACTION.MONITOR;
    if (signal?.type && RISK_SIGNAL_TYPES.has(signal.type)) {
      recommendedAction = ACTION.REVIEW;
    } else if (eligibility === ELIGIBILITY.INSUFFICIENT_EVIDENCE) {
      recommendedAction = ACTION.MONITOR;
    } else if (score >= 0.7) {
      recommendedAction = ACTION.ACT;
    } else if (score >= 0.4) {
      recommendedAction = ACTION.REVIEW;
    }

    const scoreText =
      score === null
        ? "Score: unavailable (insufficient evidence)"
        : `Score: ${(score * 100).toFixed(0)}%`;

    const symbol = signal?.assetId?.symbol || "asset";
    const type = signal?.type || "signal";

    const explanation =
      `Signal: ${type} for ${symbol}. ${scoreText}.` +
      (reasoning.length ? ` ${reasoning.join(". ")}` : "");

    return {
      signalId: String(signal?.id || ""),
      assessment: Object.freeze({ ...assessment }),
      score,
      eligibility,
      recommendedAction,
      explanation,
      methodologyVersion: MODULE_VERSION,
      scoreVersion: MODULE_VERSION,
      _assetSymbol: signal?.assetId?.symbol || "Asset",
      _signalType: signal?.type || "",
      _signalTitle: signal?.rawData?.title || signal?.type || "Signal",
    };
  }

  // ── Helper: Evidence construction ─────────────────────
  function buildEvidence(signal) {
    const meta = signal?.metadata || {};

    if (W.evidence && typeof W.evidence.build === "function") {
      try {
        const e = W.evidence.build(signal, meta);
        if (e) return e;
      } catch (err) {
        warnOnce(
          "evidence-build-failed",
          `[DecisionEngine] W.evidence.build threw; falling back to inline construction. ${err && err.message}`,
        );
      }
    }

    if (
      !W.intelligence?.computeConfidence ||
      !W.intelligence?.create?.evidence
    ) {
      return null;
    }

    const sourceReliability = W.intelligence.getSourceReliability(
      signal.source,
    );
    const dataFreshness = W.intelligence.computeFreshness(
      signal.timestamp,
      signal.type,
    );

    const confidence = W.intelligence.computeConfidence({
      sourceReliability,
      dataFreshness,
      corroborationCount: meta.corroborationCount || 1,
      dataCompleteness: meta.dataCompleteness,
      interpretationConfidence: meta.interpretationConfidence,
    });

    return W.intelligence.create.evidence({
      signalId: signal.id,
      sourceReliability,
      dataFreshness,
      corroborationCount: meta.corroborationCount || 1,
      dataCompleteness: Number.isFinite(meta.dataCompleteness)
        ? meta.dataCompleteness
        : 0,
      interpretationConfidence: Number.isFinite(meta.interpretationConfidence)
        ? meta.interpretationConfidence
        : 0,
      confidence,
      incomplete: confidence === null,
      reasoning: Array.isArray(signal.rawData?.reasoning)
        ? signal.rawData.reasoning.slice()
        : [],
    });
  }

  // ── Main pipeline ─────────────────────────────────────
  async function run() {
    const now = Date.now();
    if (_cache && now - _cacheTime < CACHE_TTL) {
      return _cache.slice();
    }

    let signals = [];
    try {
      const collected = await (W.events?.collectEvents?.() || []);
      if (Array.isArray(collected)) signals = collected;
    } catch (e) {
      warnOnce(
        "collect-events-failed",
        `[DecisionEngine] Signal collection failed: ${e && e.message}`,
      );
    }

    if (!signals.length) {
      _cache = Object.freeze([]);
      _cacheTime = now;
      return [];
    }

    const portfolio = safeCall(() => W.portfolio?.all?.(), []) || [];
    const watchlistRaw = safeCall(() => W.watchlist?.list?.(), []) || [];
    const watchlist = Array.isArray(watchlistRaw)
      ? watchlistRaw.map((w) => (typeof w === "string" ? w : w?.symbol))
      : [];
    const theses = safeCall(() => W.theses?.all?.(), []) || [];
    const journal = safeCall(() => W.journal?.all?.(), []) || [];
    const behavior = safeCall(() => W.behavior?.analyze?.(), {
      pattern: "none",
    }) || {
      pattern: "none",
    };
    const settings = safeCall(() => W.store?.get?.("settings", {}), {}) || {};

    const decisions = [];

    for (const signal of signals) {
      try {
        if (!W.intelligence?.is?.signal || !W.intelligence.is.signal(signal)) {
          continue;
        }

        const evidence = buildEvidence(signal);
        if (!evidence) continue;

        const context = computePersonalContext(
          signal.assetId,
          portfolio,
          watchlist,
          theses,
          journal,
          behavior,
          settings,
        );

        const assessment = computeAssessment(signal, context, evidence);
        const priority = computeDecisionPriority(signal, assessment);

        decisions.push(Object.freeze(priority));
      } catch (e) {
        warnOnce(
          "signal-failed",
          `[DecisionEngine] One or more signals failed processing: ${e && e.message}`,
        );
      }
    }

    decisions.sort((a, b) => {
      const aHas = a.score !== null;
      const bHas = b.score !== null;
      if (aHas && bHas) return b.score - a.score;
      if (aHas) return -1;
      if (bHas) return 1;
      return 0;
    });

    const filtered = decisions.filter(
      (d) =>
        d.eligibility === ELIGIBILITY.INSUFFICIENT_EVIDENCE ||
        (Number.isFinite(d.score) && d.score > 0),
    );

    _cache = Object.freeze(filtered);
    _cacheTime = now;
    return _cache.slice();
  }

  // ── Presentation ──────────────────────────────────────
  function render(container, decisions, limit = 5) {
    if (!container) return;
    const top = Array.isArray(decisions) ? decisions.slice(0, limit) : [];
    container.innerHTML = "";

    if (!top.length) {
      const empty = document.createElement("div");
      empty.className = "card";
      const p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "No actionable insights at this time.";
      empty.appendChild(p);
      container.appendChild(empty);
      return;
    }

    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = "⚡ Needs Attention";
    card.appendChild(title);

    const list = document.createElement("ul");
    list.className = "decision-list";

    for (const item of top) {
      const li = document.createElement("li");
      li.className = "decision-item";

      const header = document.createElement("div");
      header.className = "decision-header";

      const assetName = document.createElement("b");
      assetName.className = "decision-asset";
      assetName.textContent = item._assetSymbol || "Asset";

      const scoreSpan = document.createElement("span");
      scoreSpan.className = "muted small";
      scoreSpan.textContent =
        item.score === null
          ? "Evidence incomplete"
          : `Score: ${(item.score * 100).toFixed(0)}%`;

      header.appendChild(assetName);
      header.appendChild(scoreSpan);
      li.appendChild(header);

      const what = document.createElement("p");
      what.className = "small decision-title";
      what.textContent = item._signalTitle || `${item._signalType} detected`;
      li.appendChild(what);

      if (W.context && typeof W.context.generateContext === "function") {
        try {
          const eventObj = {
            symbol: item._assetSymbol,
            type: item._signalType,
            title: item._signalTitle,
            impactValue:
              item.assessment && Number.isFinite(item.assessment.impact)
                ? item.assessment.impact
                : undefined,
          };
          const userContext = {
            portfolio,
            watchlist,
            theses,
            journal,
            behavior,
          };
          const contextData = W.context.generateContext(eventObj, userContext);
          if (contextData?.whyItMatters) {
            const c = document.createElement("div");
            c.className = "small muted mt-4";
            c.textContent = contextData.whyItMatters;
            li.appendChild(c);
            if (
              contextData.recommendedAction &&
              contextData.personalRelevance !== "low"
            ) {
              const a = document.createElement("div");
              a.className = "small text-up mt-4";
              a.textContent = `→ ${contextData.recommendedAction}`;
              li.appendChild(a);
            }
          }
        } catch {
          /* context is optional */
        }
      } else if (item.explanation) {
        const f = document.createElement("div");
        f.className = "small muted mt-4";
        f.textContent = item.explanation;
        li.appendChild(f);
      }

      const confidence =
        item.assessment && Number.isFinite(item.assessment.confidence)
          ? item.assessment.confidence
          : null;

      if (confidence !== null) {
        const bar = document.createElement("div");
        bar.className = "decision-conf-bar";

        const label = document.createElement("span");
        label.className = "muted small";
        label.textContent = "Evidence Strength:";
        bar.appendChild(label);

        const track = document.createElement("div");
        track.className = "decision-bar";

        const fill = document.createElement("div");
        const pct = Math.round(confidence * 100);
        const bucket = Math.round(pct / 10) * 10;
        const tone =
          confidence > 0.7 ? "up" : confidence > 0.4 ? "warn" : "down";
        fill.className = `decision-bar-fill decision-bar-fill-${tone} decision-bar-fill-${bucket}`;
        track.appendChild(fill);
        bar.appendChild(track);

        const pctSpan = document.createElement("span");
        pctSpan.className = "muted small";
        pctSpan.textContent = `${pct}%`;
        bar.appendChild(pctSpan);
        li.appendChild(bar);

        if (confidence < 0.6) {
          const u = document.createElement("div");
          u.className = "small muted mt-4 italic";
          u.textContent =
            " This signal has significant uncertainty. Consider additional verification.";
          li.appendChild(u);
        }
      } else {
        const n = document.createElement("div");
        n.className = "small muted mt-8 italic";
        n.textContent =
          "Evidence incomplete — no confidence score available for this signal.";
        li.appendChild(n);
      }

      const action = document.createElement("div");
      action.className = "small decision-action";
      const map = {
        MONITOR: " Monitor",
        REVIEW: " Review",
        ACT: "Act",
        EXIT: " Exit",
        IGNORE: "— Ignore",
      };
      const actionText = item.recommendedAction || ACTION.MONITOR;
      action.textContent = `Suggested: ${map[actionText] || actionText}`;
      li.appendChild(action);

      list.appendChild(li);
    }

    card.appendChild(list);
    container.appendChild(card);
  }

  // ── Public API ────────────────────────────────────────
  return Object.freeze({
    run,
    render,
    computePersonalContext,
    computeAssessment,
    computeDecisionPriority,
    SCORE_VERSION: MODULE_VERSION,
    version: MODULE_VERSION,
    ELIGIBILITY: Object.freeze({
      ELIGIBLE: ELIGIBILITY.ELIGIBLE,
      INSUFFICIENT_EVIDENCE: ELIGIBILITY.INSUFFICIENT_EVIDENCE,
    }),
    clearCache: () => {
      _cache = null;
      _cacheTime = 0;
    },
    _internal: Object.freeze({
      buildEvidence,
      isMarketWide,
      RISK_SIGNAL_TYPES,
      MARKET_WIDE_TYPES,
      TIER_CONDITIONAL_TYPES,
      MARKET_WIDE_TIER,
      resetWarnings: () => {
        for (const k of Object.keys(_warned)) delete _warned[k];
      },
    }),
  });
})();

console.log(
  "[DecisionEngine] Module loaded (decision-engine-v2: canonical actions, signal.metadata, class-based render; tier-conditional market-wide relevance).",
);
