// ===============================================================
//         Weaver Observations — time-series storage
// ===============================================================
//
// Persists market-structure observations keyed by chain+address,
// prunes them to a bounded retention window, and computes deltas
// against the past for a set of standard intervals (5m, 15m, 1h).
//
// DESIGN REFERENCE:
//   docs/trajectory-design.md
//
// STORAGE:
//   Uses W.store for persistence. Keys are:
//     obs:<chain>:<normalizedAddress>
//   Normalization matches shieldCacheKey: EVM lowercased, Solana
//   case-preserved.
//
// RETENTION:
//   Two constraints applied on every read and write:
//     - Time window: 2 hours
//     - Count cap: 30 observations per token
//
// DELTA COMPUTATION:
//   Half-interval tolerance. A 5-minute delta is computed only
//   against an observation whose observedAt falls within 2.5 minutes
//   of the target time (now - 5m). Outside tolerance, the delta is
//   null, never zero.
//
// FAILURE ISOLATION:
//   This module never throws. Storage errors, corrupt data, quota
//   exhaustion, and missing history all degrade to safe defaults
//   (empty arrays, null deltas, false return values). Errors are
//   logged once per session.
//
// NOT A RISK CLASSIFIER:
//   Direction labels ("rising" / "falling") are descriptors, not
//   judgments. W.shield.isHighRisk() remains the single authority
//   for risk classification.
// ===============================================================

window.W = window.W || {};

W.observations = (() => {
  const KEY_PREFIX = "obs:";
  const RETENTION_MS = 2 * 60 * 60 * 1000; // 2 hours
  const MAX_OBSERVATIONS = 30;
  const METHODOLOGY_VERSION = "trajectory-v1";
  const DIRECTION_THRESHOLD_PCT = 2;

  const INTERVALS = {
    change5m: 5 * 60 * 1000,
    change15m: 15 * 60 * 1000,
    change1h: 60 * 60 * 1000,
  };

  // Track warnings we've already emitted so a repeated storage error
  // does not spam the console on every scan. Matches the
  // warnedUnevaluable pattern in track-record.js.
  const warned = new Set();
  function warnOnce(tag, message) {
    if (warned.has(tag)) return;
    warned.add(tag);
    console.warn("[Observations]", message);
  }

  function key(chainKey, address) {
    if (typeof chainKey !== "string" || !chainKey) return null;
    if (typeof address !== "string" || !address.trim()) return null;
    const normalized = chainKey === "solana" ? address : address.toLowerCase();
    return KEY_PREFIX + chainKey + ":" + normalized;
  }

  function deepClone(value) {
    if (value === null || value === undefined) return value;
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
    } catch (_) {}
    return JSON.parse(JSON.stringify(value));
  }

  function prune(list, now) {
    const cutoff = now - RETENTION_MS;
    let pruned = list.filter(
      (o) =>
        o &&
        typeof o === "object" &&
        Number.isFinite(o.observedAt) &&
        o.observedAt >= cutoff,
    );
    pruned.sort((a, b) => a.observedAt - b.observedAt);
    if (pruned.length > MAX_OBSERVATIONS) {
      pruned = pruned.slice(-MAX_OBSERVATIONS);
    }
    return pruned;
  }

  function history(chainKey, address) {
    const k = key(chainKey, address);
    if (!k) return [];
    let raw;
    try {
      raw = W.store?.get?.(k, []);
    } catch (e) {
      warnOnce("history-read", "Failed to read history: " + (e && e.message));
      return [];
    }
    if (!Array.isArray(raw)) return [];
    return prune(raw, Date.now());
  }

  function record(chainKey, address, observation) {
    const k = key(chainKey, address);
    if (!k) return false;
    if (!observation || typeof observation !== "object") return false;
    if (!Number.isFinite(observation.observedAt)) return false;

    const now = Date.now();
    const observedAt =
      observation.observedAt > now ? now : observation.observedAt;

    try {
      const existing = history(chainKey, address);
      // Idempotent: an observation with the same observedAt is not
      // duplicated. This matters when a rescan produces identical
      // timestamps — the history should not grow without bound.
      if (existing.some((o) => o.observedAt === observedAt)) {
        return true;
      }
      const normalized = deepClone({ ...observation, observedAt });
      const next = prune([...existing, normalized], now);
      W.store?.set?.(k, next);
      return true;
    } catch (e) {
      warnOnce(
        "record-write",
        "Failed to record observation: " + (e && e.message),
      );
      return false;
    }
  }

  function clear(chainKey, address) {
    const k = key(chainKey, address);
    if (!k) return false;
    try {
      W.store?.delete?.(k);
      return true;
    } catch (e) {
      warnOnce("clear", "Failed to clear history: " + (e && e.message));
      return false;
    }
  }

  // ── Delta computation ─────────────────────────────────────

  function findClosest(observations, targetTime, toleranceMs) {
    if (!Array.isArray(observations) || !observations.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (const o of observations) {
      if (!o || !Number.isFinite(o.observedAt)) continue;
      const dist = Math.abs(o.observedAt - targetTime);
      if (dist < bestDist) {
        bestDist = dist;
        best = o;
      }
    }
    if (bestDist > toleranceMs) return null;
    return best;
  }

  function deltaFor(current, past) {
    if (!Number.isFinite(current) || !Number.isFinite(past)) {
      return { absolute: null, percent: null };
    }
    const absolute = current - past;
    let percent = null;
    if (past > 0) {
      percent = (absolute / past) * 100;
    } else if (past === 0 && current === 0) {
      percent = 0;
    }
    return { absolute, percent };
  }

  function directionFor(percent) {
    if (!Number.isFinite(percent)) return "unknown";
    if (Math.abs(percent) < DIRECTION_THRESHOLD_PCT) return "stable";
    return percent > 0 ? "rising" : "falling";
  }

  function metricDelta(current, pastObservations, now, extract) {
    const result = { current: Number.isFinite(current) ? current : null };
    for (const [field, intervalMs] of Object.entries(INTERVALS)) {
      const target = now - intervalMs;
      const tolerance = intervalMs / 2;
      const match = findClosest(pastObservations, target, tolerance);
      const past = match ? extract(match) : null;
      const { absolute, percent } = deltaFor(
        Number.isFinite(current) ? current : null,
        past,
      );
      result[field] = {
        absolute,
        percent,
        direction: directionFor(percent),
      };
    }
    return result;
  }

  function trajectory(chainKey, address) {
    const observations = history(chainKey, address);
    // Fewer than two samples means there is nothing to compare. A
    // single observation is a snapshot, not a trajectory.
    if (observations.length < 2) return null;

    const current = observations[observations.length - 1];
    const past = observations.slice(0, -1);
    const now = current.observedAt;

    return {
      window: {
        from: observations[0].observedAt,
        to: now,
        sampleCount: observations.length,
      },
      concentration: {
        top10Pct: metricDelta(
          current.concentration?.top10Pct ?? null,
          past,
          now,
          (o) => o.concentration?.top10Pct ?? null,
        ),
      },
      liquidity: {
        usd: metricDelta(
          current.liquidity?.usd ?? null,
          past,
          now,
          (o) => o.liquidity?.usd ?? null,
        ),
      },
      holderCount: metricDelta(
        current.holderCount ?? null,
        past,
        now,
        (o) => o.holderCount ?? null,
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      computedAt: Date.now(),
    };
  }

  return {
    record,
    history,
    trajectory,
    clear,
    METHODOLOGY_VERSION,
    // Exposed for tests only.
    _internal: {
      key,
      prune,
      findClosest,
      deltaFor,
      directionFor,
      INTERVALS,
      RETENTION_MS,
      MAX_OBSERVATIONS,
      DIRECTION_THRESHOLD_PCT,
    },
  };
})();

console.log("[Observations] Module loaded.");
