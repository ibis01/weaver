// ===============================================================
// Meme Opportunity Engine
// Contract: meme-contracts-v1 / methodology: meme-opportunity-v1
// ===============================================================
window.W = window.W || {};
W.memeOpportunity = (() => {
  const METHODOLOGY_VERSION = "meme-opportunity-v1";
  const contracts = W.memeContracts;
  const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
  const num = (v) => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  const finite = (v, min = -Infinity, max = Infinity) => Number.isFinite(v) && v >= min && v <= max;

  function securityVetoes(security = {}, shield = {}) {
    const vetoes = [];
    const add = (condition, message) => { if (condition) vetoes.push(message); };
    add(security.verdict?.key === "danger", "Composite security verdict is danger");
    add(security.honeypot === true || shield.honeypot === true, "Honeypot or sell restriction detected");
    add(security.sellBlocked === true || security.canSell === false, "Token may not be sellable");
    add(security.mintAuthorityActive === true || shield.mintAuthority === true, "Mint authority remains active");
    add(security.freezeAuthorityActive === true || shield.freezeAuthority === true, "Freeze authority remains active");
    add(security.ownerCanBlacklist === true, "Owner can blacklist holders");
    add(security.unboundedTaxChange === true || security.taxChangeRisk === "critical", "Unbounded transfer-tax control");
    add(security.liquidityRemovable === true || security.liquidityLock === "none", "Liquidity can be removed immediately");
    return [...new Set(vetoes)];
  }

  function executionAnalysis(liquidityUsd) {
    const sizes = contracts?.TRADE_SIZES || [100, 500, 1000, 5000];
    if (!finite(liquidityUsd, 0)) {
      return { reserveUsd: null, trades: sizes.map((inputUsd) => ({ inputUsd, estimatedPriceImpactPct: null, estimatedSlippagePct: null, postTradeLiquidityUsd: null, capacity: "UNKNOWN" })), tradabilityCapacityUsd: null };
    }
    // Constant-product approximation: reported pool liquidity is both sides,
    // so one-sided reserve is conservatively estimated as liquidity / 2.
    const reserveUsd = Math.max(liquidityUsd / 2, 1);
    const trades = sizes.map((inputUsd) => {
      const priceImpactPct = (inputUsd / (reserveUsd + inputUsd)) * 100;
      const feePct = 0.30;
      const slippagePct = priceImpactPct + feePct;
      const capacity = inputUsd <= reserveUsd * 0.01 ? "GOOD" : inputUsd <= reserveUsd * 0.05 ? "LIMITED" : "POOR";
      return {
        inputUsd,
        estimatedPriceImpactPct: Number(priceImpactPct.toFixed(3)),
        estimatedSlippagePct: Number(slippagePct.toFixed(3)),
        postTradeLiquidityUsd: Number(Math.max(liquidityUsd - inputUsd, 0).toFixed(2)),
        capacity,
      };
    });
    return {
      reserveUsd: Number(reserveUsd.toFixed(2)),
      trades,
      tradabilityCapacityUsd: Number((reserveUsd * 0.05).toFixed(2)),
    };
  }

  function confidenceFor({ candidate, market, context, knownCount }) {
    const intel = W.intelligence || {};
    if (typeof intel.computeConfidence !== "function") return null;
    const observedAt = market.observedAt;
    const freshness = typeof intel.computeFreshness === "function"
      ? intel.computeFreshness(observedAt, "OPPORTUNITY")
      : null;
    const source = context.source || candidate.source || "unknown";
    const sourceReliability = typeof intel.getSourceReliability === "function"
      ? intel.getSourceReliability(source)
      : null;
    const dataCompleteness = knownCount / 8;
    const interpretationConfidence = finite(context.interpretationConfidence, 0, 1)
      ? context.interpretationConfidence
      : knownCount >= 4 ? 0.8 : null;
    return intel.computeConfidence({
      sourceReliability,
      dataFreshness: freshness,
      corroborationCount: Number.isFinite(context.sourceCount) ? context.sourceCount : 1,
      dataCompleteness,
      interpretationConfidence,
    });
  }

  function assess(input = {}) {
    const candidate = contracts.normalizeCandidate(input.candidate || input.pair || {});
    const market = contracts.normalizeMarket(input.market || input.pair || {});
    const context = input.context || input;
    const security = contracts.normalizeSecurity(input.security || context.security || {});
    const shield = context.shield || {};
    const observationInput = input.holders || input.walletFlow || {
      ...(context.observation?.concentration || {}),
      ...(context.graphReport || {}),
    };
    const observation = contracts.normalizeObservation(observationInput);
    const vetoes = securityVetoes(security, shield);
    const liquidity = num(market.liquidityUsd);
    const volume24 = num(market.volume24hUsd);
    const h1 = num(market.priceChange1hPct);
    const h6 = num(market.priceChange6hPct);
    const h24 = num(market.priceChange24hPct);
    const buys = num(market.buys24h);
    const sells = num(market.sells24h);
    const ageHours = market.pairCreatedAt ? Math.max(0, (Date.now() - Number(market.pairCreatedAt)) / 36e5) : null;
    const volumeLiquidity = liquidity && volume24 !== null ? volume24 / liquidity : null;
    const buySell = buys !== null && sells !== null && buys + sells > 0 ? buys / (buys + sells) : null;
    const liquidityQuality = liquidity === null ? null : liquidity < 25000 ? 0 : liquidity < 75000 ? 35 : liquidity < 250000 ? 75 : 90;
    const momentum = [h1, h6, h24].filter((v) => v !== null).length
      ? clamp((clamp((h1 ?? 0) * 2 + 50) * 0.25) + (clamp((h6 ?? 0) * 1.5 + 50) * 0.35) + (clamp((h24 ?? 0) + 50) * 0.4))
      : null;
    const participation = buySell === null ? null : clamp(buySell * 140);
    const volumeQuality = volumeLiquidity === null ? null : volumeLiquidity > 30 ? 25 : volumeLiquidity >= 1 ? 85 : 35;
    const ageQuality = ageHours === null ? null : ageHours < 0.17 ? 15 : ageHours < 6 ? 40 : ageHours <= 336 ? 85 : 55;
    const execution = executionAnalysis(liquidity);
    const thousand = execution.trades.find((trade) => trade.inputUsd === 1000);
    const executionRisk = thousand?.estimatedSlippagePct === null || !thousand
      ? null
      : thousand.estimatedSlippagePct >= 20 ? 100 : thousand.estimatedSlippagePct >= 10 ? 75 : thousand.estimatedSlippagePct >= 5 ? 45 : 20;
    const components = [["liquidityQuality", liquidityQuality, 0.30], ["momentum", momentum, 0.25], ["participation", participation, 0.15], ["volumeQuality", volumeQuality, 0.15], ["ageQuality", ageQuality, 0.15]];
    const availableWeight = components.reduce((sum, [, value, weight]) => sum + (value === null ? 0 : weight), 0);
    const weighted = components.reduce((sum, [, value, weight]) => sum + (value === null ? 0 : value * weight), 0);
    let score = availableWeight ? weighted / availableWeight : 0;
    const penalties = [];
    if (volumeLiquidity !== null && volumeLiquidity > 30) { score -= 15; penalties.push("Extreme volume/liquidity ratio — possible wash trading"); }
    if (liquidity !== null && liquidity < 75000) { score -= 20; penalties.push("Thin liquidity creates high exit risk"); }
    if (h24 !== null && h24 > 150 && (h6 ?? 0) > 50) { score -= 12; penalties.push("Price is likely overextended"); }
    if (observation.top10Pct !== null && observation.top10Pct >= 50) { score -= observation.top10Pct >= 70 ? 25 : 15; penalties.push(`Top 10 holders control ${observation.top10Pct.toFixed(1)}%`); }
    if (observation.clusteredSharePct !== null && observation.clusteredSharePct >= 8) { score -= observation.clusteredSharePct >= 20 ? 20 : 10; penalties.push(`Behavioural wallet clusters control ${observation.clusteredSharePct.toFixed(1)}%`); }
    if (executionRisk !== null && executionRisk >= 75) { score -= 15; penalties.push(`Estimated $1,000 exit slippage is high (${thousand.estimatedSlippagePct.toFixed(1)}%)`); }
    if (shield.liquidityLocked === false || shield.lpLocked === false) { score -= 15; penalties.push("Liquidity lock is not verified"); }
    if (vetoes.length) { score = Math.min(score, 15); penalties.push(...vetoes); }
    score = Math.round(clamp(score));
    const knownCount = [liquidity, volume24, h1, h6, h24, ageHours, buySell, market.observedAt].filter((v) => v !== null).length;
    const confidence = confidenceFor({ candidate, market, context, knownCount });
    const category = vetoes.length ? "SECURITY_REJECTED" : confidence === null ? (score >= 40 ? "WATCH_FOR_CONFIRMATION" : "INSUFFICIENT_DATA") : confidence < 0.6 ? (score >= 40 ? "WATCH_FOR_CONFIRMATION" : "INSUFFICIENT_DATA") : score >= 75 ? "EARLY_HIGH_QUALITY" : score >= 60 ? "MOMENTUM_BUT_SPECULATIVE" : score >= 40 ? "WATCH_FOR_CONFIRMATION" : "INSUFFICIENT_DATA";
    const reasons = [];
    if (liquidityQuality !== null) reasons.push(`Liquidity quality ${Math.round(liquidityQuality)}/100`);
    if (momentum !== null) reasons.push(`Momentum ${Math.round(momentum)}/100`);
    if (buySell !== null) reasons.push(`${Math.round(buySell * 100)}% of 24h trades were buys`);
    if (ageHours !== null) reasons.push(`Pair age ${ageHours < 24 ? ageHours.toFixed(1) + "h" : (ageHours / 24).toFixed(1) + "d"}`);
    reasons.push(...penalties);
    const eligibilityStatus = vetoes.length ? "SECURITY_REJECTED" : score >= 40 ? "ELIGIBLE" : "INSUFFICIENT_EVIDENCE";
    const result = {
      methodologyVersion: METHODOLOGY_VERSION,
      candidate,
      market,
      eligibility: { status: eligibilityStatus, vetoes },
      scores: { opportunity: score, survivability: liquidityQuality, executionRisk },
      opportunityScore: score,
      confidence,
      confidencePct: confidence === null ? null : Math.round(confidence * 100),
      verdict: category,
      category,
      vetoes,
      penalties,
      reasons,
      breakdown: {
        liquidityQuality, momentum, participation, volumeQuality, ageQuality,
        volumeLiquidity, buySell, ageHours, top10Pct: observation.top10Pct,
        clusteredSharePct: observation.clusteredSharePct, executionRisk,
        estimatedSellSlippagePct: thousand?.estimatedSlippagePct ?? null,
        execution,
      },
      evidence: Array.isArray(input.evidence) ? input.evidence : [],
      freshness: { observedAt: market.observedAt },
      eligible: eligibilityStatus === "ELIGIBLE",
    };
    const canonical = contracts.normalizeAssessment({ ...result, breakdown: result.breakdown, evidence: result.evidence, freshness: result.freshness, reasons: result.reasons });
    return Object.freeze({ ...result, ...canonical, methodologyVersion: METHODOLOGY_VERSION, opportunityScore: score, confidencePct: result.confidencePct, verdict: category, eligible: eligibilityStatus === "ELIGIBLE" });
  }

  // Backward-compatible adapter while callers migrate to assess({...}).
  function analyze(pair, context = {}) {
    return assess({ candidate: pair, market: pair, context, security: context.security });
  }

  return Object.freeze({ METHODOLOGY_VERSION, assess, analyze, securityVetoes, executionAnalysis });
})();
