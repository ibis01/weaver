> **SUPERSEDED 2026-10-15.** The gold-standard population was falsified
> on 2026-10-13 (commit 799f885, `docs/audits/windowed-net-check-2026-10-13.md`):
> 16 of 20 were pass-throughs, 3 held dust nets, 1 was a net seller.
> The buy-count distribution {30, 463, 494, 758, 1276} — median 494 —
> describes routing infrastructure, not buyers.
>
> The pair-matching approach is retained; the matching variable is
> re-specified in `docs/designs/gate-0b-control-1-design-v2.md`.
> This document is kept for reasoning trail only.

---

# Gate 0b — Control-1 Design

**Date:** 2026-10-11
**Status:** Decision recorded, population pending
**Predecessor:** docs/designs/production-roadmap-v1.md §Gate 0b v2 step 2

## Problem

Gate 0b v2 specifies control-1 as "sample-matched on PEPE buy count
within ±30% of the gold-standard median." The gold-standard buy counts
are {30, 463, 494, 758, 1276}, median 494. A ±30% band is 345–642.

PEPE's holder population in that band is small. Sampling 40 wallets
from it is unlikely to succeed. The requirement as written may be
unsatisfiable with the data we can pull.

## Options

**A. Pair matching.** For each of the 5 gold-standard wallets, select
the single PEPE holder with the closest buy count. Control-1 becomes
5 wallets, matched pairwise. Wilcoxon signed-rank test replaces
Mann-Whitney U.

**B. Distribution matching.** Sample 40 from all PEPE holders, then
reweight so the aggregate buy-count distribution matches gold-standard.
Requires more holders than we've pulled and a reweighting step.

**C. Stratification.** Split all controls into activity bands
(<100, 100–500, >500 buys). Compare gold-standard to the mid band.
No matching. Weakest statistically, cheapest to produce.

## Decision

**A.** Pair matching.

Reasons:
- Cleanest statistical property. Each gold-standard wallet has a
  control counterpart with comparable activity, so any difference in
  rate is not explained by trade-count.
- n=5 is small, but Wilcoxon signed-rank is designed for that case.
  The test is more powerful than Mann-Whitney U on matched pairs.
- The other two options either expand the population (B, requires
  fresh pulls) or weaken the comparison (C).

## Cost

- Control-1 becomes 5 wallets, not 40. Total control pool across
  both controls is 5 + 50 = 55. Adequate.
- Pair matching requires re-pulling PEPE holder data with trade
  counts, not just holdings. One clean pull.
- Blocked on Blockscout rate limits, same as the pattern check.

## Requires

1. One clean PEPE holder pull with `pepe_trade_count` per wallet.
2. Sorting by trade count.
3. For each gold-standard wallet, choose the control closest in
   count, excluding wallets already in any pool file.
