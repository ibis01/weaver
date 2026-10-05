// js/intelligence/meme-opportunity.js
// Consumes W.memeContracts. Delegates confidence to W.intelligence.
window.W = window.W || {};

W.memeOpportunity = (() => {
  const METHODOLOGY_VERSION = "meme-opportunity-v1";
  const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
  const num = (v) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const boolOrNull = (v) => {
    if (v === true || v === 1 || v === "1") return true;
    if (v === false || v === 0 || v === "0") return false;
    return null;
  };

  // ── Scorers ───────────────────────────────────────────

  const scoreLiquidity = (m) => {
    const l = m?.liquidityUsd;
    if (l === null || l === undefined) return null;
    if (l < 25000) return 0;
    if (l < 75000) return 35;
    if (l < 250000) return 75;
    return 90;
  };

  const scoreMomentum = (m) => {
    const h1 = m?.priceChange1h,
      h6 = m?.priceChange6h,
      h24 = m?.priceChange24h;
    if ([h1, h6, h24].every((v) => v === null || v === undefined)) return null;
    return clamp(
      clamp((h1 ?? 0) * 2 + 50) * 0.25 +
        clamp((h6 ?? 0) * 1.5 + 50) * 0.35 +
        clamp((h24 ?? 0) + 50) * 0.4,
    );
  };

  const scoreParticipation = (m) => {
    const b = m?.buys24h,
      s = m?.sells24h;
    if (b === null || b === undefined || s === null || s === undefined)
      return null;
    if (b + s === 0) return null;
    return clamp((b / (b + s)) * 140);
  };

  const scoreVolumeQuality = (m) => {
    const l = m?.liquidityUsd,
      v = m?.volume24h;
    if (!l || v === null || v === undefined) return null;
    const r = v / l;
    if (r > 30) return 25;
    if (r >= 1) return 85;
    return 35;
  };

  const scoreAge = (m) => {
    const a = m?.pairAgeMinutes;
    if (a === null || a === undefined) return null;
    const h = a / 60;
    if (h < 0.17) return 15;
    if (h < 6) return 40;
    if (h <= 336) return 85;
    return 55;
  };

  const estimateSellSlippage = (liquidityUsd) => {
    if (
      liquidityUsd === null ||
      liquidityUsd === undefined ||
      liquidityUsd <= 0
    )
      return null;
    return clamp((1000 / Math.max(liquidityUsd, 1)) * 100 * 1.5);
  };

  const scoreExecutionRisk = (m) => {
    const slip = estimateSellSlippage(m?.liquidityUsd);
    if (slip === null) return null;
    if (slip >= 20) return 100;
    if (slip >= 10) return 75;
    if (slip >= 5) return 45;
    return 20;
  };

  // ── Vetoes ────────────────────────────────────────────

  function collectVetoes(security) {
    const v = [];
    const s = security || {};
    const add = (code, reason, severity, cond) => {
      if (cond) v.push({ code, reason, severity });
    };
    add(
      "HONEYPOT",
      "Honeypot or sell restriction detected",
      "block",
      s.honeypot === true,
    );
    add(
      "CANNOT_SELL",
      "Token may not be sellable",
      "block",
      s.canSell === false,
    );
    add(
      "MINT_AUTHORITY",
      "Mint authority remains active",
      "block",
      s.mintAuthorityActive === true,
    );
    add(
      "FREEZE_AUTHORITY",
      "Freeze authority remains active",
      "block",
      s.freezeAuthorityActive === true,
    );
    add(
      "OWNER_BLACKLIST",
      "Owner can blacklist holders",
      "block",
      s.ownerCanBlacklist === true,
    );
    add(
      "TAX_CHANGE",
      "Unbounded transfer-tax control",
      "block",
      s.taxChangeRisk === "high" || s.taxChangeRisk === "critical",
    );
    add(
      "LIQUIDITY_REMOVABLE",
      "Liquidity can be removed immediately",
      "block",
      s.liquidityRemovable === true,
    );
    add(
      "LP_UNLOCKED",
      "Liquidity is unlocked",
      "warn",
      s.lpLockStatus === "unlocked",
    );
    add(
      "LP_PARTIAL",
      "Liquidity is only partially locked",
      "warn",
      s.lpLockStatus === "partially-locked",
    );
    add(
      "LP_UNVERIFIED",
      "Liquidity lock is provider-reported, not verified on-chain",
      "warn",
      s.lpLockStatus === "provider-reported" ||
        s.lpLockStatus === "conflicting",
    );
    return v;
  }

  // ── Confidence: delegated, never local ────────────────

  function delegateConfidence({ market, security, holders, walletFlow }) {
    if (
      !W.intelligence ||
      typeof W.intelligence.computeConfidence !== "function"
    )
      return null;
    // Holder data is required to interpret participation — without it
    // we do not fabricate a confidence number.
    if (!market || !security || !holders) return null;

    const present = [market, security, holders, walletFlow].filter(
      (x) => x != null,
    ).length;
    const dataCompleteness = present / 4;

    const interpretationConfidence =
      security?.verdict === "verified-safe"
        ? 1
        : security?.verdict === "provider-reported-safe"
          ? 0.7
          : security?.verdict === "conflicting"
            ? 0.3
            : null;

    const sourceReliability =
      security?.provenance?.source === "goplus"
        ? 0.7
        : market?.provenance?.source === "dexscreener"
          ? 0.6
          : null;

    const dataFreshness = freshnessFromTimestamps(
      market?.observedAt,
      security?.observedAt,
    );
    const corroborationCount = 1;

    const factors = {
      dataCompleteness,
      interpretationConfidence,
      sourceReliability,
      dataFreshness,
      corroborationCount,
    };
    if (Object.values(factors).some((v) => v === null)) return null;
    try {
      return W.intelligence.computeConfidence(factors);
    } catch (e) {
      console.warn(
        "[MemeOpportunity] computeConfidence threw:",
        e && e.message,
      );
      return null;
    }
  }

  function freshnessFromTimestamps(...ts) {
    const valid = ts.filter((t) => typeof t === "number" && t > 0);
    if (!valid.length) return null;
    const age = Date.now() - Math.min(...valid);
    return clamp(1 - age / (24 * 60 * 60 * 1000), 0, 1);
  }

  // ── assess(): canonical entry point ───────────────────

  function assess(input) {
    const {
      candidate,
      market,
      holders,
      walletFlow,
      security,
      social,
      evidence,
    } = input || {};

    const vetoes = collectVetoes(security);
    const hasBlock = vetoes.some((v) => v.severity === "block");
    const eligibilityStatus = hasBlock
      ? "INELIGIBLE"
      : !market || !security
        ? "INSUFFICIENT_DATA"
        : "ELIGIBLE";

    const liquidityQuality = scoreLiquidity(market);
    const momentum = scoreMomentum(market);
    const participation = scoreParticipation(market);
    const volumeQuality = scoreVolumeQuality(market);
    const ageQuality = scoreAge(market);
    const executionRisk = scoreExecutionRisk(market);

    const components = [
      [liquidityQuality, 0.3],
      [momentum, 0.25],
      [participation, 0.15],
      [volumeQuality, 0.15],
      [ageQuality, 0.15],
    ];
    let aw = 0,
      w = 0;
    for (const [v, wt] of components) {
      if (v === null) continue;
      aw += wt;
      w += v * wt;
    }
    let opportunityRaw = aw ? w / aw : null;

    // Gather penalty deltas without mutating a possibly-null score.
    const penalties = [];
    const deltas = [];

    const volRatio =
      market?.liquidityUsd && market?.volume24h != null
        ? market.volume24h / market.liquidityUsd
        : null;
    if (volRatio !== null && volRatio > 30) {
      deltas.push(-15);
      penalties.push("Extreme volume/liquidity ratio — possible wash trading");
    }
    if (market?.liquidityUsd != null && market.liquidityUsd < 75000) {
      deltas.push(-20);
      penalties.push("Thin liquidity creates high exit risk");
    }
    if (holders?.top10Pct != null && holders.top10Pct >= 50) {
      deltas.push(holders.top10Pct >= 70 ? -25 : -15);
      penalties.push(`Top 10 holders control ${holders.top10Pct.toFixed(1)}%`);
    }
    if (holders?.clusteredPct != null && holders.clusteredPct >= 8) {
      deltas.push(holders.clusteredPct >= 20 ? -20 : -10);
      penalties.push(
        `Behavioural wallet clusters control ${holders.clusteredPct.toFixed(1)}%`,
      );
    }
    if (
      security?.lpLockStatus === "provider-reported" ||
      security?.lpLockStatus === "conflicting"
    ) {
      deltas.push(-15);
      penalties.push(
        "Liquidity lock is provider-reported, not verified on-chain",
      );
    }
    if (security?.lpLockStatus === "partially-locked") {
      deltas.push(-20);
      penalties.push("Liquidity is only partially locked");
    }

    // Apply penalties ONLY when a score exists. A null score stays null.
    if (opportunityRaw !== null) {
      for (const d of deltas) opportunityRaw += d;
      if (hasBlock) opportunityRaw = Math.min(opportunityRaw, 15);
    }

    const opportunityScore =
      opportunityRaw === null ? null : Math.round(clamp(opportunityRaw));

    const survivability = (() => {
      const secScore =
        security?.verdict === "verified-safe"
          ? 100
          : security?.verdict === "provider-reported-safe"
            ? 70
            : null;
      const parts = [
        [liquidityQuality, 0.4],
        [volumeQuality, 0.3],
        [ageQuality, 0.2],
        [secScore, 0.1],
      ];
      let a = 0,
        s = 0;
      for (const [v, wt] of parts) {
        if (v === null) continue;
        a += wt;
        s += v * wt;
      }
      return a ? Math.round(clamp(s / a)) : null;
    })();

    const confidence = delegateConfidence({
      market,
      security,
      holders,
      walletFlow,
    });

    const category = (() => {
      if (eligibilityStatus === "INELIGIBLE") return "AVOID";
      if (opportunityScore === null || confidence === null) return "UNKNOWN";
      if (confidence < 0.6)
        return opportunityScore >= 40 ? "WATCH_FOR_CONFIRMATION" : "UNKNOWN";
      if (opportunityScore >= 75) return "EARLY_MOMENTUM";
      if (opportunityScore >= 60) return "ESTABLISHED";
      if (opportunityScore >= 40) return "WATCH_FOR_CONFIRMATION";
      return "AVOID";
    })();

    const buySell =
      market?.buys24h != null &&
      market?.sells24h != null &&
      market.buys24h + market.sells24h > 0
        ? market.buys24h / (market.buys24h + market.sells24h)
        : null;
    const ageHours =
      market?.pairAgeMinutes != null ? market.pairAgeMinutes / 60 : null;

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
    reasons.push(...penalties, ...vetoes.map((v) => v.reason));

    return W.memeContracts.parse("MemeOpportunityAssessment", {
      methodologyVersion: METHODOLOGY_VERSION,
      identity: candidate?.identity || {
        chain: "unknown",
        tokenAddress: "unknown",
      },
      eligibility: { status: eligibilityStatus, vetoes },
      scores: { opportunity: opportunityScore, survivability, executionRisk },
      confidence,
      category,
      breakdown: {
        liquidityQuality,
        momentum,
        participation,
        volumeQuality,
        ageQuality,
        volumeLiquidity: volRatio,
        buySell,
        ageHours,
        top10Pct: holders?.top10Pct ?? null,
        clusteredSharePct: holders?.clusteredPct ?? null,
        estimatedSellSlippagePct: estimateSellSlippage(market?.liquidityUsd),
        executionRisk,
      },
      evidence: evidence || [],
      freshness: {
        market: market?.observedAt ?? null,
        security: security?.observedAt ?? null,
      },
      reasons,
    });
  }

  // ── analyze(): back-compat wrapper ────────────────────

  function analyze(pair, context = {}) {
    const p = pair || {};
    const ctx = context || {};
    const now = Date.now();
    const age = num(p.pairCreatedAt)
      ? Math.max(0, (now - num(p.pairCreatedAt)) / 60000)
      : null;

    const prov = (source) => ({
      source,
      observedAt: now,
      fetchedAt: now,
      methodologyVersion: W.memeContracts.METHODOLOGY_VERSION,
      completeness: null,
    });

    const market = W.memeContracts.parse("MarketSnapshot", {
      observedAt: now,
      pairAgeMinutes: age,
      liquidityUsd: num(p.liquidity?.usd),
      liquidityChange1h: num(p.liquidity?.change1h),
      volume5m: num(p.volume?.m5),
      volume1h: num(p.volume?.h1),
      volume6h: num(p.volume?.h6),
      volume24h: num(p.volume?.h24),
      priceChange5m: num(p.priceChange?.m5),
      priceChange1h: num(p.priceChange?.h1),
      priceChange6h: num(p.priceChange?.h6),
      priceChange24h: num(p.priceChange?.h24),
      buys5m: num(p.txns?.m5?.buys),
      sells5m: num(p.txns?.m5?.sells),
      buys1h: num(p.txns?.h1?.buys),
      sells1h: num(p.txns?.h1?.sells),
      buys24h: num(p.txns?.h24?.buys),
      sells24h: num(p.txns?.h24?.sells),
      provenance: prov("dexscreener"),
    });

    const candidate = W.memeContracts.parse("Candidate", {
      identity: {
        chain: String(p.chainId || "unknown"),
        tokenAddress: p.baseToken?.address || p.pairAddress || "unknown",
      },
      symbol: p.baseToken?.symbol || null,
      name: p.baseToken?.name || null,
      pairAddress: p.pairAddress || null,
      dex: p.dexId || null,
      discoveredAt: now,
      discoverySource: "aggregator",
      discoveryConfidence: null,
      provenance: prov("dexscreener"),
    });

    const sec = ctx.security || {},
      shield = ctx.shield || {};
    const security = W.memeContracts.parse("SecurityAssessment", {
      observedAt: now,
      verdict:
        sec.verdict?.key === "danger" || shield.honeypot === true
          ? "conflicting"
          : sec.verdict?.key === "safe"
            ? "provider-reported-safe"
            : "provider-reported-safe",
      honeypot: boolOrNull(sec.honeypot ?? shield.honeypot),
      canSell: boolOrNull(
        sec.canSell ?? (shield.honeypot === true ? false : null),
      ),
      mintAuthorityActive: boolOrNull(
        sec.mintAuthorityActive ?? shield.mintAuthority,
      ),
      freezeAuthorityActive: boolOrNull(
        sec.freezeAuthorityActive ?? shield.freezeAuthority,
      ),
      ownerCanBlacklist: boolOrNull(sec.ownerCanBlacklist),
      taxChangeRisk: normalizeTaxRisk(sec.taxChangeRisk),
      liquidityRemovable: boolOrNull(sec.liquidityRemovable),
      lpLockStatus: normalizeLpLock(sec, shield),
      lpLockDetails: null,
      simulationStatus: "not-simulated",
      source: sec.source || "goplus",
      freshness: null,
      provenance: { ...prov(sec.source || "goplus"), observedAt: null },
    });

    const obs = ctx.observation || {},
      conc = obs.concentration || {},
      g = ctx.graphReport || {};
    const holders = W.memeContracts.parse("HolderSnapshot", {
      observedAt: now,
      holderCount: null,
      uniqueHolderCount: null,
      holderGrowth1h: null,
      holderGrowth6h: null,
      holderGrowth24h: null,
      top10Pct: num(conc.top10Pct),
      top20Pct: num(conc.top20Pct),
      creatorPct: null,
      sniperPct: null,
      freshWalletPct: null,
      clusteredPct: num(g.clusteredSharePct),
      provenance: { ...prov("observation"), observedAt: null },
    });

    const result = assess({
      candidate,
      market,
      holders,
      walletFlow: null,
      security,
      social: null,
      evidence: [],
    });
    if (!result) return null;

    // Legacy field compatibility for gems.js and legacy tests.
    result.opportunityScore = result.scores.opportunity;
    result.verdict = mapToLegacyVerdict(
      result.category,
      result.eligibility.status,
    );
    result.vetoes = result.eligibility.vetoes.map((v) => v.reason);
    result.penalties = result.reasons.filter((r) =>
      /ratio|thin|control|liquidity lock|partially|slippage|clusters/i.test(r),
    );
    result.eligible =
      result.eligibility.status === "ELIGIBLE" &&
      (result.scores.opportunity ?? 0) >= 40;
    return result;
  }

  // ── Helpers ───────────────────────────────────────────

  function normalizeTaxRisk(v) {
    if (v === "critical") return "high";
    return ["none", "low", "medium", "high", "unknown"].includes(v) ? v : null;
  }

  function normalizeLpLock(sec, shield) {
    const allowed = W.memeContracts.LP_LOCK_STATUSES;
    if (sec.lpLockStatus && allowed.includes(sec.lpLockStatus))
      return sec.lpLockStatus;
    if (Array.isArray(sec.lpHolders) && sec.lpHolders.length) {
      const vals = sec.lpHolders.map((h) => boolOrNull(h.is_locked));
      if (vals.every((v) => v === true)) return "provider-reported";
      if (vals.every((v) => v === false)) return "unlocked";
      if (vals.some((v) => v === true) && vals.some((v) => v === false))
        return "partially-locked";
      return "unknown";
    }
    if (shield.liquidityLocked === true || shield.lpLocked === true)
      return "provider-reported";
    if (shield.liquidityLocked === false || shield.lpLocked === false)
      return "unlocked";
    return "unknown";
  }

  function mapToLegacyVerdict(category, eligibilityStatus) {
    if (eligibilityStatus === "INELIGIBLE") return "SECURITY_REJECTED";
    return (
      {
        EARLY_MOMENTUM: "EARLY_HIGH_QUALITY",
        ESTABLISHED: "MOMENTUM_BUT_SPECULATIVE",
        WATCH_FOR_CONFIRMATION: "WATCH_FOR_CONFIRMATION",
        AVOID: "INSUFFICIENT_DATA",
        UNKNOWN: "INSUFFICIENT_DATA",
      }[category] || "INSUFFICIENT_DATA"
    );
  }

  return {
    METHODOLOGY_VERSION,
    analyze,
    assess,
    collectVetoes,
    securityVetoes: collectVetoes,
  };
})();
