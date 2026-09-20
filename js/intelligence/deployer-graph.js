// ===============================================================
//         Weaver Deployer Graph
// ===============================================================
//
// Caches on-chain deployer profiles — one profile per deployer
// address, keyed by chain, listing the qualified tokens the
// deployer has created according to contract-creation evidence.
//
// DESIGN REFERENCE:
//   docs/deployer-graph-design.md
//
// TERMINOLOGY:
//   Three distinct values are not interchangeable:
//
//     owner.address       GoPlus owner_address (owner/admin authority)
//     creator.address     GoPlus creator_address (creator metadata)
//     deployerAddress     address established from on-chain creation
//                         evidence (Bitquery Call.Create Call.From)
//
//   This module only knows about `deployerAddress`. It does not
//   read GoPlus owner or creator metadata. The creator field is
//   preserved elsewhere for reconciliation; it is not the deployer
//   of record.
//
// SCOPE — Step 2:
//   - Cache schema and eviction only. No provider fetch.
//   - The `observe()` orchestrator (which will call a provider on
//     cache miss) is added in Step 4 once the CF Worker path and
//     the Bitquery query exist.
//   - `record()` is the write entry point. Step 4's provider
//     wiring calls it after a successful fetch. Tests use it to
//     prime the cache.
//   - `get()` is the only read path for render consumers. It never
//     issues a network request.
//
// CACHE:
//   - Per-origin client cache. Backed by W.store (localStorage
//     with a _memory fallback). Survives page reloads within TTL.
//   - TTL: 24 hours.
//   - Cap: 100 profiles.
//   - Eviction: expired entries first, then least-recently-observed.
//
// RISK AUTHORITY:
//   isHighRisk is NOT persisted on token observations. It is
//   derived at summarise time via W.shield.isHighRisk() so a
//   Shield methodology change does not leave stale booleans in
//   the cache.
//
// NEVER THROWS:
//   Every public function returns null or false on failure. A
//   malformed profile, a missing W.store, or a corrupt cache
//   degrades safely.
// ===============================================================

window.W = window.W || {};

W.deployerGraph = (() => {
  const METHODOLOGY_VERSION = "deployer-graph-v1";
  const KEY_PREFIX = "deployer:";
  const INDEX_KEY = "deployer:__index__";
  const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
  const MAX_PROFILES = 100;

  // In-memory mirror of the index. Populated on first read after
  // page load or reset. Kept in sync by writeIndex(). Cleared by
  // reset(). This avoids re-reading the index key from W.store on
  // every record() call during a batch of writes.
  let cachedIndex = null;
  const warned = new Set();

  function warnOnce(tag, message) {
    if (warned.has(tag)) return;
    warned.add(tag);
    console.warn("[DeployerGraph]", message);
  }

  // ── Normalization ────────────────────────────────────────

  function normalizeAddress(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.toLowerCase();
  }

  function normalizeChain(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  function keyFor(chainKey, deployerAddress) {
    const chain = normalizeChain(chainKey);
    const address = normalizeAddress(deployerAddress);
    if (!chain || !address) return null;
    return KEY_PREFIX + chain + ":" + address;
  }

  // ── Index management ─────────────────────────────────────

  function readIndex() {
    if (cachedIndex !== null) return cachedIndex;
    let raw;
    try {
      raw = W.store?.get?.(INDEX_KEY, []);
    } catch (e) {
      warnOnce("index-read", "Failed to read index: " + (e && e.message));
      cachedIndex = [];
      return cachedIndex;
    }
    cachedIndex = Array.isArray(raw)
      ? raw.filter((k) => typeof k === "string")
      : [];
    return cachedIndex;
  }

  function writeIndex(keys) {
    const next = Array.isArray(keys) ? keys.slice() : [];
    cachedIndex = next;
    try {
      W.store?.set?.(INDEX_KEY, next);
    } catch (e) {
      warnOnce("index-write", "Failed to write index: " + (e && e.message));
    }
  }

  function clearIndex() {
    cachedIndex = null;
    try {
      W.store?.delete?.(INDEX_KEY);
    } catch (e) {
      warnOnce("index-clear", "Failed to clear index: " + (e && e.message));
    }
  }

  // ── Cache reads ──────────────────────────────────────────

  function readEntry(key) {
    try {
      const entry = W.store?.get?.(key, null);
      if (!entry || typeof entry !== "object") return null;
      return entry;
    } catch (e) {
      warnOnce("entry-read", "Failed to read entry: " + (e && e.message));
      return null;
    }
  }

  function readAllEntries() {
    const index = readIndex();
    const out = [];
    for (const key of index) {
      const entry = readEntry(key);
      if (entry) out.push({ key, entry });
    }
    return out;
  }

  function deleteEntry(key) {
    try {
      W.store?.delete?.(key);
    } catch (e) {
      warnOnce("entry-delete", "Failed to delete entry: " + (e && e.message));
    }
  }

  // ── TTL and eviction ─────────────────────────────────────

  function isExpired(entry, now = Date.now()) {
    if (!entry || !Number.isFinite(entry.observedAt)) return true;
    return now - entry.observedAt > RETENTION_MS;
  }

  // Pure function over a list of { key, entry }. Returns the list
  // to keep after TTL pruning and LRU eviction. Testable in
  // isolation.
  function pruneAndEvict(entries, maxCount = MAX_PROFILES, now = Date.now()) {
    if (!Array.isArray(entries)) return [];
    const cutoff = now - RETENTION_MS;
    let kept = entries.filter(
      (e) =>
        e &&
        e.entry &&
        Number.isFinite(e.entry.observedAt) &&
        e.entry.observedAt >= cutoff,
    );
    if (kept.length > maxCount) {
      kept = kept
        .slice()
        .sort((a, b) => b.entry.observedAt - a.entry.observedAt)
        .slice(0, maxCount);
    }
    return kept;
  }

  // ── Clone helper ─────────────────────────────────────────

  function cloneValue(value) {
    if (value === null || value === undefined) return value;
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
    } catch (_) {}
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  // ── Token validation ─────────────────────────────────────

  function isValidToken(token) {
    if (!token || typeof token !== "object") return false;
    if (typeof token.tokenAddress !== "string" || !token.tokenAddress.trim()) {
      return false;
    }
    return true;
  }

  // ── Public: record ───────────────────────────────────────
  // Write entry point. The provider wiring in Step 4 calls this
  // after a successful Bitquery fetch. Tests use it to prime the
  // cache. Returns true on success, false on any failure. Never
  // throws.
  //
  // Profile shape accepted:
  //   {
  //     tokens: [...],              // required, array (may be empty)
  //     filteredContractCount: 0,   // optional
  //     creatorMetadata: {...},     // optional
  //     source: "bitquery",         // optional, defaults to "bitquery"
  //     observedAt: 1234567890,     // optional, defaults to now
  //   }
  //
  // The module adds chain, deployerAddress, and methodologyVersion.
  function record(chainKey, deployerAddress, profile) {
    try {
      const chain = normalizeChain(chainKey);
      const address = normalizeAddress(deployerAddress);
      const key = keyFor(chain, address);
      if (!key) return false;
      if (!profile || typeof profile !== "object") return false;
      if (!Array.isArray(profile.tokens)) return false;

      // Reject the record if any token is invalid. The provider
      // wiring must produce clean profiles; a malformed token
      // should fail loudly rather than silently disappearing.
      for (const token of profile.tokens) {
        if (!isValidToken(token)) {
          warnOnce(
            "invalid-token",
            "Rejected profile: token missing tokenAddress",
          );
          return false;
        }
      }

      const observedAt = Number.isFinite(profile.observedAt)
        ? profile.observedAt
        : Date.now();

      // Build the entry. Tokens are cloned and their addresses
      // normalized so later lookups can compare directly.
      const normalizedTokens = profile.tokens.map((token) => ({
        tokenAddress: normalizeAddress(token.tokenAddress),
        deployedAt: Number.isFinite(token.deployedAt) ? token.deployedAt : null,
        deploymentTxHash:
          typeof token.deploymentTxHash === "string"
            ? token.deploymentTxHash
            : null,
        deploymentEvidence:
          token.deploymentEvidence &&
          typeof token.deploymentEvidence === "object"
            ? cloneValue(token.deploymentEvidence)
            : null,
        riskScore: Number.isFinite(token.riskScore) ? token.riskScore : null,
        shieldObservedAt: Number.isFinite(token.shieldObservedAt)
          ? token.shieldObservedAt
          : null,
        shieldSource:
          typeof token.shieldSource === "string" ? token.shieldSource : null,
      }));

      const entry = {
        chain,
        deployerAddress: address,
        observedAt,
        methodologyVersion: METHODOLOGY_VERSION,
        source:
          typeof profile.source === "string" && profile.source.trim()
            ? profile.source.trim()
            : "bitquery",
        filteredContractCount: Number.isFinite(profile.filteredContractCount)
          ? Math.max(0, Math.floor(profile.filteredContractCount))
          : 0,
        creatorMetadata:
          profile.creatorMetadata && typeof profile.creatorMetadata === "object"
            ? cloneValue(profile.creatorMetadata)
            : null,
        tokens: normalizedTokens,
      };

      // Read the current cache, add the new entry, prune and evict.
      const existing = readAllEntries().filter((e) => e.key !== key);
      const combined = [...existing, { key, entry }];
      const kept = pruneAndEvict(combined, MAX_PROFILES, Date.now());

      // Determine which keys to delete.
      const keptKeys = new Set(kept.map((e) => e.key));
      const toDelete = combined
        .filter((e) => !keptKeys.has(e.key))
        .map((e) => e.key);
      for (const k of toDelete) {
        deleteEntry(k);
      }

      // Write the new entry.
      try {
        W.store?.set?.(key, entry);
      } catch (e) {
        warnOnce("record-write", "Failed to write entry: " + (e && e.message));
        return false;
      }

      // Update the index to reflect the kept keys.
      writeIndex(kept.map((e) => e.key));

      return true;
    } catch (e) {
      warnOnce("record", "record failed: " + (e && e.message));
      return false;
    }
  }

  // ── Public: get ──────────────────────────────────────────
  // Read-only lookup. Walks the cache to find the profile whose
  // tokens include the given tokenAddress. Never issues a network
  // request. Never mutates session state.
  //
  // Expired entries are skipped without being deleted. The next
  // record() call performs TTL cleanup.
  function get(chainKey, tokenAddress) {
    try {
      const chain = normalizeChain(chainKey);
      const tokenAddr = normalizeAddress(tokenAddress);
      if (!chain || !tokenAddr) return null;

      const entries = readAllEntries();
      const now = Date.now();
      for (const { entry } of entries) {
        if (!entry || entry.chain !== chain) continue;
        if (isExpired(entry, now)) continue;
        if (!Array.isArray(entry.tokens)) continue;
        const match = entry.tokens.some(
          (t) => t && t.tokenAddress === tokenAddr,
        );
        if (match) {
          return cloneValue(entry);
        }
      }
      return null;
    } catch (e) {
      warnOnce("get", "get failed: " + (e && e.message));
      return null;
    }
  }

  // ── Public: summarise ────────────────────────────────────
  // Reports counts, never rates.
  //
  //   "Deployer previously created 3 qualified tokens — 1 flagged high-risk"
  //
  // The high-risk clause is omitted when the count is zero, because
  // "0 flagged high-risk" reads too close to "safe". Tokens whose
  // riskScore is null (never Shield-enriched) are not counted as
  // high-risk — unknown is not high risk and unknown is not safe.
  //
  // The predicate is called at summarise time via
  // W.shield.isHighRisk() so the count reflects the current Shield
  // threshold. If the predicate is unavailable, the count is zero.
  function summarise(observation) {
    try {
      if (!observation || typeof observation !== "object") return null;
      const tokens = Array.isArray(observation.tokens)
        ? observation.tokens
        : null;
      if (!tokens || !tokens.length) return null;

      let highRiskCount = 0;
      for (const token of tokens) {
        if (!token || !Number.isFinite(token.riskScore)) continue;
        try {
          if (
            W.shield &&
            typeof W.shield.isHighRisk === "function" &&
            W.shield.isHighRisk({ riskScore: token.riskScore }) === true
          ) {
            highRiskCount++;
          }
        } catch (_) {
          // Predicate failure: token is not counted as high-risk.
        }
      }

      const n = tokens.length;
      const noun = n === 1 ? "qualified token" : "qualified tokens";

      if (highRiskCount > 0) {
        const flag = highRiskCount === 1 ? "flagged" : "flagged";
        return (
          "Deployer previously created " +
          n +
          " " +
          noun +
          " — " +
          highRiskCount +
          " " +
          flag +
          " high-risk"
        );
      }
      return "Deployer previously created " + n + " " + noun;
    } catch (e) {
      warnOnce("summarise", "summarise failed: " + (e && e.message));
      return null;
    }
  }

  // ── Public: reset ────────────────────────────────────────
  // Test hook. Clears all cached profiles and the index.
  function reset() {
    try {
      const entries = readAllEntries();
      for (const { key } of entries) {
        deleteEntry(key);
      }
      clearIndex();
    } catch (e) {
      warnOnce("reset", "reset failed: " + (e && e.message));
    }
  }

  return {
    record,
    get,
    summarise,
    reset,
    METHODOLOGY_VERSION,
    // Exposed for tests only.
    _internal: {
      keyFor,
      normalizeAddress,
      normalizeChain,
      isExpired,
      pruneAndEvict,
      INDEX_KEY,
      KEY_PREFIX,
      RETENTION_MS,
      MAX_PROFILES,
    },
  };
})();

console.log("[DeployerGraph] Module loaded.");
