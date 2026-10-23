# Phase Status — as of 2026-10-22T19:07:44Z

Baseline code: b45db6a
Baseline doc:  7d975ed

## Phase 0 — Foundation: PASS (pending re-verification)
- aw-nic-verify-v11.js previously reported 416 checks passed / 0 DIFF.
- Re-run the verifier at current HEAD before relying on this. If it no
  longer passes, downgrade to FAIL and fix in-phase.

## Phase 1 — Trustworthy signals: IN PROGRESS
- The six-attribution-state fix (9c18b9b) and the fail-explicit handling
  of provider errors and partial fetches partially satisfy Phase 1.
- The trial will exercise the remaining criteria.
- Not independently audited. NOT marked PASS.

## Phase 2 — Paper trial: STARTED 2026-10-22T19:07:44Z, ends 2026-10-29T19:07:44Z
- PASS requires paper-trial-report.md with real data and all six
  completion-checklist items ticked. Cannot be PASS before window close.

## Phase 3 — Smart-money: PARTIAL
- REJECTED attribution restored at 9c18b9b.
- Gate 0B evidence, reproducible candidate discovery, attribution
  validation against known examples, and convergence independence tests
  are not documented as verified.
- Downgraded from "✅ CLOSED" to PARTIAL.

## Phase 4 — Predictive validation: IN PROGRESS (infrastructure only)
- D1 snapshot layer + 24h-horizon validator + UI report shape exist.
- No pre-registered baseline, no walk-forward evaluation, no
  negative-outcome accounting. No performance claim is made.
- Validation BLOCKED pending sufficient D1 horizon coverage.

## Phase 5 — Reasoning layer: ONE SUB-STEP DONE
- Evidence synthesizer wired into thesis text generation (c07d617).
  Text-only; no decision-logic change.
- Completion criteria (uncertainty explicit, conflicting evidence
  reported, replay-from-evidence, AI cannot bypass deterministic checks)
  not yet verified.

## Phase 6 — Continuous learning: NOT STARTED

## Known deviations
- Branch protection on refs/heads/main bypassed on pushes from f2fcc79
  through 7d975ed (pull-request-required and test-and-build check not
  satisfied). No rule change made. Once threshold changes begin in
  Phase 6, PR discipline must be restored.

## Phase 4 — pre-registration interpretation note (2026-10-22)

The pre-registration's unit ("one alert = one observation") is
unambiguous for deduplication, but ambiguous for cohort analysis when
the scanner re-fires on the same token within a short window. Observed
in the 2026-10-05 batch: token
`12xjqnGsRxQHwWiTDETQxzUmrBgp4ARqWDKXQfjvpump` appears 6 times within
40 minutes. Two interpretations are possible; the evaluation report
must declare which it used:

  (A) Strict: each alertId is one observation.
  (B) Per-token-per-window: same token within 1 hour = one observation.

Also noted: the KV store currently contains 100 alerts from
2026-10-05, all of which predate the trial start (2026-10-22T19:07:44Z).
Whether they count toward the trial population is a similar open
question and must be declared in the evaluation report.

## Commit hygiene note — 2026-10-22
- Commit `cc1b797` was intended to remove js/features/shield.min.js and
  classify two Worker-only modules in the guard-fallback invariant, but
  it committed neither change. It included unrelated `assets/` edits and
  the (non-functional) reset additions to gems.js and test/setup.js.
- History is preserved per roadmap discipline; the actual fixes land in
  the follow-up commit.
- Once follow-up lands and `npm test` is green, branch protection can be
  re-enabled in the repository settings so this cannot recur.

## Phase 4 — persistence gate discovery (2026-10-23)
- `persistMemeAlert(g)` fires only inside the smart-money notification gate
  in `gems.js:_scanImpl`. Non-converged alerts are never persisted.
- Pre-registration §Control definition requires both converged and
  non-converged alerts to be recorded for the cohort comparison.
- Without non-converged alerts, Phase 4 has no control cohort and the
  pre-registered Mann-Whitney U test (Issue D) cannot be run honestly.
- Deferred to after the trial closes (2026-10-29T19:07:44Z) to preserve
  trial data consistency. Fix will split the persistence path from the
  notification path and be committed as:
    fix(phase-4): persist non-converged alerts to enable control cohort