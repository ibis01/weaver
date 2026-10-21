// js/intelligence/reasoning/evidence-synthesizer.js
//
// Phase 5: Evidence Synthesizer
// Converts structured risk, smart-money, and market data into a
// human-readable explanation (thesis) without hallucinating facts.

window.W = window.W || {};

W.evidenceSynthesizer = (() => {
  "use strict";

  const MODULE_VERSION = "evidence-synthesizer-v1";

  /**
   * Generates a deterministic, human-readable thesis from a gem object.
   * @param {Object} gem - The enriched gem object from W.gems.scan()
   * @returns {Object} { title, narrative, signals, risks, invalidation }
   */
  function synthesize(gem) {
    if (!gem || !gem.pair || !gem.analysis) {
      return null;
    }

    const symbol = gem.pair.baseToken?.symbol || "Unknown";
    const chain = gem.pair.chainId;
    const risk = gem.risk || {};
    const shield = gem.shield || {};
    const smartMoney = gem.smartMoneySignal || {};
    const observation = gem.observation || {};

    const narrative = [];
    const signals = [];
    const risks = [];
    const invalidation = [];

    // ── 1. Smart Money Narrative ──
    if (smartMoney.hasConvergence) {
      signals.push(
        `💰 ${smartMoney.independentCount} independent smart wallets are accumulating.`,
      );
      narrative.push(
        `Our on-chain analysis detected ${smartMoney.independentCount} historically profitable wallets buying ${symbol} simultaneously. ` +
          `These wallets were verified for independence and show a history of early entry.`,
      );
    } else {
      narrative.push(
        `No verified smart-money convergence was detected for this token. ` +
          `The current momentum may be driven by retail activity or a single coordinated entity.`,
      );
    }

    // ── 2. Security & Risk Narrative ──
    if (risk.verdict && risk.verdict.key === "danger") {
      risks.push(`🚨 High Risk: ${risk.flags.map((f) => f.text).join(", ")}`);
      narrative.push(
        `The Token Shield flagged this contract as DANGEROUS. ` +
          `Critical warnings include: ${risk.flags
            .slice(0, 2)
            .map((f) => f.text)
            .join(" and ")}. ` +
          `Extreme caution is advised; this token exhibits patterns common to rug pulls.`,
      );
      invalidation.push(
        "Immediate invalidation: Contract is flagged as high-risk by Shield.",
      );
    } else if (risk.verdict && risk.verdict.key === "caution") {
      risks.push(`⚠️ Caution: Minor risk flags detected.`);
      narrative.push(
        `Security analysis indicates some caution flags (e.g., ${risk.flags[0]?.text || "unlocked liquidity"}). ` +
          `While not an immediate honeypot, the contract owner retains some privileges.`,
      );
    } else if (risk.verdict && risk.verdict.key === "pass") {
      signals.push(`🛡️ Security passed with low risk.`);
      narrative.push(
        `The contract security looks clean. No honeypot functions, minting risks, or extreme taxes were detected by our GoPlus and Honeypot.is integrations.`,
      );
    }

    // ── 3. Market Structure Narrative ──
    if (
      observation.concentration &&
      Number.isFinite(observation.concentration.top10Pct)
    ) {
      const top10 = observation.concentration.top10Pct;
      if (top10 > 50) {
        risks.push(`⚠️ High concentration: Top 10 hold ${top10.toFixed(1)}%.`);
        narrative.push(
          `However, token distribution is highly concentrated (Top 10 wallets hold ${top10.toFixed(1)}%). ` +
            `A coordinated sell-off by these whales could instantly crash the price.`,
        );
      } else {
        signals.push(
          `✅ Healthy distribution (Top 10 hold ${top10.toFixed(1)}%).`,
        );
      }
    }

    // ── 4. Liquidity & Age Narrative ──
    const liq = gem.analysis.liq || 0;
    const ageH = gem.analysis.ageH || 0;
    if (liq < 30000) {
      risks.push(`⚠️ Low liquidity ($${(liq / 1000).toFixed(1)}k).`);
      narrative.push(
        `Liquidity is very thin ($${(liq / 1000).toFixed(1)}k), meaning slippage on entry and exit will be high.`,
      );
      invalidation.push("If liquidity drops below $15k, exit immediately.");
    }
    if (ageH < 6) {
      risks.push(`⚠️ Very new token (${ageH.toFixed(1)}h old).`);
    }

    // ── 5. Final Verdict ──
    let finalStatement = "";
    if (
      smartMoney.hasConvergence &&
      (!risk.verdict || risk.verdict.key === "pass")
    ) {
      finalStatement = `${symbol} presents a high-conviction opportunity. Verified smart money is entering a secure, low-risk contract.`;
    } else if (smartMoney.hasConvergence && risk.verdict?.key === "caution") {
      finalStatement = `${symbol} shows promising smart money activity, but the contract carries minor risks. Consider a smaller position size.`;
    } else if (!smartMoney.hasConvergence && risk.verdict?.key === "pass") {
      finalStatement = `The contract is safe, but we lack evidence of smart-money accumulation. This is a momentum play, not a smart-money play.`;
    } else {
      finalStatement = `${symbol} should be avoided. The lack of smart money combined with risk flags makes this a high-probability loss scenario.`;
    }

    return {
      title: `Evidence Report: $${symbol} (${chain})`,
      narrative: narrative.join(" "),
      signals,
      risks,
      invalidation: invalidation.join(" "),
      finalVerdict: finalStatement,
      version: MODULE_VERSION,
      timestamp: new Date().toISOString(),
    };
  }

  return Object.freeze({
    synthesize,
    version: MODULE_VERSION,
  });
})();

console.log(
  "[EvidenceSynthesizer] Module loaded — deterministic reasoning engine armed.",
);
