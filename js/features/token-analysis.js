// ===============================================================
//         Token Analysis – Evidence‑Driven Decision Workflow
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
          ? "Evidence supports an immediate bullish setup, subject to your risk limits."
          : action === "SELL"
            ? "Evidence supports reducing exposure or avoiding a bullish entry; this is not a short-sale instruction."
            : "Signals are mixed, insufficiently aligned, or too weak for an immediate directional decision.",
    };
  }

  /**
   * Analyze a token and return a structured decision report.
   * @param {string} assetId - Coingecko ID or symbol (e.g., 'bitcoin', 'BTC')
   * @param {Object} options - { includeContradictions: true, includePersonalContext: true }
   * @returns {Object} - { opportunityScore, riskScore, bullishEvidence, bearishEvidence, contradictions, verdict, confidence, explanation }
   */
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
      return {
        asset: asset.symbol,
        opportunityScore: 0,
        riskScore: 0,
        bullishEvidence: [],
        bearishEvidence: [],
        contradictions: [],
        verdict: "Insufficient data",
        confidence: null,
        explanation: "No recent signals for this asset.",
        action: "HOLD",
        fundamentals,
        technical: null,
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
    // Items with unknown confidence (null) can't meaningfully weight a
    // score — excluding them from the weighted sum is honest; treating
    // null as 0 would silently claim "definitely no confidence," which
    // is a different, unsupported claim. They still appear in the
    // evidence lists below, just not in the numeric weighting.
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

    // 6. Detect contradictions (e.g., bullish price, but bearish on-chain)
    // For now, we simply report signals that point in opposite directions.
    // We'll refine later.
    const contradictionItems = [];
    if (bullish.length > 0 && bearish.length > 0) {
      // Take the strongest bull and bear signal and present them as
      // contradiction — "strongest" only makes sense among items with
      // a known confidence; fall back to the first item if every entry
      // in a list has unknown confidence.
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

    // 7. Overall evidence strength = average confidence of evidence with
    // a known confidence. If nothing has a known confidence, this is
    // honestly null (displayed as "N/A"), not a fabricated number.
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

    // 9. Explanation (with personal context)
    // Evidence-oriented language only — no directive/entry-point framing.
    // WEAVER_CONSTITUTION §2.4 "Never Financial Advice" / "No Directive
    // Laundering": this text must describe evidence, not suggest action.
    let explanation = `Based on ${allEvidence.length} signals, opportunity score is ${opportunityScore.toFixed(0)}/100 and risk score is ${riskScore.toFixed(0)}/100. `;
    if (verdict === "Bullish opportunity")
      explanation +=
        "Evidence leans positive, but risk remains part of the picture.";
    else if (verdict === "Elevated risk")
      explanation +=
        "Risk factors outweigh opportunity signals; additional verification is warranted.";
    else
      explanation += "Signals are mixed. Additional verification is warranted.";

    // 10. Include personal context if requested
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

    // 11. Return structured report
    return {
      asset: asset.symbol,
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
      tradeLevels: tradeLevels(action.action, technical),
      fundamentals,
      signalsCount: allEvidence.length,
      personalContext,
      technical,
    };
  }

  // Render function (unchanged from previous version, but improved UI)
  async function render(view, assetId) {
    // If no assetId, show the search input
    if (!assetId) {
      view.innerHTML = `
      <div class="card">
        <h3>🔍 Token Analysis</h3>
        <p class="muted small">Get an evidence‑driven decision report for any crypto asset.</p>
        <div class="qa mt">
          <input type="text" id="ta-input" placeholder="Enter symbol or name (e.g., BTC, Ethereum)" class="input" style="flex:1;">
          <button class="btn primary" id="ta-go">Analyze</button>
        </div>
        <div id="ta-result"></div>
      </div>
    `;
      view.querySelector("#ta-go").onclick = () => {
        const input = view.querySelector("#ta-input").value.trim();
        if (input) render(view, input);
      };
      view.querySelector("#ta-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") view.querySelector("#ta-go").click();
      });
      return;
    }

    view.innerHTML = W.ui.spinner();

    try {
      const result = await analyze(assetId, { includePersonalContext: true });
      if (result.error) {
        view.innerHTML = `<div class="card"><p class="muted">${result.error}</p></div>`;
        return;
      }

      view.innerHTML = `
      <div class="card">
        <h3>📊 Token Analysis: ${result.asset}</h3>
        <div class="cards" style="margin-top:12px;">
          <div class="card stat">
            <div class="stat-label">Opportunity Score</div>
            <div class="stat-big" style="color:${result.opportunityScore > 60 ? "var(--up)" : "var(--warn)"}">${result.opportunityScore}/100</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Risk Score</div>
            <div class="stat-big" style="color:${result.riskScore > 60 ? "var(--down)" : "var(--warn)"}">${result.riskScore}/100</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Evidence Strength</div>
            <div class="stat-big">${result.confidence === null ? "N/A" : result.confidence + "%"}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Signals Analyzed</div>
            <div class="stat-big">${result.signalsCount}</div>
          </div>
        </div>
        <div style="margin-top:12px;">
          <div class="meter-bar"><div style="width:${result.opportunityScore}%; background:var(--up);"></div></div>
          <div class="meter-label">Opportunity Score</div>
        </div>
        <div style="margin-top:8px;">
          <div class="meter-bar"><div style="width:${result.riskScore}%; background:var(--down);"></div></div>
          <div class="meter-label">Risk Score</div>
        </div>
        <div class="card" style="margin-top:16px; border:1px solid ${result.action === "BUY" ? "var(--up)" : result.action === "SELL" ? "var(--down)" : "var(--warn)"};">
          <h3>Current decision: ${result.action || "HOLD"}</h3>
          <p class="small">Decision confidence: ${result.actionConfidence ?? "N/A"}%</p>
          <p class="small muted">${result.actionInterpretation || "Insufficient alignment for a directional decision."}</p>
          ${result.actionReasons?.length ? `<p class="small muted">${result.actionReasons.join(" · ")}</p>` : ""}
          ${result.tradeLevels ? `<div class="grid-2" style="margin-top:10px;"><div class="kv-row"><span>Entry reference</span><b>${result.tradeLevels.entry}</b></div><div class="kv-row"><span>Stop-loss</span><b style="color:var(--down);">${result.tradeLevels.stopLoss}</b></div><div class="kv-row"><span>Take-profit</span><b style="color:var(--up);">${result.tradeLevels.takeProfit}</b></div><div class="kv-row"><span>Risk distance</span><b>${result.tradeLevels.riskDistance}</b></div></div><p class="small muted">${result.tradeLevels.basis}. Levels are references, not guarantees.</p>` : ""}
        </div>
        ${result.fundamentals ? `<div class="card" style="margin-top:12px;"><h4>Fundamental score breakdown</h4><div class="grid-2"><div class="kv-row"><span>Fundamental bias</span><b>${result.fundamentals.bias}</b></div><div class="kv-row"><span>Overall score</span><b>${result.fundamentals.score}/100</b></div></div>${(result.fundamentals.metrics || []).map((metric) => `<div style="margin-top:8px;"><div class="meter-label"><span>${metric.label}</span><b>${metric.detail}</b></div><div class="meter-bar"><div style="width:${metric.value == null ? 0 : metric.value}%; background:${metric.value == null ? "var(--muted)" : metric.value >= 60 ? "var(--up)" : "var(--warn)"};"></div></div></div>`).join("")}<p class="small muted">${[...(result.fundamentals.positives || []), ...(result.fundamentals.negatives || [])].join(" · ") || "Limited fundamental data available."}</p></div>` : ""}
        ${
          result.technical
            ? `
        <div class="card" style="margin-top:16px;">
          <h4>📐 Market-derived technical analysis</h4>
          <div class="grid-2" style="margin-top:10px;">
            <div class="kv-row"><span>RSI (14)</span><b>${result.technical.rsi} · ${result.technical.rsiBias}</b></div>
            <div class="kv-row"><span>ATR (14)</span><b>${result.technical.atr}</b></div>
            <div class="kv-row"><span>Trend</span><b>${result.technical.trend}</b></div>
            <div class="kv-row"><span>EMA 20 / EMA 50</span><b>${result.technical.ema20} / ${result.technical.ema50 ?? "N/A"}</b></div>
            <div class="kv-row"><span>MACD bias</span><b>${result.technical.macd >= 0 ? "positive" : "negative"} (${result.technical.macd})</b></div>
            <div class="kv-row"><span>Bollinger position</span><b>${result.technical.bollingerPosition}%</b></div>
            <div class="kv-row"><span>Market structure</span><b>${result.technical.structure.label}</b></div>
            <div class="kv-row"><span>Structure event</span><b>${result.technical.structure.breakOfStructure}</b></div>
            <div class="kv-row"><span>CHOCH</span><b>${result.technical.structure.choch?.direction || "None confirmed"}</b></div>
            <div class="kv-row"><span>SMC / liquidity</span><b>${result.technical.smc.liquidity}</b></div>
            <div class="kv-row"><span>Relative volume</span><b>${result.technical.relativeVolume == null ? "N/A" : result.technical.relativeVolume + "x"}</b></div>
            ${result.technical.multiTimeframe ? `<div class="kv-row"><span>MTF alignment</span><b>${result.technical.multiTimeframe.timeframeAlignment}</b></div><div class="kv-row"><span>Liquidity zones</span><b>${result.technical.multiTimeframe.liquidityZones.length}</b></div>` : ""}
            <div class="kv-row"><span>Support / resistance</span><b>${result.technical.support} / ${result.technical.resistance}</b></div>
            <div class="kv-row"><span>Technical confidence</span><b>${result.technical.confidence}%</b></div>
          </div>
          <p class="muted small" style="margin-top:10px;">Confluence: ${result.technical.confluence}. Annualized close-to-close volatility: ${result.technical.volatility}%.</p>
          <p class="muted small" style="margin-top:10px;">${result.technical.smc.orderBlock}. ${result.technical.smc.limitation}</p>
        </div>`
            : ""
        }
        <div class="grid-2" style="margin-top:16px;">
          <div class="card">
            <h4 style="color:var(--up);">🟢 Bullish Evidence</h4>
            ${result.bullishEvidence.length ? result.bullishEvidence.map((e) => `<div class="kv-row"><span>${e.title}</span><span class="small">${e.evidence}</span></div>`).join("") : '<p class="muted small">No bullish evidence found.</p>'}
          </div>
          <div class="card">
            <h4 style="color:var(--down);">🔴 Bearish Evidence</h4>
            ${result.bearishEvidence.length ? result.bearishEvidence.map((e) => `<div class="kv-row"><span>${e.title}</span><span class="small">${e.evidence}</span></div>`).join("") : '<p class="muted small">No bearish evidence found.</p>'}
          </div>
        </div>
        ${
          result.contradictions && result.contradictions.length
            ? `
          <div style="margin-top:12px; padding:12px; background:rgba(255,179,92,0.1); border-radius:8px;">
            <b>⚠️ Contradicting Evidence:</b>
            ${result.contradictions.map((c) => `<div class="small">${c.bull} vs ${c.bear} — ${c.details}</div>`).join("")}
          </div>
        `
            : ""
        }
        <div style="margin-top:16px; padding:12px; background:rgba(124,92,255,0.08); border-radius:8px;">
          <b>Verdict:</b> ${result.verdict}
          <p class="small muted" style="margin-top:4px;">${result.explanation}</p>
        </div>
        ${
          result.personalContext
            ? `
          <div style="margin-top:12px; padding:12px; background:rgba(46,230,168,0.08); border-radius:8px;">
            <b>👤 Your Position:</b>
            ${result.personalContext.hasPosition ? `You hold ${result.personalContext.quantity} ${result.asset} at avg cost $${result.personalContext.avgCost.toFixed(2)} (current value $${result.personalContext.currentValue.toFixed(2)}).` : "You do not hold this asset."}
          </div>
        `
            : ""
        }
        <div style="margin-top:12px;">
          <button class="btn tiny" onclick="document.location.hash='#/token'">← New Analysis</button>
        </div>
      </div>
    `;
    } catch (e) {
      view.innerHTML = `<div class="card"><p class="muted">Analysis failed: ${e.message}</p></div>`;
    }
  }
  console.log("[TokenAnalysis] Module loaded.");

  // expose API
  return { analyze, render, decisionReport, fundamentalReport, tradeLevels };
})();
