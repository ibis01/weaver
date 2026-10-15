# Exploratory entry-timing comparison (not Gate 0b)

**Date:** 2026-10-15
**Status:** Exploratory observation, not a Gate 0b result

> **Retraction notice 2026-10-15.** This is not a Gate 0b result.
> The Gate 0b metric is `earlyEntryRate` as implemented in
> `js/intelligence/smart-money/wallet-profiler.js`: fraction of
> priced buys followed within 14 days by a >=20% price rise, over
> the wallet's full PEPE history, sample floor 10 priced buys,
> threshold 0.5.
>
> The metric measured in this document is an ad-hoc binary
> alternative invented mid-session: first in-window inflow within
> the first 25% of a 15-day window. It shares no numerator,
> denominator, horizon, or threshold with the real metric. The
> result is retained as an exploratory observation only.

**Treatment:** `data/pepe-buyer-list/v1.json` (27 buyers)
**Control:**   `data/control-candidates/v2.json` (80 candidates, 24 matched)
**Metric script:** `scripts/oneoff/gate-0b-early-entry-rate.js`
**Input data:** `data/entry-blocks/v1.json`
**Supersedes:** the retracted Gate 0b discrimination PASS of 2026-10-13
(`docs/audits/gate-0b-discrimination-result-2026-10-13.md`)

## Metric definition

Per wallet:
- `entryBlock` = first PEPE inflow in window [25710000, 25820000]
- `position` = (entryBlock − windowStart) / windowSpan
- `early` = 1 if position ≤ 0.25, else 0

Per population:
- `earlyEntryRate` = sum(early) / N

Knobs chosen before run (recorded here so they cannot be retrofitted):
- entry = first acquisition, any mechanism
- reference = window start
- threshold = 25% of window

## Populations

**Treatment:** 27 net-holder candidates from `data/pepe-net-holders-v1.json`
after: windowed net check, per-acquisition classification, and the hold
check (net ≥ 1M PEPE, out/in ratio ≤ 0.5). 24 of 27 entered the matched
analysis; two (inCount 16, 18) are outliers excluded per design v2; one
inCount=5 wallet was unmatched (only one such control found).

**Control:** 80 addresses from a 22-position stride sample across the
window, filtered to non-infrastructure recipients, then the same hold
check as treatment. 24 matched 1:1 to treatment on exact inCount.

## Result

| population | N | early | rate |
|---|---|---|---|
| treatment  | 24 | 1  | 0.0417 |
| control    | 24 | 9  | 0.3750 |

Difference = −0.3333. McNemar exact, discordant +1/−9, n=10,
two-sided p ≈ 0.0215.

**Direction is opposite to the hypothesis.** If "smart money buys early,"
treatment should show the higher early-entry rate. It shows the lower.

## Structural observations

1. **Control timing is bimodal.** Controls classified "early" cluster
   at position ≤ 0.14 (near window start). Controls classified "late"
   cluster near position ≥ 0.50. Few in the middle. Plausible cause:
   some controls were already PEPE-active before the window opened,
   so their first in-window inflow reflects ongoing activity, not a
   fresh entry.

2. **Window-end controls.** Five of the 80 controls have first-block
   at or within 10 blocks of `25820000` (position ≈ 1.000). These pass
   the net-positive filter trivially (no time to sell within window)
   and are not behaviorally comparable to a wallet that entered mid-
   window and held.

Neither observation is a defect in the metric — they are properties of
the control pool. Both suggest the control population, as constructed,
includes wallets whose "entry" is an artifact of the window boundary
rather than an economic decision.

## Interpretations, not yet decided

**A. The metric may not measure what Gate 0b intended.** "First inflow
within window" is not "bought before the pump" — there is no pump
reference in the current definition. A reference-anchored metric might
give a different answer.

**B. The treatment population may not have a timing edge.** The 27 are
clean net-buyers. That was the point of the derivation. It was never
established that they have skill. This run is the first test, and at
this metric and this n, they do not outperform controls on entry timing.

**C. The control pool may need tighter construction.** Requiring first
inflow in the middle 50% of the window would exclude both boundary
artifacts — pre-window-active wallets and window-end buyers — and
produce a control pool more structurally comparable to treatment.

The three are not mutually exclusive. No decision is recorded here.

## What is not being done

- No threshold sensitivity analysis (25% was chosen before the run;
  moving it now is overfitting).
- No expansion of the control pool to "find more early controls."
- No Gate 0b PASS/FAIL declaration.

This document records a state. The next session decides what to do
with it.

## Provenance

- Metric script: `scripts/oneoff/gate-0b-early-entry-rate.js`
- Entry block pull: `scripts/oneoff/pull-entry-blocks-v1.js`
- Buyer list: `data/pepe-buyer-list/v1.json`
- Control candidates: `data/control-candidates/v2.json`
- Entry blocks: `data/entry-blocks/v1.json`
- Control-1 design v2: `docs/designs/gate-0b-control-1-design-v2.md`
