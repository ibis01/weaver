// ===============================================================
//         Weaver Market Structure Observations
// ===============================================================
//
// Pure observation layer. Consumes a Shield assessment and a
// DexScreener pair, and produces a structured observation about
// market structure — holder concentration, liquidity lock status,
// and security flags.
//
// RELATIONSHIP TO SHIELD:
//   Shield classifies. This module observes. Shield's isHighRisk()
//   remains the single authority for the "high-risk" decision.
//   Market structure only produces measurements and indicators that
//   consumers (evidence drawer, gem cards) can surface as evidence.
//
// MISSING-DATA POLICY:
//   Every field is either a measured value or null. Null is never
//   coerced to zero, and a "status" derived from a missing value is
//   "unknown", never a default bucket. This matches the same
//   "unknown ≠ zero" contract enforced across the intelligence
//   layer.
//
// FLAG SHAPES:
//   EVM assessments carry boolean flags (isMintable, isHoneypot,
//   isProxy, isOwnerRenounced, isLpLocked). Solana assessments
//   carry object flags (mintable, freezable, closable,
//   metadataMutable, balanceMutable) where each is { active,
//   authority }. This module reads both shapes and reports the
//   boolean state uniformly; null when the underlying value is not
//   a boolean.
//
// TIME-SERIES:
//   This module produces a single observation per invocation. It
//   does not compute change5m / change15m / change1h — that requires
//   a persistent observation store, which is the trajectory module's
//   concern (a separate task). Consumers that want deltas must
//   persist observations themselves.
// ===============================================================

window.W = window.W || {};

W.marketStructure = (() => {
  const METHODOLOGY_VERSION = "market-structure-v1";

  // Concentration status is an INDICATOR, not a rule. The thresholds
  // are presentational aids, not a risk classification. Consumers
  // must phrase evidence like "top 10 hold 72% of supply" rather
  // than "concentrated = risky". The Shield high-risk predicate is
  // the only authority for the latter.
  function concentrationStatus(top10Pct) {
    if (!Number.isFinite(top10Pct)) return "unknown";
    if (top10Pct >= 60) return "concentrated";
    if (top10Pct >= 30) return "moderate";
    return "distributed";
  }

  // Liquidity lock status. null means "we did not determine this" —
  // never "unlocked by default".
  function liquidityStatus(hasLockedLp) {
    if (hasLockedLp === null || hasLockedLp === undefined) return "unknown";
    return hasLockedLp ? "locked" : "unlocked";
  }

  // Read a flag that may appear in either of two shapes:
  //   - direct boolean under one field name (EVM)
  //   - { active } object under a different field name (Solana)
  // Returns the boolean state, or null when neither shape yields
  // a boolean.
  function readFlag(flags, objectField, booleanField) {
    if (!flags || typeof flags !== "object") return null;
    const maybeObject = flags[objectField];
    if (maybeObject && typeof maybeObject === "object") {
      return typeof maybeObject.active === "boolean"
        ? maybeObject.active
        : null;
    }
    const maybeBoolean = flags[booleanField];
    return typeof maybeBoolean === "boolean" ? maybeBoolean : null;
  }

  function observe(assessment, pair) {
    if (!assessment || typeof assessment !== "object") return null;

    const holders =
      assessment.holders && typeof assessment.holders === "object"
        ? assessment.holders
        : null;

    const top10Pct =
      holders && Number.isFinite(holders.top10Pct) ? holders.top10Pct : null;

    const hasLockedLp =
      holders && typeof holders.hasLockedLp === "boolean"
        ? holders.hasLockedLp
        : null;

    const pairLiquidity =
      pair && pair.liquidity && Number.isFinite(pair.liquidity.usd)
        ? pair.liquidity.usd
        : null;

    const flags = assessment.flags || {};

    return {
      concentration: {
        top10Pct,
        top10Wallets: holders ? holders.top10 : null,
        status: concentrationStatus(top10Pct),
      },
      liquidity: {
        usd: pairLiquidity,
        lpCount: holders ? holders.lpCount : null,
        lockedLpCount: holders ? holders.lockedLpCount : null,
        status: liquidityStatus(hasLockedLp),
      },
      flags: {
        // mintable has two shapes:
        //   EVM:    flags.isMintable — a boolean
        //   Solana: flags.mintable   — { active, authority }
        mintable: readFlag(flags, "mintable", "isMintable"),
        // EVM-only flags.
        honeypot:
          typeof flags.isHoneypot === "boolean" ? flags.isHoneypot : null,
        proxy: typeof flags.isProxy === "boolean" ? flags.isProxy : null,
        ownerRenounced:
          typeof flags.isOwnerRenounced === "boolean"
            ? flags.isOwnerRenounced
            : null,
        // Solana-only flags. Different shape on the Solana assessment.
        freezable: readFlag(flags, "freezable", "freezable"),
        balanceMutable: readFlag(flags, "balanceMutable", "balanceMutable"),
      },
      holderCount: holders ? holders.count : null,
      source: holders?.source || "unavailable",
      methodologyVersion: METHODOLOGY_VERSION,
      observedAt: Date.now(),
    };
  }

  // Human-readable one-line summary, suitable for an evidence drawer
  // or gem card. Does not classify; states what was measured.
  function summarise(observation) {
    if (!observation) return null;
    const parts = [];
    const c = observation.concentration;
    if (c && Number.isFinite(c.top10Pct)) {
      parts.push(`Top 10 hold ${c.top10Pct.toFixed(1)}% (${c.status})`);
    } else {
      parts.push("Holder concentration: unknown");
    }
    const l = observation.liquidity;
    if (l && l.status !== "unknown") {
      parts.push(`LP ${l.status}`);
    } else {
      parts.push("LP lock: unknown");
    }
    return parts.join(" · ");
  }

  // Human-readable one-line summary of a trajectory object.
  // Returns null when no delta is available — the caller omits the
  // row rather than printing placeholder noise.
  //
  // Format: "Top 10 ↑ 3.1% 5m · Holders ↑ 12 5m · Liquidity ↓ 8.5% 5m"
  //
  // For each metric, the shortest available interval wins
  // (5m > 15m > 1h). Deltas with direction "unknown" are skipped.
  // Arrows: ↑ rising, ↓ falling, → stable.
  function summariseTrajectory(trajectory) {
    if (!trajectory || typeof trajectory !== "object") return null;

    function pickDelta(metric) {
      if (!metric || typeof metric !== "object") return null;
      for (const key of ["change5m", "change15m", "change1h"]) {
        const d = metric[key];
        if (d && typeof d.direction === "string" && d.direction !== "unknown") {
          return { ...d, interval: key.replace("change", "") };
        }
      }
      return null;
    }

    function arrow(direction) {
      if (direction === "rising") return "↑";
      if (direction === "falling") return "↓";
      return "→";
    }

    const parts = [];

    const conc = pickDelta(trajectory.concentration?.top10Pct);
    if (conc && Number.isFinite(conc.percent)) {
      parts.push(
        `Top 10 ${arrow(conc.direction)} ${Math.abs(conc.percent).toFixed(1)}% ${conc.interval}`,
      );
    }

    const holders = pickDelta(trajectory.holderCount);
    if (holders && Number.isFinite(holders.absolute)) {
      parts.push(
        `Holders ${arrow(holders.direction)} ${Math.abs(holders.absolute)} ${holders.interval}`,
      );
    }

    const liq = pickDelta(trajectory.liquidity?.usd);
    if (liq && Number.isFinite(liq.percent)) {
      parts.push(
        `Liquidity ${arrow(liq.direction)} ${Math.abs(liq.percent).toFixed(1)}% ${liq.interval}`,
      );
    }

    if (!parts.length) return null;
    return parts.join(" · ");
  }

  return {
    observe,
    summarise,
    summariseTrajectory,
    METHODOLOGY_VERSION,
    // Exposed for tests only.
    _internal: { concentrationStatus, liquidityStatus, readFlag },
  };
})();

console.log("[MarketStructure] Module loaded.");
