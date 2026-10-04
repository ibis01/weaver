// ===============================================================
// Meme Opportunity Engine
// Purpose: rank tradable meme-token opportunities without allowing
// momentum to override hard security or market-structure failures.
// ===============================================================
window.W = window.W || {};
W.memeOpportunity = (() => {
  const METHODOLOGY_VERSION = "meme-opportunity-v1";
  const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const ratioScore = (value, low, high) => {
    if (value === null) return null;
    if (value <= low) return 0;
    if (value >= high) return 100;
    return ((value - low) / (high - low)) * 100;
  };
  const first = (...values) => values.find((v) => v !== null) ?? null;

  function securityVetoes(security = {}, shield = {}) {
    const vetoes = [];
    const add = (condition, message) => {
      if (condition) vetoes.push(message);
    };
    add(
      security.verdict?.key === "danger",
      "Composite security verdict is danger",
    );
    add(
      security.honeypot === true || shield.honeypot === true,
      "Honeypot or sell restriction detected",
    );
    add(
      security.sellBlocked === true || security.canSell === false,
      "Token may not be sellable",
    );
    add(
      security.mintAuthorityActive === true || shield.mintAuthority === true,
      "Mint authority remains active",
    );
    add(
      security.freezeAuthorityActive === true ||
        shield.freezeAuthority === true,
      "Freeze authority remains active",
    );
    add(security.ownerCanBlacklist === true, "Owner can blacklist holders");
    add(
      security.unboundedTaxChange === true ||
        security.taxChangeRisk === "critical",
      "Unbounded transfer-tax control",
    );
    add(
      security.liquidityRemovable === true || security.liquidityLock === "none",
      "Liquidity can be removed immediately",
    );
    return [...new Set(vetoes)];
  }

  function analyze(pair, context = {}) {
    const p = pair || {};
    const liquidity = num(p.liquidity?.usd);
    const volume24 = num(p.volume?.h24);
    const h1 = num(p.priceChange?.h1);
    const h6 = num(p.priceChange?.h6);
    const h24 = num(p.priceChange?.h24);
    const buys = num(p.txns?.h24?.buys);
    const sells = num(p.txns?.h24?.sells);
    const ageHours = p.pairCreatedAt
      ? Math.max(0, (Date.now() - Number(p.pairCreatedAt)) / 36e5)
      : null;
    const volumeLiquidity =
      liquidity && volume24 !== null ? volume24 / liquidity : null;
    const buySell =
      buys !== null && sells !== null && buys + sells > 0
        ? buys / (buys + sells)
        : null;
    const security = context.security || {};
    const shield = context.shield || {};
    const observation = context.observation || {};
    const concentration = observation.concentration || {};
    const graph = context.graphReport || {};
    const vetoes = securityVetoes(security, shield);

    const liquidityQuality =
      liquidity === null
        ? null
        : liquidity < 25000
          ? 0
          : liquidity < 75000
            ? 35
            : liquidity < 250000
              ? 75
              : 90;
    const momentum = [h1, h6, h24].filter((v) => v !== null).length
      ? clamp(
          clamp((h1 ?? 0) * 2 + 50) * 0.25 +
            clamp((h6 ?? 0) * 1.5 + 50) * 0.35 +
            clamp((h24 ?? 0) + 50) * 0.4,
        )
      : null;
    const participation = buySell === null ? null : clamp(buySell * 140);
    const volumeQuality =
      volumeLiquidity === null
        ? null
        : volumeLiquidity > 30
          ? 25
          : volumeLiquidity >= 1
            ? 85
            : 35;
    const ageQuality =
      ageHours === null
        ? null
        : ageHours < 0.17
          ? 15
          : ageHours < 6
            ? 40
            : ageHours <= 336
              ? 85
              : 55;
    const top10Pct = num(concentration.top10Pct);
    const clusteredSharePct = num(graph.clusteredSharePct);
    const estimatedSellSlippagePct =
      liquidity === null
        ? null
        : clamp((1000 / Math.max(liquidity, 1)) * 100 * 1.5);
    const executionRisk =
      estimatedSellSlippagePct === null
        ? null
        : estimatedSellSlippagePct >= 20
          ? 100
          : estimatedSellSlippagePct >= 10
            ? 75
            : estimatedSellSlippagePct >= 5
              ? 45
              : 20;
    const components = [
      ["liquidityQuality", liquidityQuality, 0.3],
      ["momentum", momentum, 0.25],
      ["participation", participation, 0.15],
      ["volumeQuality", volumeQuality, 0.15],
      ["ageQuality", ageQuality, 0.15],
    ];
    const availableWeight = components.reduce(
      (sum, [, value, weight]) => sum + (value === null ? 0 : weight),
      0,
    );
    const weighted = components.reduce(
      (sum, [, value, weight]) => sum + (value === null ? 0 : value * weight),
      0,
    );
    let score = availableWeight ? weighted / availableWeight : 0;
    const penalties = [];
    if (volumeLiquidity !== null && volumeLiquidity > 30) {
      score -= 15;
      penalties.push("Extreme volume/liquidity ratio — possible wash trading");
    }
    if (liquidity !== null && liquidity < 75000) {
      score -= 20;
      penalties.push("Thin liquidity creates high exit risk");
    }
    if (h24 !== null && h24 > 150 && (h6 ?? 0) > 50) {
      score -= 12;
      penalties.push("Price is likely overextended");
    }
    if (top10Pct !== null && top10Pct >= 50) {
      score -= top10Pct >= 70 ? 25 : 15;
      penalties.push(`Top 10 holders control ${top10Pct.toFixed(1)}%`);
    }
    if (clusteredSharePct !== null && clusteredSharePct >= 8) {
      score -= clusteredSharePct >= 20 ? 20 : 10;
      penalties.push(
        `Behavioural wallet clusters control ${clusteredSharePct.toFixed(1)}%`,
      );
    }
    if (executionRisk !== null && executionRisk >= 75) {
      score -= 15;
      penalties.push(
        `Estimated $1,000 exit slippage is high (${estimatedSellSlippagePct.toFixed(1)}%)`,
      );
    }
    if (shield.liquidityLocked === false || shield.lpLocked === false) {
      score -= 15;
      penalties.push("Liquidity lock is not verified");
    }
    if (vetoes.length) {
      score = Math.min(score, 15);
      penalties.push(...vetoes);
    }
    score = Math.round(clamp(score));

    const known = [liquidity, volume24, h1, h6, h24, ageHours, buySell].filter(
      (v) => v !== null,
    ).length;
    const confidence = Math.round(
      clamp(
        (known / 7) * 70 +
          (context.sourceCount > 1 ? 20 : 0) +
          (context.observation ? 10 : 0) -
          (vetoes.length ? 30 : 0),
      ),
    );
    const verdict = vetoes.length
      ? "SECURITY_REJECTED"
      : confidence < 60
        ? score >= 40
          ? "WATCH_FOR_CONFIRMATION"
          : "INSUFFICIENT_DATA"
        : score >= 75
          ? "EARLY_HIGH_QUALITY"
          : score >= 60
            ? "MOMENTUM_BUT_SPECULATIVE"
            : score >= 40
              ? "WATCH_FOR_CONFIRMATION"
              : "INSUFFICIENT_DATA";
    const reasons = [];
    if (liquidityQuality !== null)
      reasons.push(`Liquidity quality ${Math.round(liquidityQuality)}/100`);
    if (momentum !== null) reasons.push(`Momentum ${Math.round(momentum)}/100`);
    if (buySell !== null)
      reasons.push(`${Math.round(buySell * 100)}% of 24h trades were buys`);
    if (ageHours !== null)
      reasons.push(
        `Pair age ${ageHours < 24 ? ageHours.toFixed(1) + "h" : (ageHours / 24).toFixed(1) + "d"}`,
      );
    reasons.push(...penalties);
    return {
      methodologyVersion: METHODOLOGY_VERSION,
      opportunityScore: score,
      confidence,
      verdict,
      vetoes,
      penalties,
      reasons,
      breakdown: {
        liquidityQuality,
        momentum,
        participation,
        volumeQuality,
        ageQuality,
        volumeLiquidity,
        buySell,
        ageHours,
        top10Pct,
        clusteredSharePct,
        estimatedSellSlippagePct,
        executionRisk,
      },
      eligible: vetoes.length === 0 && score >= 40,
    };
  }

  return { METHODOLOGY_VERSION, analyze, securityVetoes };
})();
