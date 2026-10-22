# Phase 4 — Predictive Validation: Pre-Registration

Status: FROZEN
Frozen at commit: 552f38a
Frozen at (UTC): 2026-10-22T19:20:05Z
Frozen by: Ibismuh

This document is committed before any Phase 4 evaluation. It defines
the experiment so that later results cannot be tuned toward a favourable
outcome. Any subsequent change requires a new commit that supersedes
this file and records why.

## Hypothesis
Weaver gem alerts with a composite opportunity score ≥ T (see
`gems.js` default 40) and a smart-money convergence signal produce
a positive 24h net return (after liquidity-tiered costs) more often
than a matched control of alerts without smart-money convergence.

The hypothesis is FALSIFIED if the smart-money cohort's 24h net
return is not materially better than the control cohort's, or if
the difference does not survive stated costs and the stated
statistical test.

## Design
- Mode: Observational, cohort comparison on recorded alerts.
- Unit: One gem alert = one observation.
- Time window: alerts whose assessment timestamp is ≥24h before the
  evaluation date, so the 24h horizon is resolvable.
- Evaluation date: TBD (chosen ≥2026-10-29T19:07:44Z after Phase 2
  trial closes; chosen before inspecting any per-alert outcomes).

## Primary outcome measure
24h net return percentage, computed by `predictive-validator.js`
as:
  netReturnPct = (exitPrice * (1 - costPct) / entryPrice - 1) * 100

Where `exitPrice` is the D1 `price_snapshots` observation at
`observedAtMs + 24h ± 15m` (the validator's existing tolerance), and
`costPct` is the liquidity-tiered cost model already coded.

## Control definition
The control cohort is alerts in the same recording window where
`smartMoneySignal.hasConvergence !== true`. Both cohorts are subject
to the same cost model and the same outcome measure. This isolates
the smart-money signal from the general scoring effect.

## Sample size
- Minimum viable: 10 alerts in each cohort.
- If fewer than 10 per cohort exist at evaluation time, the study
  is INCONCLUSIVE — not PASS. No conclusion may be drawn, and the
  evaluation waits for more data.
- Reports of "results" with n < 10 per cohort are forbidden.

## Exclusions (applied before comparison, declared here)
- Alerts with `risk.verdict.key === "danger"` — excluded (the
  decision engine already rejects these; they never should have
  produced an alert).
- Alerts where the D1 snapshot at `+24h ± 15m` is missing —
  counted as UNRESOLVED, not as zero return, and reported
  separately.
- Alerts where the token was rugged or delisted within the
  24h window — counted as loss-of-100%, not excluded.

## Statistical test
- Non-parametric: Mann-Whitney U on the two net-return distributions.
- Significance threshold: p < 0.05 two-sided.
- A p ≥ 0.05 result means the hypothesis is NOT SUPPORTED — do not
  reinterpret it as "trending toward support."

## Reporting rules
- Report: n per cohort, median net return per cohort, win rate per
  cohort, rug rate per cohort, UNRESOLVED count, p-value,
  confidence interval (bootstrap, 10 000 resamples).
- Report negative findings prominently. A negative result is a
  valid, publishable outcome and is NOT to be softened.
- Do not report cumulative return without reporting per-cohort
  distribution.
- Explicitly state sample-size limitations and the observational
  (non-randomized) nature of the comparison.

## Reproduction
- Method: `predictive-validator.js` at commit 552f38a runs the
  outcome calculation; the pre-registration document defines the
  cohort split and the statistical test.
- A reviewer with access to the D1 database and the KV meme-alert
  store must be able to reproduce the reported numbers using only
  the frozen code at the stated commit and the rules above.

## What this document explicitly does NOT promise
- It does not claim Weaver has predictive ability.
- It does not claim results will be positive.
- It does not authorise any change to scoring, thresholds, or the
  decision engine based on the outcome.
- Any such change would be Phase 6 work and would itself require
  a separate pre-registered experiment.