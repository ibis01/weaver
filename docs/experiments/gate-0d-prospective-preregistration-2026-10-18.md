# Gate 0d — Prospective validation of the v2 buyer cohort

**Date:** 2026-10-18
**Status:** FROZEN. No parameters may change after commit.
**Supersedes:** All retrospective Gate 0b/0c designs.
**Motivation:** Gate 0c produced POSITIVE_SKILL_NARROW — signal
concentrated in August 2026 (selection month), no signal outside.
That cannot distinguish skill from selection coupling. Only
prospective data resolves the ambiguity.

## Frozen artifacts

At freeze, SHA-256 recorded for:
- data/pepe-buyer-list/v2.json
- scripts/oneoff/find-pepe-buyers-v5.js
- js/intelligence/smart-money/wallet-profiler.js
- this preregistration

## Freeze date

2026-10-18T00:00:00Z. No PEPE buy with block timestamp strictly
before this instant counts as prospective.

## Prediction rule

For every PEPE buy by any of the 49 frozen wallets after freeze:
- Predicted early = 14-day forward return will be >= +20%
- Every buy predicted early (testing whether cohort is skilled,
  not whether individual buy is)

## Buy definition

PEPE inflow to a frozen wallet where:
- Inflow came directly from Uniswap V2 pair 0xa43fe16908251ee70ef74718545e4fe6c5ccec9f
- Inflow in successful transaction
- Block timestamp strictly after freeze date

Same definition as Gate 0c for comparability. Aggregator-routed buys
excluded (known limitation).

## Price source

CoinGecko daily series, refreshed weekly. Free tier 365-day window
sufficient for 12-month tracking. If unavailable, buy recorded
unresolved (never as not-early).

## Collection cadence

Weekly (Sunday 00:00 UTC). Runs prospective-collect.js. Commits new
buys to data/prospective/buys.jsonl. State in state.json. Missed runs
resume from last scanned block (no gap).

## Negative control pool

All PEPE wallets with >=10 pair-swap buys during 2026, non-contract,
not tagged exchange/router/MEV, excluding the 49 frozen wallets.
Built once, cached to data/prospective/control-pool.json.

At verdict: 500 random cohorts of 49 wallets each, PRNG seed 20261018.

## Scoring

early = 1 if price at +14d / price at buy >= 1.20, else 0.
early_fraction = sum(early) / count(resolved).

## Stopping rule

Stop when EITHER:
- 200 resolved buys accumulated, OR
- 12 months elapsed (2027-10-18), OR
- 50 resolved buys AND 6 months elapsed

No interim analysis. Only the stopping-point verdict is computed.

## Verdict criteria (pre-registered)

The verdict is computed at whatever stopping trigger fires first
(200 buys, 12 months, or 50-buys-at-6-months) using all criteria
below. The 6-month trigger produces a valid verdict on the sample
available at that point — not a forced INCONCLUSIVE.

- SKILL_CONFIRMED: treatment early_fraction > 95th percentile of
  500 control cohorts
- SKILL_NOT_CONFIRMED: treatment early_fraction <= 95th percentile
- INCONCLUSIVE: <30 resolved buys at the stopping point, OR control
  pool <200 wallets, OR >=10% of buys unresolved

Rationale for the 30-buy floor: below 30 resolved buys, the
95th-percentile-vs-controls comparison has insufficient power to
distinguish a genuine effect from chance. Above 30, the verdict is
computed honestly on the available sample, even if n is smaller
than the 200-buy target.

## Amendment log

- 2026-10-18 (v1.1): Clarified stopping-rule / verdict interaction.
  Original text had INCONCLUSIVE threshold at <200-at-12-months,
  which would have made every stopping point except 200-buys
  INCONCLUSIVE by construction. Zero buys had been collected at
  amendment time. Freeze hashes must be re-recorded after this
  amendment (preregistration file hash changes).

## Expected outcome (pre-registered)

SKILL_NOT_CONFIRMED.

Research prior: Convexly's 8,656-wallet edge composite (in-sample
Spearman +0.514) produced OOS +0.111 below its +0.30 bar and -0.082
on refit. Retrospective signals in this domain rarely survive
properly controlled prospective tests. SKILL_NOT_CONFIRMED is
decision-grade information.

## What this does not claim

- Not that frozen wallets will buy PEPE in the tracking period.
  Inactive wallets contribute zero observations without bias.
- Not that cohort predicts price moves. Test is whether cohort's
  entry timing beats a random PEPE-buying cohort's.
- Not generalizability across tokens. PEPE-only.

## Rollback

State corruption recovery: restore state.json from git, delete
partial buys since last good commit, re-run collection from
restored state. All runs committed; any state recoverable.

## Changelog

- 2026-10-18: Initial freeze.
