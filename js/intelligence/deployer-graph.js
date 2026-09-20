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
//   This module uses `creator.address` only as the query hint to
//   Bitquery. The Bitquery response establishes the deployer of
//   record for the returned contracts.
//
// SCOPE — Step 4:
//   observe() is now implemented. It reads the GoPlus creator
//   address as the query hint, calls the Worker's
//   /bitquery/deployer route, parses the response, applies the
//   qualification step, and records the resulting profile.
//
// QUALIFICATION — Step 4 policy:
//   The Bitquery response identifies contracts the address created.
//   It does NOT confirm that each contract is a fungible token.
//
//   Only contracts we can independently confirm as tokens enter
//   tokens[]. Currently the only such contract is the token Weaver
//   is analyzing (GoPlus recognized it as a token — that is why we
//   have a creator address to query with).
//
//   All other contracts are counted in filteredContractCount.
//   They are visible as a number, not as individual tokens, and
//   they are NOT counted as qualified in summarise().
//
//   Refining this — e.g. a GoPlus follow-up per contract, or a
//   richer Bitquery query with token metadata — is a future step.
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

  // Worker URL. Empty by default; set via _internal.setWorkerBase().
  // When blank, observe() returns null without a network call.
  let workerBase = "";

  // In-memory mirror of the index. Populated on first read after
  // page load or reset. Kept in sync by writeIndex(). Cleared by
  // reset().
  let cachedIndex = null;
  const warned = new Set();

  function warnOnce(tag, message) {
    if (warned.has(tag)) return;
    warned.add(tag);
    console.warn("[DeployerGraph]", message);
  }

  function setWorkerBase(url) {
    workerBase = typeof url === "string" ? url.trim().replace(/\/+$/, "") : "";
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
  // Write entry point. observe() calls this after a successful
  // Bitquery fetch. Tests use it to prime the cache. Returns true
  // on success, false on any failure. Never throws.
  function record(chainKey, deployerAddress, profile) {
    try {
      const chain = normalizeChain(chainKey);
      const address = normalizeAddress(deployerAddress);
      const key = keyFor(chain, address);
      if (!key) return false;
      if (!profile || typeof profile !== "object") return false;
      if (!Array.isArray(profile.tokens)) return false;

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

      const existing = readAllEntries().filter((e) => e.key !== key);
      const combined = [...existing, { key, entry }];
      const kept = pruneAndEvict(combined, MAX_PROFILES, Date.now());

      const keptKeys = new Set(kept.map((e) => e.key));
      const toDelete = combined
        .filter((e) => !keptKeys.has(e.key))
        .map((e) => e.key);
      for (const k of toDelete) {
        deleteEntry(k);
      }

      try {
        W.store?.set?.(key, entry);
      } catch (e) {
        warnOnce("record-write", "Failed to write entry: " + (e && e.message));
        return false;
      }

      writeIndex(kept.map((e) => e.key));
      return true;
    } catch (e) {
      warnOnce("record", "record failed: " + (e && e.message));
      return false;
    }
  }

  // ── Public: get ──────────────────────────────────────────
  // Read-only lookup. Never issues a network request. Never
  // mutates session state. Expired entries are skipped without
  // being deleted; the next record() performs TTL cleanup.
  //
  // This is a SEMANTIC lookup: "find the profile relevant to this
  // token". A profile with no matching token in its tokens array
  // is not returned, even if it exists in the cache. Use the
  // internal readEntry(keyFor(...)) to fetch a profile by deployer
  // identity.
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
        return (
          "Deployer previously created " +
          n +
          " " +
          noun +
          " — " +
          highRiskCount +
          " flagged high-risk"
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

  // ── Bitquery response parsing ────────────────────────────

  function extractCalls(parsed) {
    if (!parsed || typeof parsed !== "object") return null;
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      // A GraphQL response with errors is not a valid data source.
      return null;
    }
    const data = parsed.data;
    if (!data || typeof data !== "object") return null;
    const evm = data.EVM;
    if (!evm || typeof evm !== "object") return null;
    const calls = evm.Calls;
    if (!Array.isArray(calls)) return null;
    return calls;
  }

  function extractContractAddress(call) {
    if (!call || typeof call !== "object") return null;
    const c = call.Call;
    if (!c || typeof c !== "object") return null;
    return normalizeAddress(c.To);
  }

  function extractTxHash(call) {
    if (!call || typeof call !== "object") return null;
    const tx = call.Transaction;
    if (!tx || typeof tx !== "object") return null;
    return typeof tx.Hash === "string" ? tx.Hash : null;
  }

  function extractDeployedAt(call) {
    if (!call || typeof call !== "object") return null;
    const b = call.Block;
    if (!b || typeof b !== "object") return null;
    const t = b.Time;
    if (typeof t !== "string") return null;
    const parsed = Date.parse(t);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function buildTokenFromCall(call, contractAddr, deployerAddress) {
    return {
      tokenAddress: contractAddr,
      deployedAt: extractDeployedAt(call),
      deploymentTxHash: extractTxHash(call),
      deploymentEvidence: {
        source: "bitquery",
        method: "evm-call-create",
        deployerAddress: deployerAddress,
        callType: "direct",
      },
      riskScore: null,
      shieldObservedAt: null,
      shieldSource: null,
    };
  }

  // ── Worker fetch ─────────────────────────────────────────

  async function fetchDeployerProfile(chain, deployerAddress) {
    if (!workerBase) {
      warnOnce(
        "worker-base",
        "Worker proxy base is not configured; deployer fetch skipped",
      );
      return null;
    }

    let response;
    try {
      response = await fetch(workerBase + "/bitquery/deployer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: chain,
          deployerAddress: deployerAddress,
        }),
      });
    } catch (e) {
      warnOnce("fetch-failed", "Deployer fetch failed: " + (e && e.message));
      return null;
    }

    if (!response || !response.ok) {
      const status = response ? response.status : "unknown";
      warnOnce("fetch-status", "Deployer fetch returned HTTP " + status);
      return null;
    }

    try {
      return await response.json();
    } catch (e) {
      warnOnce(
        "fetch-parse",
        "Deployer response was not JSON: " + (e && e.message),
      );
      return null;
    }
  }

  // ── Public: observe ──────────────────────────────────────
  // Async orchestrator. Reads creator.address from the assessment
  // as the Bitquery query hint, fetches the deployer profile on
  // cache miss, applies the qualification step, and records.
  // Returns the profile or null. Never throws.
  //
  // On success, the returned profile is read directly by deployer
  // key — not by token lookup. A profile that qualifies zero
  // tokens (because the current token was not among the Bitquery
  // creation calls) is still a valid recorded result and is
  // returned. get(chain, tokenAddress) remains a token-keyed
  // semantic lookup for render consumers and will not surface
  // such a profile.
  async function observe(assessment, chainKey, tokenAddress, symbol) {
    try {
      if (!assessment || typeof assessment !== "object") return null;
      if (assessment.error || assessment.noData || assessment.unsupported) {
        return null;
      }

      const chain = normalizeChain(chainKey);
      const tokenAddr = normalizeAddress(tokenAddress);
      if (!chain || !tokenAddr) return null;

      const creator = assessment.creator;
      if (!creator || typeof creator !== "object") return null;
      const creatorAddress = normalizeAddress(creator.address);
      if (!creatorAddress) return null;

      // Cache check — return the cached profile without a network
      // call when one exists.
      const cached = get(chain, tokenAddr);
      if (cached) return cached;

      const parsed = await fetchDeployerProfile(chain, creatorAddress);
      if (!parsed) return null;

      const calls = extractCalls(parsed);
      if (calls === null) return null;

      // Qualification: only the current token is verified as a
      // token (GoPlus recognized it — that is why we have a
      // creator address to query with). All other contracts are
      // counted in filteredContractCount.
      const tokens = [];
      let filteredContractCount = 0;

      for (const call of calls) {
        const contractAddr = extractContractAddress(call);
        if (!contractAddr) continue;

        if (contractAddr === tokenAddr) {
          tokens.push(buildTokenFromCall(call, contractAddr, creatorAddress));
        } else {
          filteredContractCount++;
        }
      }

      const profile = {
        tokens,
        filteredContractCount,
        creatorMetadata: {
          goplusCreatorAddress: creatorAddress,
          // We do not have a per-token Bitquery deployer lookup, so
          // we cannot compare Bitquery's per-token deployer against
          // GoPlus's creator_address. The value is honest: the
          // comparison was not performed.
          agreement: "unavailable",
        },
        source: "bitquery",
        observedAt: Date.now(),
      };

      if (!record(chain, creatorAddress, profile)) {
        return null;
      }

      // Return the stored profile by deployer key, not by token
      // lookup. get() is token-keyed and returns null when the
      // profile has no matching token — which happens when the
      // current token is not among the Bitquery creation calls.
      // The profile is still recorded and should be returned.
      const storedKey = keyFor(chain, creatorAddress);
      if (!storedKey) return null;
      const stored = readEntry(storedKey);
      return stored ? cloneValue(stored) : null;
    } catch (e) {
      warnOnce("observe", "observe failed: " + (e && e.message));
      return null;
    }
  }

  return {
    observe,
    record,
    get,
    summarise,
    reset,
    METHODOLOGY_VERSION,
    // Exposed for tests and diagnostics only.
    _internal: {
      keyFor,
      normalizeAddress,
      normalizeChain,
      isExpired,
      pruneAndEvict,
      extractCalls,
      extractContractAddress,
      extractTxHash,
      extractDeployedAt,
      setWorkerBase,
      getWorkerBase: () => workerBase,
      INDEX_KEY,
      KEY_PREFIX,
      RETENTION_MS,
      MAX_PROFILES,
    },
  };
})();

console.log("[DeployerGraph] Module loaded.");
