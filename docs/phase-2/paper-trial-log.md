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
