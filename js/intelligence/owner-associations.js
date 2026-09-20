// ===============================================================
//         Weaver Owner Associations
// ===============================================================
//
// Session-scoped observations of the owner address reported by
// GoPlus for EVM tokens. Records which tokens have been seen with
// the same owner address during the current session.
//
// DESIGN REFERENCE:
//   docs/owner-associations-design.md
//
// TERMINOLOGY:
//   The value comes from GoPlus's `owner_address` field, which is
//   the owner/admin authority reported at observation time. It is
//   NOT necessarily the contract creator. GoPlus exposes
//   creator_address separately. This module never claims to know
//   who deployed a token.
//
//   An owner address is not an entity. Two tokens with the same
//   owner address do not imply the same team or project. The
//   strongest supported statement is: "the same address was
//   observed as owner on multiple tokens."
//
// SCOPE:
//   - Session-scoped, in-memory only. Nothing persists across page
//     reloads.
//   - No network requests. The assessment is already cached by the
//     caller.
//   - EVM only. The GoPlus Solana endpoint does not return an
//     owner field in the same shape.
//
// DEDUPLICATION:
//   - Outer key: (chain, ownerAddress). Same address on two chains
//     is two separate associations.
//   - Per-token key: tokenAddress within the chain-scoped
//     association. Re-observing the same token updates the entry
//     rather than increasing the count.
//
// RISK AUTHORITY:
//   isHighRisk is obtained exclusively through W.shield.isHighRisk().
//   This module never duplicates the Shield threshold. This
//   preserves the single-authority contract established by the P0
//   security work.
//
// NEVER THROWS:
//   Every public function returns null on guard failure. A malformed
//   assessment, a missing Shield predicate, or a storage error all
//   degrade safely. A failure never breaks the caller.
// ===============================================================

window.W = window.W || {};

W.ownerAssociations = (() => {
  const METHODOLOGY_VERSION = "owner-associations-v1";

  // sessionMap: outer key is `${chain}:${ownerAddress}`. Value shape:
  //   {
  //     chain, ownerAddress,
  //     firstObservedAt, lastObservedAt,
  //     tokens: { [tokenAddress]: { tokenAddress, symbol, observedAt,
  //                                riskScore, isHighRisk, source } }
  //   }
  // The `tokens` map is the source of deduplication. Re-observing the
  // same token replaces its entry rather than adding a new one.
  let sessionMap = {};

  function normalizeEvmAddress(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.toLowerCase();
  }

  function keyFor(chainKey, address) {
    return chainKey + ":" + address;
  }

  // Read the Shield authority. Any failure — predicate missing,
  // predicate throwing, malformed assessment — resolves to false.
  // Never duplicates the threshold; the Shield module is the single
  // authority for the high-risk decision.
  function readShieldHighRisk(assessment) {
    try {
      if (W.shield && typeof W.shield.isHighRisk === "function") {
        return W.shield.isHighRisk(assessment) === true;
      }
    } catch (e) {
      // Swallow — the observation continues, isHighRisk stays false.
    }
    return false;
  }

  function observe(assessment, chainKey, tokenAddress, symbol) {
    try {
      if (!assessment || typeof assessment !== "object") return null;
      if (assessment.error || assessment.noData || assessment.unsupported) {
        return null;
      }
      if (typeof chainKey !== "string" || !chainKey.trim()) return null;

      const tokenAddr = normalizeEvmAddress(tokenAddress);
      if (!tokenAddr) return null;

      const owner = assessment.owner;
      if (!owner || typeof owner !== "object") return null;

      const ownerAddr = normalizeEvmAddress(owner.address);
      if (!ownerAddr) return null;

      const chain = chainKey.trim();
      const now = Date.now();

      const associationKey = keyFor(chain, ownerAddr);
      let association = sessionMap[associationKey];
      if (!association) {
        association = {
          chain,
          ownerAddress: ownerAddr,
          firstObservedAt: now,
          lastObservedAt: now,
          tokens: {},
        };
        sessionMap[associationKey] = association;
      }

      // Latest observation wins for the token entry. Re-observing the
      // same token updates observedAt and riskScore, but does not
      // increase the token count.
      association.tokens[tokenAddr] = {
        tokenAddress: tokenAddr,
        symbol:
          typeof symbol === "string" && symbol.trim() ? symbol.trim() : null,
        observedAt: now,
        riskScore: Number.isFinite(assessment.riskScore)
          ? assessment.riskScore
          : null,
        isHighRisk: readShieldHighRisk(assessment),
        source:
          typeof owner.source === "string" && owner.source.trim()
            ? owner.source.trim()
            : "goplus-evm",
      };
      association.lastObservedAt = now;

      return buildObservation(association);
    } catch (e) {
      console.warn("[OwnerAssociations] observe failed:", e && e.message);
      return null;
    }
  }

  function buildObservation(association) {
    // Clone each token entry so the caller cannot mutate session
    // state by holding onto the returned object.
    const tokens = Object.values(association.tokens)
      .map((t) => ({ ...t }))
      .sort((a, b) => a.observedAt - b.observedAt);

    return {
      chain: association.chain,
      ownerAddress: association.ownerAddress,
      observedAt: association.lastObservedAt,
      seenOnTokens: tokens,
      methodologyVersion: METHODOLOGY_VERSION,
    };
  }

  function summarise(observation) {
    try {
      if (!observation || typeof observation !== "object") return null;

      const tokens = Array.isArray(observation.seenOnTokens)
        ? observation.seenOnTokens
        : null;
      if (!tokens || !tokens.length) return null;

      if (tokens.length === 1) {
        return "Owner address: first seen this session";
      }

      const highRiskCount = tokens.filter(
        (t) => t && t.isHighRisk === true,
      ).length;

      // Report the count, never a rate. "1 of 3 flagged high-risk" is a
      // fact. A percentage would imply a probability the data does not
      // support.
      //
      // The high-risk clause is omitted when the count is zero — "0
      // flagged high-risk" would read too close to "safe", which this
      // module must never imply.
      if (highRiskCount > 0) {
        return (
          "Owner address seen on " +
          tokens.length +
          " tokens — " +
          highRiskCount +
          " flagged high-risk"
        );
      }
      return "Owner address seen on " + tokens.length + " tokens";
    } catch (e) {
      console.warn("[OwnerAssociations] summarise failed:", e && e.message);
      return null;
    }
  }

  function reset() {
    sessionMap = {};
  }

  return {
    observe,
    summarise,
    reset,
    METHODOLOGY_VERSION,
    // Exposed for tests only.
    _internal: { keyFor, normalizeEvmAddress },
  };
})();

console.log("[OwnerAssociations] Module loaded.");
