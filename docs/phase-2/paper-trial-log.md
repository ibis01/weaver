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
