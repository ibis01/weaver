// js/intelligence/smart-money/smart-entry-engine.js
//
// Composes convergence + momentum + historical wallet quality into a
// canonical SMART_MONEY_ENTRY signal.
//
// This is the module that finally produces something the events
// pipeline can collect.
//
// DESIGN NOTES:
//   - Refuses to emit when momentumState is MOMENTUM_CONFIRMED.
//     The brief's promise is "before broad market momentum
//     confirms it." A confirmed reading means we are late.
//   - Refuses to emit when momentumState is "unknown". A signal
//     built on data we cannot measure is a lie.
//   - Emits for PRE_MOMENTUM and MOMENTUM_EMERGING.
//   - Smart Entry Score follows the brief's 8-factor weighting.
//     Three of the eight factors (liquidity, holder structure,
//     risk/security) depend on data the radar does not yet fetch
//     end-to-end. Those components are left null and the score is
//     the weighted mean of the non-null components with weights
//     renormalized. This is the same discipline W.memeOpportunity
//     uses for its optional factors.
//   - metadata.dataCompleteness and interpretationConfidence are
//     computed from the fraction of the eight components that are
//     non-null. Real, honest, never fabricated.
//   - impactValue = smartEntryScore / 100, so the decision engine
//     has a real severity reading rather than the warn-once default.
//   - Never throws. Failure returns null with a logged reason.

window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.smartEntryEngine = (() => {
  "use strict";

  const MODULE_VERSION = "smart-entry-engine-v1";
  const SIGNAL_TYPE = "SMART_MONEY_ENTRY";
  const SOURCE = "smart_money_radar";

  // Brief's 8-factor weighting, in the order the brief lists them.
  const WEIGHTS = Object.freeze({
    walletQuality: 25,
    earlyTiming: 20,
    convergence: 20,
    capitalConviction: 10,
    priceMomentumGap: 10,
    liquidity: 5,
    holderStructure: 5,
    riskSecurity: 5,
  });
  const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);

  function clamp(v, lo = 0, hi = 100) {
    return Math.max(lo, Math.min(hi, v));
  }

  // 0-100 scalar. Higher = better.

  function componentWalletQuality(wallets) {
    if (!Array.isArray(wallets) || !wallets.length) return null;
    const rates = wallets
      .map((w) => w.historicalEarlyEntryRate)
      .filter((r) => Number.isFinite(r) && r >= 0 && r <= 1);
    if (!rates.length) return null;
    const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
    return clamp(mean * 100);
  }

  function componentEarlyTiming(convergence) {
    // Fraction of qualifying wallets that bought before asOf - half
    // of the window. Wallets that bought earlier in the window are
    // "more early" than wallets that bought at the very end.
    if (!convergence || !Array.isArray(convergence.qualifyingWallets))
      return null;
    if (!Number.isFinite(convergence.asOf) || !Number.isFinite(convergence.windowStart))
      return null;
    const midPoint = (convergence.asOf + convergence.windowStart) / 2;
    const wallets = convergence.qualifyingWallets.filter(
      (w) => Number.isFinite(w.lastBuyAt),
    );
    if (!wallets.length) return null;
    const early = wallets.filter((w) => w.lastBuyAt <= midPoint).length;
    return clamp((early / wallets.length) * 100);
  }

  function componentConvergence(convergence) {
    // Direct read of the detector's own count, normalized.
    // N_MIN is 3; N_CAP for scoring is 6 — beyond that, more wallets
    // add marginal signal, not linear signal.
    if (!convergence || !Number.isFinite(convergence.independentWalletCount))
      return null;
    const n = convergence.independentWalletCount;
    if (n < 3) return null;
    return clamp(((Math.min(n, 6) - 3) / (6 - 3)) * 100);
  }

  function componentCapitalConviction(convergence) {
    // Log-scaled total inflow across qualifying wallets. Ten
    // thousand USD is a low bar; one million is full credit.
    if (!convergence || !Array.isArray(convergence.qualifyingWallets))
      return null;
    const total = convergence.qualifyingWallets.reduce(
      (s, w) => s + (Number.isFinite(w.totalAmount) ? w.totalAmount : 0),
      0,
    );
    if (!(total > 0)) return null;
    const lo = Math.log(10_000);
    const hi = Math.log(1_000_000);
    const v = Math.log(Math.max(total, 1));
    return clamp(((v - lo) / (hi - lo)) * 100);
  }

  function componentPriceMomentumGap(momentum) {
    // How far the token still is from "confirmed". PRE_MOMENTUM is
    // full credit; EMERGING is partial; CONFIRMED would be 0 but we
    // refuse earlier in the pipeline anyway.
    if (!momentum || typeof momentum.momentumState !== "string") return null;
    if (momentum.momentumState === "PRE_MOMENTUM") return 100;
    if (momentum.momentumState === "MOMENTUM_EMERGING") return 50;
    return null;
  }

  // Structured evidence in the shape the drawer consumes. Every
  // entry is generated from real inputs; nothing is fabricated.
  function buildEvidence(convergence, momentum, components) {
    const supporting = [];
    const contradicting = [];
    const unknowns = [];

    if (convergence && Number.isFinite(convergence.independentWalletCount)) {
      supporting.push(
        `${convergence.independentWalletCount} independent historically-early wallets accumulating within ${Math.round((convergence.asOf - convergence.windowStart) / 60000)} minutes`,
      );
    }
    if (convergence && Number.isFinite(convergence.minPairwiseIndependence)) {
      supporting.push(
        `Minimum pairwise independence ${convergence.minPairwiseIndependence.toFixed(2)} (floor 0.70)`,
      );
    }
    if (momentum && momentum.momentumState === "PRE_MOMENTUM") {
      supporting.push("Momentum has not yet confirmed — price and volume are flat");
    } else if (momentum && momentum.momentumState === "MOMENTUM_EMERGING") {
      supporting.push("Early momentum signals present but not yet confirmed");
    }

    if (momentum && momentum.momentumState === "MOMENTUM_EMERGING") {
      contradicting.push(
        "Momentum is already emerging — some of the pre-momentum advantage may be gone",
      );
    }

    if (components.liquidity == null) {
      unknowns.push("Liquidity quality not evaluated by this module");
    }
    if (components.holderStructure == null) {
      unknowns.push("Holder structure not evaluated by this module");
    }
    if (components.riskSecurity == null) {
      unknowns.push("Token security assessment not evaluated by this module");
    }
    if (convergence && convergence._limitations) {
      if (convergence._limitations.fundingGraph) {
        unknowns.push(
          "Wallet independence uses co-timing and amount-proximity only; funding-source independence is deferred",
        );
      }
      if (convergence._limitations.subDayTiming) {
        unknowns.push(
          "Historical early-entry signal uses daily price maps; sub-day timing is not available",
        );
      }
    }

    return { supporting, contradicting, unknowns };
  }

  // Public: compose a signal, or return null.
  //
  // input = {
  //   chain: "ethereum",
  //   tokenAddress: "0x...",
  //   symbol: string,          // for the signal's assetId
  //   coingeckoId: string|null,
  //   convergence: <convergenceDetector.detect result>,
  //   momentum:    <momentumDetector.detect result>,
  //   asOf: <ms>               // optional; default Date.now()
  // }
  function compose(input) {
    if (!input || typeof input !== "object") return null;
    if (input.chain !== "ethereum") {
      console.warn("[SmartEntryEngine] unsupported chain:", input.chain);
      return null;
    }
    if (typeof input.tokenAddress !== "string" || !input.tokenAddress) {
      console.warn("[SmartEntryEngine] missing tokenAddress");
      return null;
    }
    if (!W.intelligence || typeof W.intelligence.create?.signal !== "function") {
      console.warn("[SmartEntryEngine] W.intelligence.create.signal unavailable");
      return null;
    }

    const asOf =
      Number.isFinite(input.asOf) && input.asOf > 0 ? input.asOf : Date.now();

    const convergence = input.convergence || null;
    const momentum = input.momentum || null;

    if (!convergence || convergence.convergence !== true) {
      console.warn("[SmartEntryEngine] no convergence — refusing to emit");
      return null;
    }
    if (!momentum || typeof momentum.momentumState !== "string") {
      console.warn("[SmartEntryEngine] momentum missing — refusing to emit");
      return null;
    }
    if (momentum.momentumState === "MOMENTUM_CONFIRMED") {
      console.warn(
        "[SmartEntryEngine] momentum already confirmed — refusing to emit",
      );
      return null;
    }
    if (momentum.momentumState === "unknown") {
      console.warn(
        "[SmartEntryEngine] momentum unknown — refusing to emit",
      );
      return null;
    }

    // Compute each component. Nulls stay null; they do not become 0.
    const components = {
      walletQuality: componentWalletQuality(convergence.qualifyingWallets),
      earlyTiming: componentEarlyTiming(convergence),
      convergence: componentConvergence(convergence),
      capitalConviction: componentCapitalConviction(convergence),
      priceMomentumGap: componentPriceMomentumGap(momentum),
      // The remaining three are not computable from the current
      // radar data. Left null on purpose. The score renormalizes.
      liquidity: null,
      holderStructure: null,
      riskSecurity: null,
    };

    // Weighted mean over non-null components.
    let weightedSum = 0;
    let effectiveWeight = 0;
    let measured = 0;
    const total = Object.keys(WEIGHTS).length;
    for (const [key, weight] of Object.entries(WEIGHTS)) {
      const v = components[key];
      if (v === null || v === undefined) continue;
      if (!Number.isFinite(v)) continue;
      weightedSum += v * weight;
      effectiveWeight += weight;
      measured++;
    }
    if (effectiveWeight === 0) {
      console.warn(
        "[SmartEntryEngine] no measurable score components — refusing to emit",
      );
      return null;
    }

    const smartEntryScore = clamp(weightedSum / effectiveWeight);
    const dataCompleteness = measured / total;
    const interpretationConfidence = dataCompleteness;

    // Composed independently of the score, so a low score does not
    // also read as low confidence. This mirrors the memCalibration
    // policy: confidence is about the data, not about the outcome.
    const evidence = buildEvidence(convergence, momentum, components);

    const title = `Early smart-money accumulation — ${
      typeof input.symbol === "string" && input.symbol
        ? input.symbol.toUpperCase()
        : "token"
    }`;

    const rawData = {
      title,
      impactValue: smartEntryScore / 100,
      smartEntryScore,
      momentumState: momentum.momentumState,
      wallets: convergence.qualifyingWallets.map((w) => ({
        address: w.wallet,
        chain: input.chain,
        earlyEntryRate: w.historicalEarlyEntryRate,
        lastBuyAt: w.lastBuyAt,
        buyCount: w.buyCount,
        totalAmount: w.totalAmount,
      })),
      aggregate: {
        independentWalletCount: convergence.independentWalletCount,
        totalNetInflow: convergence.qualifyingWallets.reduce(
          (s, w) => s + (Number.isFinite(w.totalAmount) ? w.totalAmount : 0),
          0,
        ),
        minPairwiseIndependence: convergence.minPairwiseIndependence,
        convergenceWindowMinutes: Math.round(
          (convergence.asOf - convergence.windowStart) / 60000,
        ),
      },
      components,
      evidence,
      reasoning: [
        `Smart Entry Score ${smartEntryScore.toFixed(0)}/100 (${measured} of ${total} components measured)`,
        `Momentum state: ${momentum.momentumState}`,
        ...evidence.supporting.map((s) => "• " + s),
      ],
      asOf,
      methodologyVersion: MODULE_VERSION,
    };

    let signal;
    try {
      signal = W.intelligence.create.signal({
        type: SIGNAL_TYPE,
        source: SOURCE,
        assetId: {
          chainId: input.chain,
          contractAddress: input.tokenAddress,
          symbol:
            typeof input.symbol === "string" && input.symbol
              ? input.symbol.toUpperCase()
              : "UNKNOWN",
          coingeckoId:
            typeof input.coingeckoId === "string" ? input.coingeckoId : null,
          name:
            typeof input.symbol === "string" && input.symbol
              ? input.symbol.toUpperCase()
              : "Unknown",
        },
        timestamp: asOf,
        rawData,
        metadata: {
          corroborationCount: 1,
          dataCompleteness,
          interpretationConfidence,
        },
      });
    } catch (e) {
      console.warn(
        "[SmartEntryEngine] signal creation threw:",
        e && e.message,
      );
      return null;
    }
    if (!signal) {
      console.warn("[SmartEntryEngine] signal creation returned null");
      return null;
    }
    return signal;
  }

  return Object.freeze({
    compose,
    version: MODULE_VERSION,
    SIGNAL_TYPE,
    SOURCE,
    _internal: Object.freeze({
      WEIGHTS,
      TOTAL_WEIGHT,
      componentWalletQuality,
      componentEarlyTiming,
      componentConvergence,
      componentCapitalConviction,
      componentPriceMomentumGap,
      buildEvidence,
    }),
  });
})();

console.log(
  "[SmartEntryEngine] Module loaded — composes SMART_MONEY_ENTRY, refuses on confirmed momentum.",
);
