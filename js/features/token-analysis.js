// ===============================================================
//         Token Analysis – Evidence‑Driven Decision Workflow
// ===============================================================

window.W = window.W || {};

W.tokenAnalysis = (async () => {
  /**
   * Analyze a token and return a structured decision report.
   * @param {string} assetId - Coingecko ID or symbol (e.g., 'bitcoin', 'BTC')
   * @returns {Object} - { opportunityScore, riskScore, bullishEvidence, bearishEvidence, verdict, confidence, explanation }
   */
  async function analyze(assetId) {
    // 1. Resolve asset to full AssetId
    let asset;
    try {
      asset = await W.asset.resolve(assetId);
    } catch (e) {
      return { error: "Asset not found" };
    }

    // 2. Collect signals for this asset
    const allSignals = await W.events.collectEvents();
    const signals = allSignals.filter((s) => s.assetId.symbol === asset.symbol);

    if (!signals.length) {
      return {
        asset: asset.symbol,
        opportunityScore: 0,
        riskScore: 0,
        bullishEvidence: [],
        bearishEvidence: [],
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

    // 4. Compute weighted scores
    let bullishScore = 0;
    let bearishScore = 0;
    let totalWeight = 0;
    const bullishEvidence = [];
    const bearishEvidence = [];

    for (const { signal, evidence } of evidenceList) {
      const weight = evidence.confidence;
      const isBullish =
        (signal.type === "PRICE_MOVE" &&
          signal.rawData?.price_change_percentage_24h > 0) ||
        (signal.type === "OPPORTUNITY" && signal.rawData?.impactValue > 0.5) ||
        (signal.type === "REGIME_SHIFT" &&
          signal.rawData?.title?.includes("RISK-ON"));
      if (isBullish) {
        bullishScore += weight * (signal.rawData?.impactValue || 0.5);
        bullishEvidence.push({
          title: signal.rawData?.title || signal.type,
          evidence: evidence.reasoning.join("; "),
          confidence: evidence.confidence,
        });
      } else {
        bearishScore += weight * (signal.rawData?.impactValue || 0.5);
        bearishEvidence.push({
          title: signal.rawData?.title || signal.type,
          evidence: evidence.reasoning.join("; "),
          confidence: evidence.confidence,
        });
      }
      totalWeight += weight;
    }

    // Normalize scores (0–100)
    const maxScore = totalWeight || 1;
    const opportunityScore = Math.min(100, (bullishScore / maxScore) * 100);
    const riskScore = Math.min(100, (bearishScore / maxScore) * 100);

    // Overall confidence = average evidence confidence
    const avgConfidence =
      evidenceList.reduce((sum, e) => sum + e.evidence.confidence, 0) /
      (evidenceList.length || 1);

    // Verdict
    let verdict = "Balanced";
    if (opportunityScore - riskScore > 20) verdict = "Bullish opportunity";
    else if (riskScore - opportunityScore > 20) verdict = "Elevated risk";
    else verdict = "Mixed signals";

    // Explanation (personalized context)
    let explanation = `Based on ${evidenceList.length} signals, opportunity score is ${opportunityScore.toFixed(0)}/100 and risk score is ${riskScore.toFixed(0)}/100. `;
    if (verdict === "Bullish opportunity")
      explanation +=
        "The evidence leans bullish – consider monitoring for entry.";
    else if (verdict === "Elevated risk")
      explanation +=
        "Risk factors outweigh opportunities – proceed with caution.";
    else explanation += "Signals are mixed – wait for clearer evidence.";

    // 5. Return structured report
    return {
      asset: asset.symbol,
      opportunityScore: Math.round(opportunityScore),
      riskScore: Math.round(riskScore),
      bullishEvidence: bullishEvidence.slice(0, 5),
      bearishEvidence: bearishEvidence.slice(0, 5),
      verdict,
      confidence: Math.round(avgConfidence * 100),
      explanation,
      signalsCount: evidenceList.length,
    };
  }

  /**
   * Render the token analysis view.
   * @param {HTMLElement} view - The view container.
   * @param {string} assetId - The asset to analyze.
   */
  async function render(view, assetId) {
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
      const result = await analyze(assetId);
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
          <div style="margin-top:16px; padding:12px; background:rgba(124,92,255,0.08); border-radius:8px;">
            <b>Verdict:</b> ${result.verdict}
            <p class="small muted" style="margin-top:4px;">${result.explanation}</p>
          </div>
          <div style="margin-top:12px;">
            <button class="btn tiny" onclick="document.location.hash='#/token-analysis'">← New Analysis</button>
          </div>
        </div>
      `;
    } catch (e) {
      view.innerHTML = `<div class="card"><p class="muted">Analysis failed: ${e.message}</p></div>`;
    }
  }

  return { analyze, render };
})();

console.log("[TokenAnalysis] Module loaded.");
