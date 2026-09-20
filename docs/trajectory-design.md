# Design — Trajectory observations

**Status:** draft, awaiting implementation
**Depends on:** `js/intelligence/market-structure.js`, `js/storage/storage.js`
**Blocks:** Market Structure v3 (change metrics), future holder growth analysis

## 1. Problem

`W.marketStructure.observe()` produces a single observation per scan:

```js
{
  concentration: { top10Pct, top10Wallets, status },
  liquidity: { usd, lpCount, lockedLpCount, status },
  flags: { mintable, honeypot, proxy, ownerRenounced, freezable, balanceMutable },
  holderCount,
  source,
  methodologyVersion,
  observedAt,
}
```

That observation describes the token **now**. It cannot answer:

- Is holder concentration rising or falling over the last hour?
- Is liquidity growing or draining?
- Is the holder count accelerating or plateauing?

Those are time-series questions. Answering them requires persisting
observations and computing deltas against the past. This document
specifies where those observations live, how they are pruned, and
how deltas are computed.

## 2. What the design must achieve

| Property | Meaning |
| :--- | :--- |
| **Bounded storage** | Cannot fill `localStorage` under any scan cadence. |
| **Chain-aware** | Same contract on two chains is two histories. |
| **Time-ordered** | Observations retrieved in the order they were recorded. |
| **Missing-data honest** | No history → `null` deltas, never fabricated. |
| **Idempotent writes** | Re-recording the same observation does not duplicate. |
| **Failure-isolated** | A storage error never breaks the Gem scan. |

## 3. Storage choice

Three candidates, with the tradeoff:

| Option | Pros | Cons |
| :--- | :--- | :--- |
| Extend `W.store` directly | Reuses existing key-value API | Mixes observation lifecycle into a generic store |
| New `js/storage/observations.js` module using `W.store` | Clean separation, own schema | One more module to load |
| IndexedDB (already stubbed in `storage.js`) | Larger quota | Async API, overkill for the retention window |

**Chosen: option 2.** A new module `js/storage/observations.js` that
uses `W.store` for persistence but owns the observation schema and
lifecycle. `storage.js` stays a generic key-value store and is not
modified.

Rationale:

- The retention policy is specific to observations and should not live
  in a generic store.
- `W.store` already handles `localStorage` quota fallback to `_memory`,
  which is exactly the degradation behavior we want.
- IndexedDB would work but introduces async/await across the whole scan
  path — a larger change than the value justifies for a first version.

## 4. Key structure

```
obs:<chain>:<normalizedAddress>
```

Normalization matches `shieldCacheKey`: EVM lowercased, Solana
case-preserved. Key prefix `obs:` is distinct from `shield_` (used by
`shield.js`) and from any other key namespace.

A single key holds an array of observations, oldest first:

```js
[
  { observedAt: 1758000000000, concentration: {...}, ... },
  { observedAt: 1758000300000, concentration: {...}, ... },
]
```

Single-key-per-token is simpler than one-key-per-observation:
retrieval is one read, pruning is one filter, and no range queries are
needed.

## 5. Retention policy

Two constraints, both applied on every write:

| Constraint | Value | Rationale |
| :--- | :--- | :--- |
| Time window | 2 hours | The longest delta target is 1h; 2h gives margin for one missed scan |
| Count cap | 30 observations | At a 5-minute scan cadence, 2h ≈ 24 observations. Cap at 30 absorbs bursts |

Pruning order:

1. Drop entries where `observedAt < now - 2h`.
2. If length still exceeds 30, drop the oldest entries until length ≤ 30.

At 30 observations per token and approximately 400–600 bytes per
serialized observation, one token's retained history is roughly 12–18
KB before JSON/key overhead. The 30-observation cap bounds per-token
history, while overall usage depends on the number of tracked tokens
and the browser's storage limits. The implementation must handle quota
failure through `W.store`'s existing fallback rather than relying on a
fixed quota assumption.

## 6. Public API

```js
W.observations.record(chainKey, address, observation)
```

Prunes the existing array, appends the new observation, saves. Returns
`true` on success, `false` on failure. Never throws.

```js
W.observations.history(chainKey, address)
```

Returns the pruned array of observations, oldest first. Returns `[]`
when no history exists. Never throws.

```js
W.observations.trajectory(chainKey, address)
```

Returns a structured delta summary or `null` when there is not enough
history to compute any delta:

```js
{
  window: { from, to, sampleCount },
  concentration: {
    top10Pct: {
      current, change5m, change15m, change1h,
      direction,  // "rising" | "falling" | "stable" | "unknown"
    },
  },
  liquidity: {
    usd: {
      current, change5m, change15m, change1h,
      direction,
    },
  },
  holderCount: {
    current, change5m, change15m, change1h,
    direction,
  },
  methodologyVersion: "trajectory-v1",
  computedAt: <timestamp>,
}
```

```js
W.observations.clear(chainKey, address)
```

Removes a token's history. Useful for tests and for a future "forget
this token" UI affordance.

## 7. Delta computation

For each target interval (5m, 15m, 1h) and each metric:

1. Compute `targetTime = now - interval`.
2. Find the observation whose `observedAt` is closest to `targetTime`.
3. Reject the match if its distance from `targetTime` exceeds
   **half the interval** (2.5m for 5m, 7.5m for 15m, 30m for 1h).
4. If no acceptable match, the delta is `null` — not zero.
5. If a match exists, compute `current - past` as an absolute delta,
   and `(current - past) / past` as a percentage when `past > 0`.

The "half interval" tolerance is the key policy decision. Without it, a
5-minute delta could be computed against an observation from 12 minutes
ago and be silently mislabeled. Half-interval tolerance means the delta
is honest about which window it actually measured.

`direction` is derived from the percentage delta:

```js
if (delta === null) direction = "unknown";
else if (Math.abs(deltaPct) < 2) direction = "stable";
else if (deltaPct > 0) direction = "rising";
else direction = "falling";
```

The 2% threshold is a presentational aid, not a significance claim.
Consumers must phrase output as "top 10 concentration rose 8%" rather
than "concentration is a problem" — the Shield high-risk predicate
remains the single authority for risk classification.

## 8. Failure modes

| Failure | Behavior |
| :--- | :--- |
| `localStorage` quota exceeded | `W.store.set` falls back to `_memory`; trajectory works for the session and resets on reload |
| Corrupt JSON in storage | `W.store.get` returns the fallback (`[]`); history treated as empty |
| Observation with `observedAt` in the future | Clamped to `now` on write, discarded if still invalid |
| Concurrent writes from two tabs | Last write wins; the array may lose one observation. Acceptable — history is best-effort |
| `W.marketStructure.observe()` returns `null` | `record()` is not called; no observation is written |
| No history to compute a delta | Field-level `null`, not zero |

The trajectory layer never throws and never breaks the caller. Errors
are logged once per session (matching the `warnedUnevaluable` pattern
in `track-record.js`) and suppressed after that.

## 9. Integration plan

**Step 1** — Add `js/storage/observations.js` with the four public
functions. Unit-test each in isolation. No consumers yet.

**Step 2** — Wire `W.observations.record()` into the Gem scan,
immediately after a successful `W.shield.check()` when the assessment
carries a `holders` block. Failures are logged and swallowed.

**Step 3** — Extend `W.marketStructure.summarise()` to accept a
trajectory object and append the change lines when present. The Gem
card render calls `W.observations.trajectory()` after `observe()` and
passes both to the summariser.

**Step 4** — Add the change metrics to the Evidence Drawer so the
"why" view shows the trajectory alongside the snapshot.

Each step is its own commit. Step 1 has no user-visible effect and
proves the module works. Step 2 collects data but renders nothing new
(the trajectory reads return `null` until history accumulates). Step 3
is the first user-visible change.

## 10. Open questions

These need answers before Step 2:

1. **Scan cadence.** `auto` mode runs every 5 minutes. A user who
   keeps the Gem page open for 10 minutes generates 2 observations per
   token. Is that enough signal for a 5m delta? If not, consider a
   shorter auto-scan interval or accept that deltas are sparse.

2. **Cross-tab behavior.** Two browser tabs running Gem scans
   concurrently will both write observations. The last write wins, and
   the array may lose one observation. Acceptable for v1, but should be
   documented in the module header.

3. **Snapshot inclusion.** When `W.trackRecord.createFromGemAlert()`
   captures a snapshot, should the current trajectory be included in
   `weaverSnapshot`? If yes, the snapshot becomes a richer historical
   record. If no, trajectory is ephemeral and not preserved. My
   recommendation: **yes, include it as a nested `trajectory` field** —
   the snapshot is exactly where a point-in-time trajectory belongs.
   But this is a schema change to the record shape and needs its own
   review.

4. **Methodology versioning.** If the delta computation changes (e.g.
   half-interval tolerance adjusted), should existing trajectory
   objects be invalidated? My recommendation: **no** — include
   `methodologyVersion: "trajectory-v1"` and let consumers decide.
   Historical trajectory data is not persisted by this module, so
   there's nothing to invalidate.

5. **Rate of change on the Gem score itself.** The existing `score()`
   produces a 0–100 gem score per pair. Should that also be tracked as
   a time series? My recommendation: **no for v1**. The gem score is a
   composite of many inputs and tracking it separately would need its
   own projection. Defer.

## 11. What this is not

- Not a predictive model. The trajectory describes what happened, not
  what will happen.
- Not a risk classifier. Direction labels (`rising` / `falling`) are
  descriptors, not judgments. Shield's `isHighRisk()` remains the
  single authority for risk classification.
- Not a persistence layer for the whole observation object beyond the
  retention window. Older observations are dropped; there is no
  archive.
- Not synchronized across devices. `localStorage` is per-origin,
  per-browser. A user on two browsers has two separate histories.

## 12. Implementation estimate

| Step | Files | Tests |
| :--- | :--- | :--- |
| 1. Observations module | `js/storage/observations.js` (new), `concat.js` (1 line) | `test/unit/observations.test.js` (~15 tests) |
| 2. Record on scan | `js/features/gems.js` (3 lines) | `test/unit/gems-observations.test.js` (~5 tests) |
| 3. Render trajectory | `js/intelligence/market-structure.js` (summarise extension), `js/features/gems.js` (render line) | `test/unit/market-structure-trajectory.test.js` (~8 tests) |
| 4. Drawer integration | `js/ui/evidence-drawer.js` | updates to existing provenance tests |

Step 1 is the design-critical one. The others are mechanical once the
module's contract is set.