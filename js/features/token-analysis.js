// ===============================================================
//         Token Analysis – Evidence-Driven Decision Workflow
// ===============================================================

window.W = window.W || {};

W.tokenAnalysis = (() => {
  function fundamentalReport(data) {
    const market = data?.market_data || {};
    const cap = Number(market.market_cap?.usd),
      volume = Number(market.total_volume?.usd);
    const rank = Number(data?.market_cap_rank),
      circulating = Number(market.circulating_supply),
      total = Number(market.total_supply);
    const ath = Number(market.ath?.usd),
      current = Number(market.current_price?.usd);
    const positives = [],
      negatives = [],
      factors = [];
    let score = 50;
    if (Number.isFinite(rank)) {
      score += rank <= 20 ? 15 : rank <= 100 ? 7 : -5;
      factors.push(`Market-cap rank ${rank}`);
    }
    if (cap > 0 && volume >= cap * 0.05) {
      score += 10;
      positives.push("Healthy 24h volume relative to market cap");
    } else if (cap > 0 && volume < cap * 0.01) {
      score -= 8;
      negatives.push("Low 24h volume relative to market cap");
    }
    if (circulating > 0 && total > 0) {
      const ratio = circulating / total;
      score += ratio >= 0.7 ? 8 : ratio < 0.3 ? -8 : 0;
      factors.push(`${Math.round(ratio * 100)}% of known supply circulating`);
    }
    if (ath > 0 && current > 0) {
      const drawdown = (1 - current / ath) * 100;
      if (drawdown > 85)
        negatives.push(`Deep ATH drawdown (${Math.round(drawdown)}%)`);
      else if (drawdown < 35)
        positives.push(`Near prior ATH (${Math.round(drawdown)}% drawdown)`);
    }
    score = Math.max(0, Math.min(100, score));
    const volumeRatio =
      cap > 0 && Number.isFinite(volume) ? volume / cap : null;
    const supplyRatio =
      circulating > 0 && total > 0 ? circulating / total : null;
    const athRetention = ath > 0 && current > 0 ? current / ath : null;
    return {
      score,
      bias: score >= 60 ? "supportive" : score <= 40 ? "cautionary" : "neutral",
      positives,
      negatives,
      factors,
      available: Boolean(data?.market_data),
      metrics: [
        {
          label: "Market-cap rank",
          value: Number.isFinite(rank)
            ? Math.max(
                0,
                Math.min(100, rank <= 20 ? 90 : rank <= 100 ? 70 : 40),
              )
            : null,
          detail: Number.isFinite(rank) ? `#${rank}` : "N/A",
        },
        {
          label: "Volume / market cap",
          value:
            volumeRatio == null
              ? null
              : Math.max(0, Math.min(100, volumeRatio * 1000)),
          detail:
            volumeRatio == null ? "N/A" : `${Math.round(volumeRatio * 100)}%`,
        },
        {
          label: "Circulating supply",
          value: supplyRatio == null ? null : supplyRatio * 100,
          detail:
            supplyRatio == null ? "N/A" : `${Math.round(supplyRatio * 100)}%`,
        },
        {
          label: "Price retained from ATH",
          value: athRetention == null ? null : athRetention * 100,
          detail:
            athRetention == null ? "N/A" : `${Math.round(athRetention * 100)}%`,
        },
      ],
    };
  }

  function tradeLevels(action, technical) {
    if (!technical || !["BUY", "SELL"].includes(action)) return null;
    const entry = Number(technical.current),
      atr = Number(technical.atr),
      risk = atr * 1.5;
    if (
      !Number.isFinite(entry) ||
      entry <= 0 ||
      !Number.isFinite(atr) ||
      atr <= 0 ||
      atr > entry * 100
    )
      return null;
    const zones = (
      technical.multiTimeframe?.liquidityZones ||
      technical.liquidityZones ||
      []
    ).filter(
      (z) =>
        Number.isFinite(Number(z?.level)) &&
        Array.isArray(z?.range) &&
        z.range.length >= 2 &&
        Number.isFinite(Number(z.range[0])) &&
        Number.isFinite(Number(z.range[1])),
    );
    const normalizedZones = zones.map((z) => ({
      ...z,
      level: Number(z.level),
      range: [
        Math.min(Number(z.range[0]), Number(z.range[1])),
        Math.max(Number(z.range[0]), Number(z.range[1])),
      ],
    }));
    const below = normalizedZones
      .filter((z) => z.level < entry)
      .sort((a, b) => b.level - a.level);
    const above = normalizedZones
      .filter((z) => z.level > entry)
      .sort((a, b) => a.level - b.level);
    if (action === "BUY")
      return {
        entry,
        stopLoss:
          Math.round(
            Math.min(entry - risk, below[0]?.range?.[0] ?? entry - risk) * 100,
          ) / 100,
        takeProfit:
          Math.round(
            Math.max(entry + atr * 3, above[0]?.range?.[1] ?? entry + atr * 3) *
              100,
          ) / 100,
        riskDistance: Math.round(risk * 100) / 100,
        basis: "1.5× ATR stop with liquidity-zone-aware target",
      };
    return {
      entry,
      stopLoss:
        Math.round(
          Math.max(entry + risk, above[0]?.range?.[1] ?? entry + risk) * 100,
        ) / 100,
      takeProfit:
        Math.round(
          Math.min(entry - atr * 3, below[0]?.range?.[0] ?? entry - atr * 3) *
            100,
        ) / 100,
      riskDistance: Math.round(risk * 100) / 100,
      basis: "1.5× ATR stop with liquidity-zone-aware target",
    };
  }

  function evidenceSufficiency(technical, fundamentals) {
    if (!technical)
      return {
        status: "INSUFFICIENT",
        reasons: ["Technical market data is unavailable."],
        score: 0,
      };
    const reasons = [],
      alignment =
        Number.parseInt(
          technical.multiTimeframe?.timeframeAlignment || "0",
          10,
        ) || 0;
    if (!fundamentals?.available)
      reasons.push("Fundamental market data is unavailable.");
    if (!technical.multiTimeframe)
      reasons.push("Multi-timeframe confirmation is unavailable.");
    else if (alignment < 3)
      reasons.push(
        `Only ${technical.multiTimeframe.timeframeAlignment} timeframes align.`,
      );
    if (
      !Number.isFinite(Number(technical.atr)) ||
      !Number.isFinite(Number(technical.current))
    )
      reasons.push("ATR or reference price is unavailable.");
    const status =
      technical.multiTimeframe &&
      alignment >= 3 &&
      fundamentals?.available &&
      reasons.length === 0
        ? "SUFFICIENT"
        : "PARTIAL";
    return {
      status,
      reasons,
      score:
        status === "SUFFICIENT" ? 100 : Math.max(25, 100 - reasons.length * 25),
    };
  }

  function scenarioLabel(action) {
    return action === "BUY"
      ? "Bullish scenario"
      : action === "SELL"
        ? "Bearish scenario"
        : "Neutral / insufficient evidence";
  }

  function meterClass(value, tone = "up") {
    const n = Number.isFinite(Number(value))
      ? Math.max(0, Math.min(100, Number(value)))
      : 0;
    const bucket = Math.round(n / 10) * 10;
    return `meter-fill meter-fill-${tone} meter-fill-${bucket}`;
  }

  function decisionReport(
    technical,
    fundamentals,
    opportunityScore,
    riskScore,
  ) {
    const alignment =
      Number.parseInt(
        technical?.multiTimeframe?.timeframeAlignment || "0",
        10,
      ) || 0;
    const gap = opportunityScore - riskScore,
      confidence = technical?.confidence || 0;
    const buy =
      technical?.bias === "bullish" &&
      gap >= 15 &&
      confidence >= 55 &&
      alignment >= 3 &&
      (!fundamentals?.available || fundamentals.score >= 45);
    const sell =
      technical?.bias === "bearish" &&
      gap <= -15 &&
      confidence >= 55 &&
      alignment >= 3 &&
      (!fundamentals?.available || fundamentals.score <= 55);
    const action = buy ? "BUY" : sell ? "SELL" : "HOLD";
    const reasons = [
      `Technical bias: ${technical?.bias || "unavailable"}`,
      `MTF alignment: ${technical?.multiTimeframe?.timeframeAlignment || "unavailable"}`,
      `Evidence gap: ${Math.round(gap)}`,
    ];
    if (fundamentals?.available)
      reasons.push(
        `Fundamentals: ${fundamentals.bias} (${fundamentals.score}/100)`,
      );
    return {
      action,
      reasons,
      confidence: Math.round(
        Math.min(90, confidence * 0.65 + Math.abs(gap) * 0.35),
      ),
      interpretation:
        action === "BUY"
          ? "Evidence currently leans positive: technical bias and timeframe alignment are constructive."
          : action === "SELL"
            ? "Evidence currently leans negative: technical bias and timeframe alignment are not supportive."
            : "Evidence is mixed, insufficiently aligned, or too weak to indicate a directional scenario.",
    };
  }

  async function analyze(assetId, options = {}) {
    // 1. Resolve asset
    let asset;
    try {
      asset = await W.asset.resolve(assetId);
    } catch (e) {
      return { error: "Asset not found" };
    }

    let technical = null;
    try {
      technical = await W.technicalAnalysis?.analyze(
        asset.coingeckoId || asset.symbol.toLowerCase(),
        90,
      );
    } catch (e) {
      console.warn("[TokenAnalysis] Technical data unavailable:", e.message);
    }

    let fundamentals = null;
    try {
      fundamentals = fundamentalReport(
        await W.api?.coin?.(asset.coingeckoId || asset.symbol.toLowerCase()),
      );
    } catch (e) {
      console.warn("[TokenAnalysis] Fundamental data unavailable:", e.message);
    }

    // 2. Collect signals
    let allSignals = [];
    try {
      allSignals = (await W.events?.collectEvents?.()) || [];
    } catch (e) {
      console.warn("[TokenAnalysis] Event collection unavailable:", e.message);
    }
    const signals = allSignals.filter((s) => s.assetId.symbol === asset.symbol);

    if (!signals.length && !technical) {
      // ── Unavailable-data path ─────────────────────────────
      // Every field the renderer reads must be present here.
      // Scores are null, NOT 0 — unknown must never render as a
      // measured value. Same principle as the Gem Agent Shield P0:
      // unknown ≠ zero, and missing must never render as a broken
      // string ("undefined", "N/A%").
      const unavailableQuality = {
        status: "UNAVAILABLE",
        reasons: [
          "No recent signals for this asset.",
          "Technical market data is unavailable.",
        ],
        score: 0,
      };
      return {
        asset: asset.symbol,
        assetId: asset,
        opportunityScore: null,
        riskScore: null,
        bullishEvidence: [],
        bearishEvidence: [],
        contradictions: [],
        verdict: "Insufficient data",
        confidence: null,
        explanation: "No recent signals and no technical data for this asset.",
        action: "HOLD",
        actionConfidence: null,
        actionReasons: [
          "No recent signals for this asset",
          "Technical market data is unavailable",
        ],
        actionInterpretation:
          "The available evidence does not support a directional scenario.",
        scenario: "Neutral / insufficient evidence",
        evidenceQuality: unavailableQuality,
        tradeLevels: null,
        unifiedVerdict: null,
        // collectEvents did run and matched nothing — 0 is a fact here,
        // not a fabrication.
        signalsCount: 0,
        fundamentals,
        technical: null,
        personalContext: null,
      };
    }

    // 3. Build evidence for each signal
    const evidenceList = [];
    for (const signal of signals) {
      try {
        const evidence = W.evidence.build(signal, signal._metadata || {});
        evidenceList.push({ signal, evidence });
      } catch (e) {
        console.warn(
          "[TokenAnalysis] Evidence build failed for signal:",
          signal.id,
          e,
        );
      }
    }

    // 4. Categorize evidence and detect contradictions
    const bullish = [];
    const bearish = [];
    const contradictions = [];

    for (const { signal, evidence } of evidenceList) {
      const isBullish =
        (signal.type === "PRICE_MOVE" &&
          signal.rawData?.price_change_percentage_24h > 0) ||
        (signal.type === "OPPORTUNITY" && signal.rawData?.impactValue > 0.5) ||
        (signal.type === "REGIME_SHIFT" &&
          signal.rawData?.title?.includes("RISK-ON"));
      const isBearish = !isBullish;
      const item = {
        title: signal.rawData?.title || signal.type,
        evidence: evidence.reasoning.join("; "),
        confidence: evidence.confidence,
        signalType: signal.type,
        source: signal.source,
        timestamp: signal.timestamp,
      };
      if (isBullish) {
        bullish.push(item);
      } else {
        bearish.push(item);
      }
    }

    // 5. Compute scores (weighted by confidence and impact)
    const weightSum = (list) =>
      list
        .filter((i) => i.confidence !== null && i.confidence !== undefined)
        .reduce((sum, i) => sum + i.confidence, 0);
    const bullishWeight = weightSum(bullish);
    const bearishWeight = weightSum(bearish);
    const totalWeight = bullishWeight + bearishWeight || 1;

    let opportunityScore = Math.min(100, (bullishWeight / totalWeight) * 100);
    let riskScore = Math.min(100, (bearishWeight / totalWeight) * 100);
    if (technical) {
      opportunityScore =
        technical.bias === "bullish"
          ? Math.max(opportunityScore, technical.score)
          : Math.min(opportunityScore, technical.score);
      riskScore =
        technical.bias === "bearish"
          ? Math.max(riskScore, 100 - technical.score)
          : Math.min(riskScore, 100 - technical.score);
    }

    // 6. Detect contradictions
    const contradictionItems = [];
    if (bullish.length > 0 && bearish.length > 0) {
      const knownBull = bullish.filter((i) => i.confidence !== null);
      const knownBear = bearish.filter((i) => i.confidence !== null);
      const strongestBull = knownBull.length
        ? knownBull.reduce((a, b) => (a.confidence > b.confidence ? a : b))
        : bullish[0];
      const strongestBear = knownBear.length
        ? knownBear.reduce((a, b) => (a.confidence > b.confidence ? a : b))
        : bearish[0];
      contradictionItems.push({
        bull: strongestBull.title,
        bear: strongestBear.title,
        details: `Bullish evidence (${strongestBull.source}) vs Bearish evidence (${strongestBear.source})`,
      });
    }

    // 7. Overall evidence strength
    const allEvidence = [...bullish, ...bearish];
    const knownConfidenceEvidence = allEvidence.filter(
      (e) => e.confidence !== null && e.confidence !== undefined,
    );
    const avgConfidence = knownConfidenceEvidence.length
      ? knownConfidenceEvidence.reduce((sum, e) => sum + e.confidence, 0) /
        knownConfidenceEvidence.length
      : null;

    // 8. Verdict
    let verdict = "Balanced";
    if (opportunityScore - riskScore > 20) verdict = "Bullish opportunity";
    else if (riskScore - opportunityScore > 20) verdict = "Elevated risk";
    else verdict = "Mixed signals";

    // 9. Explanation
    let explanation = `Based on ${allEvidence.length} signals, opportunity score is ${opportunityScore.toFixed(0)}/100 and risk score is ${riskScore.toFixed(0)}/100. `;
    if (verdict === "Bullish opportunity")
      explanation +=
        "Evidence leans positive, but risk remains part of the picture.";
    else if (verdict === "Elevated risk")
      explanation +=
        "Risk factors outweigh opportunity signals; additional verification is warranted.";
    else
      explanation += "Signals are mixed. Additional verification is warranted.";

    // 10. Personal context
    let personalContext = null;
    if (options.includePersonalContext && W.portfolio) {
      const portfolio = W.portfolio.all();
      const holding = portfolio.find((h) => h.symbol === asset.symbol);
      if (holding) {
        personalContext = {
          hasPosition: true,
          quantity: holding.qty,
          avgCost: holding.buyPrice,
          currentValue: holding.value,
          pl: holding.pnl,
        };
      } else {
        personalContext = { hasPosition: false };
      }
    }

    const action = decisionReport(
      technical,
      fundamentals,
      opportunityScore,
      riskScore,
    );
    const localEvidenceQuality = evidenceSufficiency(technical, fundamentals);
    let securityEvidence = null;
    try {
      if (W.shield && typeof W.shield.getEvidence === "function") {
        securityEvidence = await W.shield.getEvidence({
          symbol: asset.symbol,
          coingeckoId: asset.coingeckoId,
        });
      }
    } catch (e) {
      console.warn("[TokenAnalysis] Shield evidence unavailable:", e.message);
    }
    const evidenceDomains = {
      ...(options.evidenceDomains || {}),
      ...(securityEvidence
        ? {
            security: {
              status: "verified",
              score: Math.max(0, 100 - Number(securityEvidence.riskScore || 0)),
              source: securityEvidence.source || "goplus",
              asOf: new Date(securityEvidence.observedAt).toISOString(),
              reasons: securityEvidence.risks?.length
                ? securityEvidence.risks
                : ["Token Shield verification completed."],
            },
          }
        : {}),
    };
    const verdictInput = {
      asset: asset.symbol,
      opportunityScore: Math.round(opportunityScore),
      riskScore: Math.round(riskScore),
      technical,
      fundamentals,
      action: action.action,
      scenario: scenarioLabel(action.action),
      tradeLevels: null,
      evidenceQuality: localEvidenceQuality,
      domains: evidenceDomains,
      provenance: [
        { type: "technical", source: technical?.source || "ohlcv" },
        {
          type: "fundamentals",
          source: fundamentals?.available ? "market-api" : null,
        },
      ],
    };
    if (securityEvidence) {
      verdictInput.provenance.push({
        type: "security",
        source: securityEvidence.source || "goplus",
        address: securityEvidence.address,
        chain: securityEvidence.chain,
        asOf: securityEvidence.observedAt,
      });
    }
    const preliminaryVerdict = W.unifiedVerdict?.compose?.(verdictInput);
    const evidenceQuality =
      preliminaryVerdict?.evidence || localEvidenceQuality;
    const tradePlan =
      evidenceQuality.status === "SUFFICIENT"
        ? tradeLevels(action.action, technical)
        : null;
    const unifiedVerdict = W.unifiedVerdict?.compose?.({
      ...verdictInput,
      tradeLevels: tradePlan,
    });

    return {
      asset: asset.symbol,
      assetId: asset,
      opportunityScore: Math.round(opportunityScore),
      riskScore: Math.round(riskScore),
      bullishEvidence: bullish.slice(0, 5),
      bearishEvidence: bearish.slice(0, 5),
      contradictions: contradictionItems,
      verdict,
      confidence:
        avgConfidence === null ? null : Math.round(avgConfidence * 100),
      explanation,
      action: action.action,
      actionConfidence: action.confidence,
      actionReasons: action.reasons,
      actionInterpretation: action.interpretation,
      evidenceQuality,
      scenario: scenarioLabel(action.action),
      tradeLevels: tradePlan,
      unifiedVerdict,
      fundamentals,
      signalsCount: allEvidence.length,
      personalContext,
      technical,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Render (CSP-compliant: no style="" attributes, no inline onclick)
  // ────────────────────────────────────────────────────────────
  async function render(view, assetId) {
    // Search view
    if (!assetId) {
      view.innerHTML = `
        <div class="card">
          <h3>🔍 Token Analysis</h3>
          <p class="muted small">Get an evidence-driven decision report for any crypto asset.</p>
          <div class="qa mt">
            <input type="text" id="ta-input" placeholder="Enter symbol or name (e.g., BTC, Ethereum)" class="input">
            <button class="btn primary" id="ta-go">Analyze</button>
          </div>
          <div id="ta-result"></div>
        </div>
      `;
      const input = view.querySelector("#ta-input");
      const goBtn = view.querySelector("#ta-go");
      goBtn.addEventListener("click", () => {
        const v = input.value.trim();
        if (v) location.hash = `#/token/${encodeURIComponent(v)}`;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") goBtn.click();
      });
      return;
    }

    view.innerHTML = W.ui.spinner();

    try {
      const result = await analyze(assetId, { includePersonalContext: true });
      if (result.error) {
        view.innerHTML = `<div class="card"><p class="muted">${W.fmt.escapeHTML(result.error)}</p></div>`;
        return;
      }

      const safeText = (s) => W.fmt.escapeHTML(String(s ?? ""));

      // ── Null-safe formatters ──────────────────────────────
      // Unknown must never render as 0, "undefined", or "N/A%".
      // Legacy: the early-return path once emitted these three
      // artefacts simultaneously. Keep this contract even after
      // the source of the bug is fixed, as defence in depth.
      const isNumber = (v) => Number.isFinite(v);
      const fmtScore = (v) => (isNumber(v) ? `${v}/100` : "—");
      const fmtPct = (v) => (isNumber(v) ? `${v}%` : "—");
      const fmtCount = (v) => (isNumber(v) ? String(v) : "—");

      // Dynamic class names (CSP-safe — no inline style).
      // Unknown scores use muted styling, never warn-orange, which
      // would falsely read as "measured but low".
      const oppClass = isNumber(result.opportunityScore)
        ? result.opportunityScore > 60
          ? "text-up"
          : "text-warn"
        : "muted";
      const riskClass = isNumber(result.riskScore)
        ? result.riskScore > 60
          ? "text-down"
          : "text-warn"
        : "muted";
      const actionClass =
        result.action === "BUY"
          ? "card-action-buy"
          : result.action === "SELL"
            ? "card-action-sell"
            : "card-action-hold";

      view.innerHTML = `
        <div class="card">
          <h3>📊 Token Analysis: ${safeText(result.asset)}</h3>

          <div class="card mt-16 ${actionClass}">
            <h3>${safeText(result.scenario || "Neutral / insufficient evidence")}</h3>
            <p class="small">Evidence quality: <b>${safeText(result.evidenceQuality?.status || "UNAVAILABLE")}</b> · Scenario strength: ${fmtPct(result.actionConfidence)}</p>
            ${
              result.unifiedVerdict
                ? `<p class="small muted">Domains: ${Object.values(
                    result.unifiedVerdict.domains || {},
                  )
                    .map((d) => `${safeText(d.name)} ${safeText(d.status)}`)
                    .join(" · ")}</p>
                   <p class="small muted">Methodology ${safeText(result.unifiedVerdict.methodologyVersion)} · Evidence ${safeText(result.unifiedVerdict.evidenceVersion)}</p>`
                : ""
            }
            <p class="small muted">${safeText(result.actionInterpretation || "The available evidence does not support a directional scenario.")}</p>
            ${result.actionReasons?.length ? `<p class="small muted">${result.actionReasons.map(safeText).join(" · ")}</p>` : ""}
            ${result.evidenceQuality?.reasons?.length ? `<p class="small muted">Limitations: ${result.evidenceQuality.reasons.map(safeText).join(" · ")}</p>` : ""}
            <button class="btn primary mt-8" data-action="why">🔍 View supporting evidence</button>
          </div>

          ${
            result.tradeLevels
              ? `<div class="card mt-16">
                   <h4>⚠️ Risks</h4>
                   <div class="grid-2 mt-10">
                     <div class="kv-row"><span>Reference price</span><b>${result.tradeLevels.entry}</b></div>
                     <div class="kv-row"><span>Potential invalidation</span><b class="text-down">${result.tradeLevels.stopLoss}</b></div>
                     <div class="kv-row"><span>Potential target zone</span><b class="text-up">${result.tradeLevels.takeProfit}</b></div>
                     <div class="kv-row"><span>ATR risk distance</span><b>${result.tradeLevels.riskDistance}</b></div>
                   </div>
                   <p class="small muted">${safeText(result.tradeLevels.basis)}. These are scenario levels derived from current OHLCV data, not instructions to trade.</p>
                 </div>`
              : ""
          }

          <div class="cards mt-12">
            <div class="card stat">
              <div class="stat-label">Opportunity Score</div>
              <div class="stat-big ${oppClass}">${fmtScore(result.opportunityScore)}</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Risk Score</div>
              <div class="stat-big ${riskClass}">${fmtScore(result.riskScore)}</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Evidence Strength</div>
              <div class="stat-big">${fmtPct(result.confidence)}</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Signals Analyzed</div>
              <div class="stat-big">${fmtCount(result.signalsCount)}</div>
            </div>
          </div>

          <div class="mt-12">
            <div class="meter-bar"><div class="${meterClass(result.opportunityScore, "up")}"></div></div>
            <div class="meter-label">Opportunity Score</div>
          </div>
          <div class="mt-8">
            <div class="meter-bar"><div class="${meterClass(result.riskScore, "down")}"></div></div>
            <div class="meter-label">Risk Score</div>
          </div>

          ${
            result.fundamentals
              ? `<div class="card fundamental-breakdown">
                   <h4>Fundamental score breakdown</h4>
                   <div class="grid-2">
                     <div class="kv-row"><span>Fundamental bias</span><b>${safeText(result.fundamentals.bias)}</b></div>
                     <div class="kv-row"><span>Overall score</span><b>${result.fundamentals.score}/100</b></div>
                   </div>
                   ${(result.fundamentals.metrics || [])
                     .map(
                       (m) => `
                       <div class="fundamental-metric">
                         <div class="meter-label"><span>${safeText(m.label)}</span><b>${safeText(m.detail)}</b></div>
                         <div class="meter-bar">
                           <div class="${meterClass(m.value, m.value == null ? "muted" : m.value >= 60 ? "up" : "warn")}"></div>
                         </div>
                       </div>
                     `,
                     )
                     .join("")}
                   <p class="small muted">${[...(result.fundamentals.positives || []), ...(result.fundamentals.negatives || [])].map(safeText).join(" · ") || "Limited fundamental data available."}</p>
                 </div>`
              : ""
          }

          ${
            result.technical
              ? `<div class="card mt-16">
                   <h4>📐 Market-derived technical analysis</h4>
                   <div class="grid-2 mt-10">
                     <div class="kv-row"><span>RSI (14)</span><b>${result.technical.rsi} · ${safeText(result.technical.rsiBias)}</b></div>
                     <div class="kv-row"><span>ATR (14)</span><b>${result.technical.atr}</b></div>
                     <div class="kv-row"><span>Trend</span><b>${safeText(result.technical.trend)}</b></div>
                     <div class="kv-row"><span>EMA 20 / EMA 50</span><b>${result.technical.ema20} / ${result.technical.ema50 ?? "N/A"}</b></div>
                     <div class="kv-row"><span>MACD bias</span><b>${result.technical.macd >= 0 ? "positive" : "negative"} (${result.technical.macd})</b></div>
                     <div class="kv-row"><span>Bollinger position</span><b>${result.technical.bollingerPosition}%</b></div>
                     <div class="kv-row"><span>Market structure</span><b>${safeText(result.technical.structure?.label)}</b></div>
                     <div class="kv-row"><span>Structure event</span><b>${safeText(result.technical.structure?.breakOfStructure)}</b></div>
                     <div class="kv-row"><span>CHOCH</span><b>${safeText(result.technical.structure?.choch?.direction || "None confirmed")}</b></div>
                     <div class="kv-row"><span>SMC / liquidity</span><b>${safeText(result.technical.smc?.liquidity)}</b></div>
                     <div class="kv-row"><span>Relative volume</span><b>${result.technical.relativeVolume == null ? "N/A" : result.technical.relativeVolume + "x"}</b></div>
                     ${
                       result.technical.multiTimeframe
                         ? `<div class="kv-row"><span>MTF alignment</span><b>${safeText(result.technical.multiTimeframe.timeframeAlignment)}</b></div>
                            <div class="kv-row"><span>Liquidity zones</span><b>${result.technical.multiTimeframe.liquidityZones?.length || 0}</b></div>`
                         : ""
                     }
                     <div class="kv-row"><span>Support / resistance</span><b>${result.technical.support} / ${result.technical.resistance}</b></div>
                     <div class="kv-row"><span>Technical confidence</span><b>${result.technical.confidence}%</b></div>
                   </div>
                   <p class="muted small mt-10">Confluence: ${safeText(result.technical.confluence)}. Annualized close-to-close volatility: ${result.technical.volatility}%.</p>
                   <p class="muted small mt-10">${safeText(result.technical.smc?.orderBlock)}. ${safeText(result.technical.smc?.limitation)} Liquidity zones are heuristics derived from OHLCV; they are not direct order-book or on-chain observations.</p>
                 </div>`
              : ""
          }

          <div class="grid-2 mt-16">
            <div class="card">
              <h4 class="text-up">🟢 Positive Evidence</h4>
              ${
                result.bullishEvidence.length
                  ? result.bullishEvidence
                      .map(
                        (e) =>
                          `<div class="kv-row"><span>${safeText(e.title)}</span><span class="small">${safeText(e.evidence)}</span></div>`,
                      )
                      .join("")
                  : '<p class="muted small">No bullish evidence found.</p>'
              }
            </div>
            <div class="card">
              <h4 class="text-down">🔴 Negative Evidence</h4>
              ${
                result.bearishEvidence.length
                  ? result.bearishEvidence
                      .map(
                        (e) =>
                          `<div class="kv-row"><span>${safeText(e.title)}</span><span class="small">${safeText(e.evidence)}</span></div>`,
                      )
                      .join("")
                  : '<p class="muted small">No bearish evidence found.</p>'
              }
            </div>
          </div>

          ${
            result.evidenceQuality?.reasons?.length
              ? `<div class="card mt-16">
                   <h4 class="text-muted">❓ Unknowns</h4>
                   <p class="small muted mt-4">Evidence gaps Weaver could not verify:</p>
                   <ul class="tx-list mt-8">
                     ${result.evidenceQuality.reasons.map((r) => `<li class="small">${safeText(r)}</li>`).join("")}
                   </ul>
                 </div>`
              : ""
          }
          ${
            result.contradictions && result.contradictions.length
              ? `<div class="card-warn">
                   <b>⚠️ Contradicting Evidence:</b>
                   ${result.contradictions
                     .map(
                       (c) =>
                         `<div class="small">${safeText(c.bull)} vs ${safeText(c.bear)} — ${safeText(c.details)}</div>`,
                     )
                     .join("")}
                 </div>`
              : ""
          }

          <div class="card-verdict">
            <b>Verdict:</b> ${safeText(result.verdict)}
            <p class="small muted mt-4">${safeText(result.explanation)}</p>
          </div>

          ${
            result.personalContext
              ? `<div class="card-position">
                   <b>👤 Your Position:</b>
                   ${
                     result.personalContext.hasPosition
                       ? `You hold ${result.personalContext.quantity} ${safeText(result.asset)} at avg cost $${Number(result.personalContext.avgCost).toFixed(2)} (current value $${Number(result.personalContext.currentValue).toFixed(2)}).`
                       : "You do not hold this asset."
                   }
                 </div>`
              : ""
          }

          <div class="card mt-16" id="security-section">
            <div class="flex-between mb-8">
              <h4>🛡️ Security</h4>
              <button class="btn tiny" data-action="verify-security">Verify Security</button>
            </div>
            <p class="small muted" data-security-state="idle">Security verification has not been run for this token. No safety conclusion is being made yet.</p>
          </div>

          <div class="qa mt-12">
            ${W.trackRecord ? '<button class="btn tiny primary" id="ta-save-track" data-action="capture-track-record">Capture historical snapshot</button>' : ""}
            <a class="btn tiny" href="#/track">🧾 View all track records →</a>
            <button class="btn tiny" data-action="new-analysis">← New Analysis</button>
          </div>
        </div>
      `;

      // ── Event listeners (no inline onclick) ─────────────
      // Security card — verify on demand via Token Shield
      const secBtn = view.querySelector("[data-action='verify-security']");
      const secSection = view.querySelector("#security-section");
      if (secBtn && secSection) {
        const secState = secSection.querySelector("[data-security-state]");
        const setState = (cls, text) => {
          if (!secState) return;
          secState.className = "small " + cls;
          secState.textContent = text;
        };
        secBtn.addEventListener("click", async () => {
          secBtn.disabled = true;
          secBtn.textContent = "Checking…";
          setState("muted", "Fetching contract address…");
          try {
            const coin = await W.api.coin(
              result.assetId?.coingeckoId || result.asset,
            );
            const platforms = (coin && coin.platforms) || {};
            const supported = Object.keys(platforms).filter(
              (k) => W.shield?.CHAINS?.[k] && platforms[k],
            );
            if (!supported.length) {
              setState(
                "muted",
                "Security verification is not available for native chain tokens. Cross-check on the chain's block explorer.",
              );
              secBtn.remove();
              return;
            }
            const chainKey = supported[0];
            const addr = platforms[chainKey];
            setState("muted", "Running Token Shield on " + chainKey + "…");
            const assessment = await W.shield.check(addr, chainKey);
            if (!assessment) {
              setState(
                "muted",
                "No security data found for this contract. Cross-check on the block explorer.",
              );
              secBtn.remove();
              return;
            }
            secState.remove();
            const rl = assessment.riskLevel?.[0] || "Unknown";
            const rs = assessment.riskScore ?? "—";
            const sv = assessment.scoreVersion || "—";
            const risks = Array.isArray(assessment.risks)
              ? assessment.risks
              : [];
            const header = document.createElement("p");
            header.className = "small";
            header.textContent = rl + " · risk score " + rs + "/100 · " + sv;
            secSection.appendChild(header);
            risks.slice(0, 6).forEach((r) => {
              const li = document.createElement("p");
              li.className = "small muted mt-4";
              li.textContent = "• " + r;
              secSection.appendChild(li);
            });
            secBtn.remove();
          } catch (e) {
            setState(
              "down",
              "Security verification unavailable. No safety conclusion is being made from missing data.",
            );
            secBtn.textContent = "Retry";
            secBtn.disabled = false;
          }
        });
      }

      const captureButton = view.querySelector(
        "[data-action='capture-track-record']",
      );
      if (captureButton) {
        captureButton.addEventListener("click", () => {
          try {
            const tr = W.trackRecord;
            let record;
            // Support either API name (createFromAnalysis is the canonical one)
            if (typeof tr.capture === "function") {
              record = tr.capture(result);
            } else if (typeof tr.createFromAnalysis === "function") {
              record = tr.createFromAnalysis(
                result,
                result.assetId || { symbol: result.asset },
              );
            } else {
              throw new Error(
                "Track Record module does not expose a capture method",
              );
            }
            captureButton.disabled = true;
            captureButton.textContent = "Snapshot captured";
            W.ui?.toast?.(
              `Historical ${record.displaySymbol || result.asset} analysis captured`,
              "ok",
            );
          } catch (captureError) {
            W.ui?.toast?.(captureError.message, "warn");
          }
        });
      }

      const whyBtn = view.querySelector("[data-action='why']");
      if (whyBtn) {
        whyBtn.addEventListener("click", () => {
          if (W.ui && W.ui.evidenceDrawer) {
            // Read the trajectory from persisted history, if any.
            // Optional — the token may never have been scanned by
            // the Gem Agent, or the observations module may be
            // unavailable. In both cases the drawer renders without
            // the trajectory line.
            let trajectorySummary = null;
            try {
              const trajectory = W.observations?.trajectory?.(
                result.assetId?.chainId,
                result.assetId?.contractAddress,
              );
              if (trajectory) {
                trajectorySummary =
                  W.marketStructure?.summariseTrajectory?.(trajectory) ?? null;
              }
            } catch (e) {
              console.warn(
                "[TokenAnalysis] Trajectory read failed:",
                e && e.message,
              );
            }

            // Read the owner association from the session map, if
            // any. Optional in the same way: the token may never
            // have been observed by the Gem Agent this session, or
            // the module may be unavailable.
            //
            // This uses the read-only get() accessor, not observe().
            // The drawer must not mutate session state on open.
            let ownerSummary = null;
            try {
              const association = W.ownerAssociations?.get?.(
                result.assetId?.chainId,
                result.assetId?.contractAddress,
              );
              if (association) {
                ownerSummary =
                  W.ownerAssociations?.summarise?.(association) ?? null;
              }
            } catch (e) {
              console.warn(
                "[TokenAnalysis] Owner association read failed:",
                e && e.message,
              );
            }

            // Read the cached deployer profile, if any. Same
            // optional contract: the token may never have been
            // scanned by the Gem Agent, the profile may not be
            // cached, or the module may be unavailable.
            //
            // This uses the read-only get() accessor. The drawer
            // must not call observe() — that would issue a network
            // request and mutate the cache on every open.
            let deployerSummary = null;
            try {
              const profile = W.deployerGraph?.get?.(
                result.assetId?.chainId,
                result.assetId?.contractAddress,
              );
              if (profile) {
                deployerSummary = W.deployerGraph?.summarise?.(profile) ?? null;
              }
            } catch (e) {
              console.warn(
                "[TokenAnalysis] Deployer read failed:",
                e && e.message,
              );
            }

            // Read the user's own Track Record for this asset, if
            // any. Optional in the same way as the three summaries
            // above: the user may never have captured a decision
            // for this asset, or the module may be unavailable.
            //
            // This is a read-only query; it does not mutate any
            // record and does not issue a network request.
            let trackRecordSummary = null;
            try {
              trackRecordSummary =
                W.trackRecord?.summariseForAsset?.(result.assetId || {}) ??
                null;
            } catch (e) {
              console.warn(
                "[TokenAnalysis] Track Record read failed:",
                e && e.message,
              );
            }

            // ★ CRITICAL FIX: Pass the provenance array to the drawer ★
            W.ui.evidenceDrawer.open({
              explanation: result.explanation,
              domains:
                (result.unifiedVerdict && result.unifiedVerdict.domains) || {},
              methodologyVersion:
                result.unifiedVerdict &&
                result.unifiedVerdict.methodologyVersion,
              evidenceVersion:
                result.unifiedVerdict && result.unifiedVerdict.evidenceVersion,
              bullishEvidence: result.bullishEvidence,
              bearishEvidence: result.bearishEvidence,
              contradictions: result.contradictions,
              evidenceQuality: result.evidenceQuality,
              provenance: result.unifiedVerdict?.provenance || [], // <-- ADDED THIS LINE
              trajectorySummary,
              ownerSummary,
              deployerSummary,
              trackRecordSummary,
            });
          }
        });
      }

      const newBtn = view.querySelector("[data-action='new-analysis']");
      if (newBtn) {
        newBtn.addEventListener("click", () => {
          location.hash = "#/token";
        });
      }
    } catch (e) {
      view.innerHTML = `<div class="card"><p class="muted">Analysis failed: ${W.fmt.escapeHTML(e.message)}</p></div>`;
    }
  }

  console.log("[TokenAnalysis] Module loaded.");

  return {
    analyze,
    render,
    decisionReport,
    fundamentalReport,
    tradeLevels,
    evidenceSufficiency,
    scenarioLabel,
  };
})();
