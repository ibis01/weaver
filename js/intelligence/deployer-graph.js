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
//                         evidence
//
//   This module uses `creator.address` only as the query hint to
//   the upstream provider. The response establishes the deployer
//   of record for the returned contracts.
//
// SCOPE — Step 5 (post-Bitquery migration):
//   observe() reads the GoPlus creator address as the query hint,
//   calls the appropriate Worker route, parses the response,
//   applies the qualification step, and records the resulting
//   profile.
//
// CHAIN COVERAGE:
//   Etherscan (EVM): Ethereum, BSC, Base, Arbitrum, Polygon,
//   Optimism, Avalanche. Uses account.txlist and filters for
//   non-empty contractAddress.
//
//   Helius Parsed Events (Solana): pages through the deployer's
//   transaction history, filters for Pump.fun create/create_v2
//   instructions, extracts the mint address from each. Pump.fun
//   covers the majority of Solana memecoins the gem scanner
//   surfaces; other launchpads can be added to the Worker's
//   program-ID set without changing the client.
//
//   Solana addresses are base58 and case-sensitive. normalizeAddress
//   preserves case for Solana and lowercases for EVM. Cache keys
//   and comparisons follow the same rule.
//
// CREATION-EVIDENCE CONTRACT:
//   Etherscan: account.txlist returns every transaction the
//   address ever sent; contract creations are identified by a
//   non-empty contractAddress field. Etherscan does not
//   distinguish top-level from factory-internal deployments in
//   this response shape; both surface as a creation by the
//   queried address.
//
//   Helius Parsed Events: returns decoded instructions. We filter
//   for Pump.fun create/create_v2 and extract the mint from each
//   decoded account list. Helius returns slot, not wall-clock
//   time; deployedAt is null and slot is preserved.
//
// QUALIFICATION — Step 4 policy:
//   The provider response identifies contracts the address
//   created. It does NOT confirm that each contract is a
//   fungible token.
//
//   Only contracts we can independently confirm as tokens enter
//   tokens[]. Currently the only such contract is the token
//   Weaver is analyzing (GoPlus recognized it as a token — that
//   is why we have a creator address to query with).
//
//   All other contracts are counted in filteredContractCount.
//   They are visible as a number, not as individual tokens, and
//   they are NOT counted as qualified in summarise().
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
// TERMINAL ERROR HANDLING:
//   Both providers signal rate limiting with HTTP 429. The module
//   sets a session-scoped `terminalError` flag on the first 429
//   and short-circuits further fetches for the tab's lifetime.
//   Retrying a 429 immediately just trips the same window again.
//   Cleared by reset() — production callers should not invoke
//   reset() while a session is live; tests use it to re-arm the
//   fetch path.
//
// NEVER THROWS:
//   Every public function returns null or false on failure. A
//   malformed profile, a missing W.store, or a corrupt cache
//   degrades safely.
// ===============================================================

window.W = window.W || {};

W.deployerGraph = (() => {
  const METHODOLOGY_VERSION = "deployer-graph-v4";
  const KEY_PREFIX = "deployer:";
  const INDEX_KEY = "deployer:__index__";
  const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
  const MAX_PROFILES = 100;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  let workerBase = "https://weaver-proxy.ibis01-weaver.workers.dev";

  let cachedIndex = null;
  const warned = new Set();

  let terminalError = false;

  function warnOnce(tag, message) {
    if (warned.has(tag)) return;
    warned.add(tag);
    console.warn("[DeployerGraph]", message);
  }

  function setWorkerBase(url) {
    workerBase = typeof url === "string" ? url.trim().replace(/\/+$/, "") : "";
  }

  function normalizeAddress(valueOrChain, maybeValue) {
    const hasChain = typeof maybeValue !== "undefined";
    const chain = hasChain ? valueOrChain : null;
    const value = hasChain ? maybeValue : valueOrChain;

    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (chain === "solana") return trimmed;
    return trimmed.toLowerCase();
  }

  function normalizeChain(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  function isNonZeroAddress(value) {
    if (typeof value !== "string") return false;
    const norm = value.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(norm)) return false;
    return norm !== ZERO_ADDRESS;
  }

  function keyFor(chainKey, deployerAddress) {
    const chain = normalizeChain(chainKey);
    const address = normalizeAddress(chain, deployerAddress);
    if (!chain || !address) return null;
    return KEY_PREFIX + chain + ":" + address;
  }

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

  function isValidToken(token) {
    if (!token || typeof token !== "object") return false;
    if (typeof token.tokenAddress !== "string" || !token.tokenAddress.trim()) {
      return false;
    }
    return true;
  }

  function record(chainKey, deployerAddress, profile) {
    try {
      const chain = normalizeChain(chainKey);
      const address = normalizeAddress(chain, deployerAddress);
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
        tokenAddress: normalizeAddress(chain, token.tokenAddress),
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
            : "unknown",
        filteredContractCount: Number.isFinite(profile.filteredContractCount)
          ? Math.max(0, Math.floor(profile.filteredContractCount))
          : 0,
        truncated: profile.truncated === true,
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

  function get(chainKey, tokenAddress) {
    try {
      const chain = normalizeChain(chainKey);
      const tokenAddr = normalizeAddress(chain, tokenAddress);
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
        } catch (_) {}
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
    terminalError = false;
    warned.clear();
  }

  async function fetchDeployerProfile(chain, deployerAddress) {
    if (!workerBase) {
      warnOnce(
        "worker-base",
        "Worker proxy base is not configured; deployer fetch skipped",
      );
      return null;
    }

    if (terminalError) return null;

    const endpoint =
      chain === "solana" ? "/helius/deployer" : "/etherscan/deployer";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(workerBase + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: chain,
          deployerAddress: deployerAddress,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      warnOnce("fetch-failed", "Deployer fetch failed: " + (e && e.message));
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (response && response.status === 429) {
      terminalError = true;
      warnOnce(
        "rate-limited",
        "Deployer provider rate limit reached — deployer enrichment disabled for this session",
      );
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

  async function observe(assessment, chainKey, tokenAddress, symbol) {
    try {
      if (!assessment || typeof assessment !== "object") return null;
      if (assessment.error || assessment.noData || assessment.unsupported) {
        return null;
      }

      const chain = normalizeChain(chainKey);
      const tokenAddr = normalizeAddress(chain, tokenAddress);
      if (!chain || !tokenAddr) return null;

      const creator = assessment.creator;
      if (!creator || typeof creator !== "object") return null;
      const creatorAddress = normalizeAddress(chain, creator.address);
      if (!creatorAddress) return null;

      const cached = get(chain, tokenAddr);
      if (cached) return cached;

      const parsed = await fetchDeployerProfile(chain, creatorAddress);
      if (!parsed) return null;

      if (!Array.isArray(parsed.contracts)) return null;

      const isSolana = chain === "solana";
      const evidenceMethod = isSolana
        ? "solana-parsed-events-pumpfun-create"
        : "evm-account-txlist";
      const evidenceSource = isSolana ? "helius" : "etherscan";
      const profileSource =
        typeof parsed.source === "string" ? parsed.source : evidenceSource;

      const tokens = [];
      let filteredContractCount = 0;

      for (const contract of parsed.contracts) {
        if (!contract || typeof contract !== "object") continue;
        const contractAddress = normalizeAddress(chain, contract.address);
        if (!contractAddress) continue;

        if (contractAddress === tokenAddr) {
          tokens.push({
            tokenAddress: contractAddress,
            deployedAt: Number.isFinite(contract.deployedAt)
              ? contract.deployedAt
              : null,
            deploymentTxHash:
              typeof contract.txHash === "string" ? contract.txHash : null,
            deploymentEvidence: {
              source: evidenceSource,
              method: evidenceMethod,
              deployerAddress: creatorAddress,
              deployedAddress: contractAddress,
              blockNumber: Number.isFinite(contract.blockNumber)
                ? contract.blockNumber
                : null,
              slot: Number.isFinite(contract.slot) ? contract.slot : null,
            },
            riskScore: null,
            shieldObservedAt: null,
            shieldSource: null,
          });
        } else {
          filteredContractCount++;
        }
      }

      const profile = {
        tokens,
        filteredContractCount,
        truncated: parsed.truncated === true,
        creatorMetadata: {
          goplusCreatorAddress: creatorAddress,
          agreement: "unavailable",
        },
        source: profileSource,
        observedAt: Date.now(),
      };

      if (!record(chain, creatorAddress, profile)) {
        return null;
      }

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
    _internal: {
      keyFor,
      normalizeAddress,
      normalizeChain,
      isNonZeroAddress,
      isExpired,
      pruneAndEvict,
      setWorkerBase,
      getWorkerBase: () => workerBase,
      isTerminalError: () => terminalError,
      INDEX_KEY,
      KEY_PREFIX,
      RETENTION_MS,
      MAX_PROFILES,
      ZERO_ADDRESS,
    },
  };
})();

console.log("[DeployerGraph] Module loaded.");
