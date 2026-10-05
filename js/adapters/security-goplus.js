// js/adapters/security-goplus.js
//
// STATUS: NOT YET WIRED.
//   - Not listed in concat.js — this file is not in dist/bundle.js.
//   - No caller in js/features/gems.js or elsewhere yet.
//
// Converts a GoPlus token-security response into a SecurityAssessment.
// Returns null on malformed input; the engine treats null as unknown.
window.W = window.W || {};
W.adapters = W.adapters || {};

W.adapters.securityFromGoPlus = function (raw) {
  if (!raw || typeof raw !== "object") return null;

  const boolOrNull = (v) => {
    if (v === true || v === 1 || v === "1") return true;
    if (v === false || v === 0 || v === "0") return false;
    return null;
  };

  // ── LP lock classification ─────────────────────────────
  // Conservative:
  //   all locked      → provider-reported
  //   all unlocked    → unlocked
  //   mixed           → partially-locked
  //   any unknown     → conflicting
  //   no holders      → unavailable
  // "provider-reported" deliberately does not claim on-chain
  // verification; that requires a future RPC/locker adapter.
  const holders = Array.isArray(raw.lp_holders) ? raw.lp_holders : [];
  let lpLockStatus = "unavailable";
  if (holders.length > 0) {
    const flags = holders.map((h) => boolOrNull(h.is_locked));
    if (flags.every((v) => v === true)) lpLockStatus = "provider-reported";
    else if (flags.every((v) => v === false)) lpLockStatus = "unlocked";
    else if (flags.some((v) => v === true) && flags.some((v) => v === false))
      lpLockStatus = "partially-locked";
    else lpLockStatus = "conflicting";
  }

  // ── liquidityRemovable ─────────────────────────────────
  // GoPlus does not expose a reliable per-position "removable" flag.
  // is_locked=1 means the LP is locked, which is evidence AGAINST
  // removability — the opposite of what a naive mapping would suggest.
  // Leave null (unknown) rather than guess. A future on-chain adapter
  // (reading the locker contract, LP token holder, and expiry) is the
  // only honest source for this field.
  const liquidityRemovable = null;

  // ── canSell ────────────────────────────────────────────
  // GoPlus exposes "cannot_sell_all" as a string flag.
  // Absent/malformed → null (unknown), not false.
  const cannotSell = boolOrNull(raw.cannot_sell_all);

  return W.memeContracts.parse("SecurityAssessment", {
    observedAt: Date.now(),

    verdict:
      raw.is_honeypot === "1"
        ? "conflicting"
        : holders.length > 0
          ? "provider-reported-safe"
          : "unknown",

    honeypot: boolOrNull(raw.is_honeypot),
    canSell: cannotSell === null ? null : !cannotSell,

    mintAuthorityActive: boolOrNull(raw.is_mintable),
    freezeAuthorityActive: boolOrNull(raw.can_freeze),
    ownerCanBlacklist: boolOrNull(raw.is_blacklisted),

    taxChangeRisk: null,
    liquidityRemovable,

    lpLockStatus,
    lpLockDetails: holders.length
      ? {
          verifiedVia: "provider",
          lockedPct: null,
          unlockAt: null,
        }
      : null,

    simulationStatus: "not-simulated",

    source: "goplus",
    freshness: null,

    provenance: {
      source: "goplus",
      // GoPlus does not reliably timestamp its responses.
      observedAt: null,
      fetchedAt: Date.now(),
      methodologyVersion: W.memeContracts.METHODOLOGY_VERSION,
      completeness: null,
    },
  });
};
