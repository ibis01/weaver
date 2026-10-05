
W.adapters.securityFromGoPlus = function (raw) {
  if (!raw) return null;

  // Correct mixed-lock semantics: locked only when EVERY material
  // position is locked. Any unlocked holder downgrades to partial.
  const holders = Array.isArray(raw.lp_holders) ? raw.lp_holders : [];
  let lpLockStatus = "unknown";
  if (holders.length === 0) {
    lpLockStatus = "unavailable";
  } else if (holders.every((h) => h.is_locked === 1 || h.is_locked === "1")) {
    lpLockStatus = "provider-reported"; // provider says locked; not verified on-chain
  } else if (holders.some((h) => h.is_locked === 1 || h.is_locked === "1")) {
    lpLockStatus = "partially-locked"; // ← the P0 fix
  } else if (holders.every((h) => h.is_locked === 0 || h.is_locked === "0")) {
    lpLockStatus = "unlocked";
  } else {
    lpLockStatus = "conflicting"; // mixed known/unknown
  }

  return W.memeContracts.parseContract("SecurityAssessment", {
    observedAt: Date.now(),
    verdict: raw.is_honeypot === "1" ? "conflicting" : "provider-reported-safe",
    honeypot:
      raw.is_honeypot === "1" ? true : raw.is_honeypot === "0" ? false : null,
    canSell:
      raw.cannot_sell_all === "1"
        ? false
        : raw.cannot_sell_all === "0"
          ? true
          : null,
    mintAuthorityActive: boolOrNull(raw.is_mintable),
    freezeAuthorityActive: boolOrNull(raw.can_freeze),
    ownerCanBlacklist: boolOrNull(raw.is_blacklisted),
    taxChangeRisk: raw.sell_tax ? "unknown" : null,
    liquidityRemovable: boolOrNull(raw.lp_holders?.[0]?.is_locked),
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
    freshness: raw.checkedAt || null,
    provenance: {
      source: "goplus",
      observedAt: raw.checkedAt || null,
      fetchedAt: Date.now(),
      methodologyVersion: "meme-contracts-v1",
      completeness: null,
    },
  });
};

function boolOrNull(v) {
  if (v === "1" || v === true || v === 1) return true;
  if (v === "0" || v === false || v === 0) return false;
  return null;
}
