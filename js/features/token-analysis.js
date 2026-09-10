// ===============================================================
//         Token Analysis – Evidence‑Driven Decision Workflow
// ===============================================================

window.W = window.W || {};

W.tokenAnalysis = (async () => {
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

    // 2. Collect signals
    const allSignals = await W.events.collectEvents();
    const signals = allSignals.filter((s) => s.assetId.symbol === asset.symbol);

    if (!signals.length) {
      return {
        asset: asset.symbol,
        opportunityScore: 0,
        riskScore: 0,
        bullishEvidence: [],
        bearishEvidence: [],
        contradictions: [],
        verdict: "Insufficient data",
        confidence: 0,
        explanation: "No recent signals for this asset.",
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
    const weightSum = (list) => list.reduce((sum, i) => sum + i.confidence, 0);
    const bullishWeight = weightSum(bullish);
    const bearishWeight = weightSum(bearish);
    const totalWeight = bullishWeight + bearishWeight || 1;

    const opportunityScore = Math.min(100, (bullishWeight / totalWeight) * 100);
    const riskScore = Math.min(100, (bearishWeight / totalWeight) * 100);

    // 6. Detect contradictions (e.g., bullish price, but bearish on-chain)
    // For now, we simply report signals that point in opposite directions.
    // We'll refine later.
    const contradictionItems = [];
    if (bullish.length > 0 && bearish.length > 0) {
      // Take the strongest bull and bear signal and present them as contradiction
      const strongestBull = bullish.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
      const strongestBear = bearish.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
      contradictionItems.push({
        bull: strongestBull.title,
        bear: strongestBear.title,
        details: `Bullish evidence (${strongestBull.source}) vs Bearish evidence (${strongestBear.source})`,
      });
    }

    // 7. Overall confidence = average confidence of all evidence
    const allEvidence = [...bullish, ...bearish];
    const avgConfidence =
      allEvidence.reduce((sum, e) => sum + e.confidence, 0) /
      (allEvidence.length || 1);

    // 8. Verdict
    let verdict = "Balanced";
    if (opportunityScore - riskScore > 20) verdict = "Bullish opportunity";
    else if (riskScore - opportunityScore > 20) verdict = "Elevated risk";
    else verdict = "Mixed signals";

    // 9. Explanation (with personal context)
    let explanation = `Based on ${allEvidence.length} signals, opportunity score is ${opportunityScore.toFixed(0)}/100 and risk score is ${riskScore.toFixed(0)}/100. `;
    if (verdict === "Bullish opportunity")
      explanation +=
        "The evidence leans bullish – consider monitoring for entry.";
    else if (verdict === "Elevated risk")
      explanation +=
        "Risk factors outweigh opportunities – proceed with caution.";
    else explanation += "Signals are mixed – wait for clearer evidence.";

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

    // 11. Return structured report
    return {
      asset: asset.symbol,
      opportunityScore: Math.round(opportunityScore),
      riskScore: Math.round(riskScore),
      bullishEvidence: bullish.slice(0, 5),
      bearishEvidence: bearish.slice(0, 5),
      contradictions: contradictionItems,
      verdict,
      confidence: Math.round(avgConfidence * 100),
      explanation,
      signalsCount: allEvidence.length,
      personalContext,
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
            <div class="stat-label">Confidence</div>
            <div class="stat-big">${result.confidence}%</div>
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
  return { analyze, render };
})();
