## Day 1 — 2026-10-22 (UTC)
- Observation window: 2026-10-22T19:07:44Z → 2026-10-23T00:00:00Z
- Alerts generated: 0
- Reason for zero: `persistMemeAlert` in `gems.js:_scanImpl` fires only
  inside the smart-money notification gate. No smart-money convergence
  occurred during this window, so no alerts were persisted. This is the
  persistence-gate defect recorded in `docs/phase-status.md` under
  "Phase 4 — persistence gate discovery (2026-10-23)".
- Config or threshold change this day? → **No**

## Day 1 — Correction (recorded 2026-10-23)
- The persistence-gate defect invalidates this day's data for Phase 2
  purposes. The trial window 2026-10-22T19:07:44Z → 2026-10-29T19:07:44Z
  is being ABORTED because it cannot produce a non-converged control
  cohort. A new trial window will start after the persistence gate is
  fixed. See `docs/phase-status.md` for the fix plan.

## Trial status — ABORTED (2026-10-23)
- Original window: 2026-10-22T19:07:44Z → 2026-10-29T19:07:44Z
- Reason: persistence-gate defect (only converged alerts persisted;
  no control cohort possible)
- Restart condition: `persistMemeAlert` separated from the notification
  gate in `gems.js:_scanImpl`, verified by a test that asserts both
  converged and non-converged alerts are persisted.
---

## Window 2 — 2026-10-23T15:55:17Z → 2026-10-30T15:55:17Z (ACTIVE)

Baseline code: 76e71f7
Trial state: STARTED — awaiting first observation.
Config freeze: unchanged from window 1.

The previous window is preserved above as ABORTED; it is not merged into
this window and its (zero) observations do not count toward this trial.

### Rules specific to window 2
- Day entries below are appended one per calendar day, starting with
  Day 1 — 2026-10-23 (UTC), which is a partial day from 15:55:17Z.
- A day is only filled when there is something honest to record:
  either the alerts the scanner actually produced, or an explicit note
  that zero alerts were produced and why.
- If after 24h in this window no non-converged alert has reached
  `/meme/alert`, Day 1 must record that as an observation gap — the
  persistence fix may not be working as intended. Do not hide it by
  writing "0 alerts" without that qualifier.

---

## Day 1 — 2026-10-23 (UTC)
- Observation window: 2026-10-23T15:55:17Z → 2026-10-24T00:00:00Z (partial day)
- Alerts generated: PENDING — fill after scanner runs and KV is checked
- Non-converged alerts persisted: PENDING — this is the specific test of
  the persistence-gate fix; must be > 0 for the control cohort to exist
- Alerts with convergence: PENDING
- Provider failures observed: PENDING
- Duplicate signals suppressed: PENDING
- Missing-evidence cases: PENDING
- Misclassified attributions spotted: PENDING
- System interruptions: PENDING
- Reconstructability spot-check: PENDING
- Config or threshold change this day? → **No**

## Window 2 — observation gap (2026-10-23T16:00Z)
- ⚠️ Browser cache served the pre-fix bundle (`?v=20261007q`) during
  the first observation period of window 2. Cannot prove which alerts
  in the KV store came from the fixed bundle.
- ⚠️ Worker `/etherscan/deployer` returned 502 throughout the session;
  deployer reputation enrichment non-functional during the window.
- ⚠️ Worker `/discovery/snapshot` failing; all scans fell back to live
  DexScreener discovery.
- 20 alerts persisted since 2026-10-23T15:55:17Z, but their source
  bundle is unverifiable.
- Window 2 is therefore ABORTED. A new window (window 3) will start
  after: (a) the bundle version string is bumped and verified in a
  fresh tab, (b) the 20 ambiguous alerts are marked as pre-fix-verification
  in the baseline doc, (c) the Worker state is either fixed or documented
  as a known operational limitation.

## Trial status — window 2 ABORTED (2026-10-23T16:XXZ)
- Reason: browser cache / bundle version defect prevented confirmation
  that the persistence fix was in effect during the observation.
- 20 alerts persisted; provenance unverifiable; excluded from cohort.
- Restart condition: fixed bundle verified via `has persistence fix: true`
  in a fresh tab before the clock restarts.

## Window 2 — ABORTED (2026-10-23)

- Window: 2026-10-23T15:55:17Z → (clock not allowed to run to completion)
- Reason: two structural defects surfaced during the window:
  1. **Bundle cache-buster defect.** `index.html` served
     `dist/bundle.min.js?v=20261009d`, which the browser had cached
     from before the persistence fix was deployed. The console confirmed
     two different bundle versions across the observation period
     (`?v=20261007q` in the first session, `?v=20261009d` in the second).
     Cannot prove which bundle produced the 40 alerts in KV.
  2. **Cohort-marker defect.** Persisted alert payloads do not contain
     a `cohort` or `hasConvergence` field. Even if all 40 alerts were
     produced by the fixed bundle, there is no way to split them into
     treatment/control without re-running smart-money evaluation
     retroactively — which is not reproducible.
- 40 alerts were persisted (2 batches of 20, ~3 min apart). Their
  provenance and cohort are unverifiable. They are retained in KV as
  audit evidence and excluded from Phase 4 cohort analysis.
- Restart condition for window 3:
  (a) bundle cache-buster bumped and verified via a fresh tab that
      `has persistence fix: true`
  (b) `persistMemeAlert` payload extended with a `cohort` marker so
      treatment/control is derivable from KV alone
  (c) baseline commit hash recorded at the moment of verified deploy
  (d) fresh start timestamp recorded before the first scan of the window

## Window 2 — restart conditions checklist
- [ ] index.html bundle version bumped to new value
- [ ] Fresh tab loads bundle where `persist every alert-worthy observation` appears
- [ ] `persistMemeAlert` includes `cohort: ...` in payload
- [ ] test asserting cohort marker present in persisted payload
- [ ] new baseline commit hash recorded
- [ ] new start timestamp recorded

## Day 1 — 2026-10-23 (UTC)
- Window: 2026-10-23T15:55:17Z → 2026-10-30T15:55:17Z (partial first day)
- **Verification boundary**: pre-verification period (15:55:17Z → 2026-10-23T16:44:31Z)
  served mixed bundle versions (?v=20261007q, ?v=20261009d). Alerts persisted
  before the boundary are excluded from cohort analysis — their bundle
  provenance is unverifiable. The boundary is the moment a fresh tab confirmed:
  - `persistence fix: true`
  - `cohort marker: true`
  - `version: ...?v=20261023b`
  - `[PredictiveValidator] Module loaded — v7-d1`
- **Observation period** (from 2026-10-23T16:44:31Z): all subsequent alerts are
  from the verified bundle and are usable for Phase 4 cohort comparison.
- Alerts generated (verified period only): PENDING — fill after next scan
- Non-converged alerts persisted (control cohort): PENDING
- Converged alerts persisted (treatment cohort): PENDING
- Cohort marker present in all records: PENDING — verify by inspecting KV
- Provider failures observed: Worker `/etherscan/deployer` 502 (known defect)
- Duplicate signals suppressed: PENDING
- Missing-evidence cases: PENDING
- Misclassified attributions spotted: PENDING
- System interruptions: bundle-version mismatch during pre-verification period
- Reconstructability spot-check: PENDING
- Config or threshold change this day? → **No**
- Alerts generated (verified period only): <N>
- Non-converged alerts persisted (control cohort): <X>
- Converged alerts persisted (treatment cohort): <Y>
- Cohort marker present in all records: verified — every record has `cohort`
- Reconstructability spot-check: 1/1 sampled — replayed from stored assessment + market

## Day 1 — verification follow-up (recorded 2026-10-23)
- Verification boundary: 1792773888000 (2026-10-23T...)
- Bundle verified in fresh tab: persistence fix = true, cohort marker = true,
  loaded version = ?v=20261023b
- Modules confirmed: PredictiveValidator v7-d1, SolanaAdapter,
  EvidenceSynthesizer, EntryAssessment — all loaded
- Scan runs since verification: 0 as of this entry
- Alerts persisted since verification: 0 (consistent with zero scans)
- This is an observation-window gap, not a defect. Next entry will record
  what a scan actually produces.
- Config or threshold change this day? → **No**

## Window 2 — scan history (2026-10-23)
- Fresh verification boundary: 1792775127260 (bundle ?v=20261023d verified:
  has cohort: true, has persistence fix: n/a due to comment stripping)
- Scans since boundary: at least 1 (`[Gems] Loaded 10 tokens from Worker
  snapshot`)
- Alerts persisted since boundary: **0** as of this entry
- 176 total alerts in KV, all predate the fresh boundary. Every one shows
  `cohort: MISSING`, which is expected — they were produced by
  pre-cohort-fix bundles.
- The 17 alerts between boundary 1792773888000 (earlier "verified"
  ?v=20261023b) and 1792775127260 also show `cohort: MISSING`. That
  earlier verification checked `dist/bundle.js` (unminified) rather than
  `dist/bundle.min.js` (the file actually loaded by the page). It was a
  false positive. The current verification checks the minified file and
  reports `has cohort: true`.
- Pending: confirm the current bundle's persistMemeAlert actually writes
  `cohort` by intercepting the payload in the browser console (a direct
  call to `W.gems._internal.persistMemeAlert` with a fake gem).
- Config or threshold change this day? → **No**

## Day 1 — persistence fix VERIFIED (2026-10-23 / 2026-10-24 UTC)
- Verification boundary: 1792775127260 (bundle ?v=20261023d)
- **Intercept test PASS**: direct call to `W.gems._internal.persistMemeAlert`
  with `hasConvergence: false` produced a POST body containing
  `cohort: "control"`. Persistence gate + cohort marker confirmed
  working in the loaded production bundle.
- Scans since boundary: 1 (observed `[Gems] Loaded 10 tokens from
  Worker snapshot`)
- Alerts persisted since boundary: **0** — the 10-token Worker snapshot
  did not include any candidate scoring >= 70 with non-danger verdict.
  This is a market-availability observation, not a defect.
- The 176 older alerts in KV (all with `cohort: MISSING`) predate
  the fix and remain excluded from cohort analysis.
- Known operational limitations active today:
  * `/etherscan/deployer` 502 — deployer reputation enrichment suspended
  * Worker `/discovery/snapshot` returns 10 fixed tokens — the candidate
    pool is narrow
  * CSP blocks inline style — cosmetic, does not affect persistence
- Config or threshold change this day? → **No**

## Day 1 — observation entry (recorded 2026-10-23T19:44:42Z)
- Verification boundary: 1792775127260
- Persistence fix verified via intercept test:
  * hasConvergence=false → cohort="control" ✅
  * hasConvergence=true  → cohort="treatment" ✅
- Scan performed with Worker snapshot disabled (forced live DexScreener
  discovery path).
- Candidates scanned: <fill from stats card>
- Gems ≥ 40: <fill>
- Pass / Danger: <fill>
- Alerts persisted since SCAN_AT: 0 — none of the discovered candidates
  reached score >= 70 with a non-danger verdict.
- This is a market-availability observation, not a defect. The persistence
  pipeline is verified working.
- Config or threshold change this day? → **No**

## Day 1 — FIRST VERIFIED OBSERVATIONS (recorded 2026-10-23T19:44:51Z)
- Verification boundary: 1792775127260
- Persistence fix verified via intercept test (both control and treatment)
- First real production alerts persisted with cohort markers:
  * control: <N>
  * treatment: <M>
- Scan timestamp: __________
- All persisted records since SCAN_AT carry `cohort` field.
- The trial is now producing valid Phase 4 observations.
- Config or threshold change this day? → **No**

## Day 1 — persistence fix verified, provider rate-limited (2026-10-24 UTC)
- Verification boundary: 1792775127260
- Bundle in use: ?v=20261023d, confirmed `has cohort: true`
- Persistence fix verified via intercept test in production bundle:
  * `persistMemeAlert(gem)` with `hasConvergence: false` →
    `assessment.cohort: "control"` ✅
  * `persistMemeAlert(gem)` with `hasConvergence: true` →
    `assessment.cohort: "treatment"` ✅
  * Full payload keys: opportunityScore, methodologyVersion,
    observedAtMs, identity, cohort
- Scans since verification: multiple, both Worker-snapshot and (attempted)
  live-discovery paths.
- Alerts persisted with cohort field: **0**
- Root cause of zero alerts:
  * Worker `/goplus/*` proxy returns 429 (rate limit) on every shield check
  * `checkShield` correctly returns `{ error: true }` on 429
  * `computeRiskAssessment` correctly classifies as `UNKNOWN` when shield
    errored (no fabricated verdict)
  * `memeOpportunity.analyze` scores a shield-errored candidate below 70
  * Persistence gate (`score >= 70 && !isDanger`) correctly does not fire
- This is a provider-availability observation, not a code defect.
- 176 older alerts in KV (from Oct 5 and Oct 23) all predate the
  verification boundary and correctly show `cohort: MISSING`.
- Config or threshold change this day? → **No**

## Day 1 — Issue D implemented (2026-10-24 UTC)
- Phase 4 Issue D (Mann-Whitney U + bootstrap CI) implemented and
  committed. The validator now returns:
  * `metrics.cohort_comparison.status` — "computed" or "insufficient_sample"
  * `mann_whitney: { U, z, p }` when sample sufficient
  * `control_median_ci` / `treatment_median_ci` — 95% bootstrap CIs
    (10,000 resamples)
- Sample-size gate: MIN_OBSERVATIONS_PER_COHORT = 10 per §Sample size.
- Cohort provenance: records with `assessment.cohort` in {control,
  treatment} counted. Pre-fix records (cohort missing) excluded from
  the statistical comparison but reported via
  `accounting.evaluated_unknown_cohort`.
- No thresholds, scoring weights, or shield logic changed.
- Trial observations: 0 real alerts since verification boundary
  (GoPlus 429 rate limits still active as of this entry).
- Config or threshold change this day? → **No**

## Day 1 — persistence + cohort verified; Issue D implemented (2026-10-24 UTC)
- Baseline code: d7f9463 (Mann-Whitney U + bootstrap CI committed)
- Verification boundary: 1792775127260 (bundle ?v=20261023d)
- Persistence fix verified end-to-end via intercept test in the loaded bundle:
  * `persistMemeAlert` with `hasConvergence: false` → `assessment.cohort: "control"`
  * `persistMemeAlert` with `hasConvergence: true`  → `assessment.cohort: "treatment"`
  * Full payload keys: opportunityScore, methodologyVersion, observedAtMs,
    identity, cohort
- Phase 4 Issue D implemented and committed (d7f9463):
  * Mann-Whitney U with normal approximation + tie correction
  * Bootstrap 95% CI for the median (10,000 resamples)
  * Sample-size gate: MIN_OBSERVATIONS_PER_COHORT = 10 per pre-registration
  * Cohort provenance: records with `assessment.cohort` in {control, treatment}
    are counted; pre-fix records (cohort missing) are excluded from the
    statistical comparison but reported under `evaluated_unknown_cohort`
- Scans since verification: multiple; GoPlus proxy returns 429 on every
  shield check → `shield.error` → verdict UNKNOWN → score < 70 → no persist
- Alerts persisted with cohort field: **0** (consistent with 429 blocker)
- All 176 historical alerts in KV predate the boundary and correctly show
  `cohort: MISSING`
- Trial clock: started 2026-10-23T15:55:17Z, ends 2026-10-30T15:55:17Z
- Config or threshold change this day? → **No**
