# Gate 0b — Control-1 Design v2

**Date:** 2026-10-15
**Status:** Decision recorded, population pending
**Supersedes:** docs/designs/gate-0b-control-1-design.md (2026-10-11)
**Predecessor:** docs/designs/production-roadmap-v1.md §Gate 0b v2 step 2

## Why v1 is superseded

Control-1 v1 matched controls to the gold-standard population on
PEPE buy count. The gold-standard population was falsified on
2026-10-13 (commit 799f885, docs/audits/windowed-net-check-2026-10-13.md):
16 of 20 were pass-throughs, 3 held dust nets, 1 was a net seller.
Their buy counts — {30, 463, 494, 758, 1276}, median 494 — are the
signature of routing infrastructure, not of buyers. Matching on a
variable that describes infrastructure produces a control that
resembles infrastructure.

The pair-matching *approach* from v1 is retained. The matching
variable is re-specified below.

## Treatment population

The 27 buyers in `data/pepe-buyer-list/v1.json`, derived
2026-10-15 by applying the hold check (net floor 1M PEPE,
out/in ratio ≤ 0.5) to the 31 NET_HOLDER candidates from
`data/pepe-net-holders-v1.json`, cross-checked against the
per-acquisition classification (v4).

This population has been falsification-tested against known cases:
6 clean buyers pass, 2 known traders fail. It is the first
defensible buyer population in the project.

`inCount` distribution across the 27:

| inCount | wallets |
|---------|---------|
|    1    |   12    |
|    2    |    7    |
|    3    |    3    |
|    4    |    1    |
|    5    |    2    |
|   16    |    1    |
|   18    |    1    |

## Decision

**Pair matching on exact `inCount`.**

Reasons:

- Exact integer match is well-defined on small counts; v1's
  ±30% band on a median of 494 is meaningless on a median of 2.
- The distribution is concentrated at 1–5, which is matchable.
- Wilcoxon signed-rank remains appropriate for matched pairs;
  n=27 gives more power than v1's n=5.
- Preserves v1's core statistical property: any difference in
  `earlyEntryRate` is not explained by acquisition count.

**Two outliers are excluded from the matched analysis:**

`0xc9f16b6c` (16-in) and `0x9f9820e5` (18-in). No plausible
control will match those counts exactly. Report them as
unmatched treatment cases alongside the primary result. Do not
force-match with a band; that reintroduces the v1 problem.

Primary analysis is therefore n=25 pairs.

## Control population

A fresh PEPE holder pull, filtered to:

- Net-positive over window 25710000–25820000
- `inCount` in {1, 2, 3, 4, 5} matching a treatment wallet
- Acquisition mechanism ≠ swap (received via transfer or claim),
  where the mechanism is determinable
- Excludes all 27 treatment addresses
- Excludes the 4 FAIL candidates from the 2026-10-14 run
  (`0xbdb3ba9f`, `0x0000…08a90`, `0xc5e9f816`, `0xd56fca51`) —
  these are traders, not held-position controls

If exact-count matching cannot be satisfied for a given treatment
wallet, that pair is dropped and the reduction is recorded. Do not
substitute a different-count control.

## Fallback

If the fresh pull cannot determine acquisition mechanism for a
sufficient number of controls, fall back to matching on exact
`inCount` alone without the mechanism filter, and record the
weakening. The Gate 0b result is then conditional on
acquisition-mechanism composition of the control pool.

## Requires

1. One fresh PEPE holder pull covering window 25710000–25820000
   with per-wallet transfer history. Sufficient to compute
   `inCount` and, where possible, acquisition mechanism.
2. Sorting by `inCount`.
3. For each of the 25 non-outlier treatment wallets, one control
   with exact `inCount`, filtered per above.

Blockscout PRO quota, same as prior pulls. Estimated cost: one
`tokentx` call per candidate wallet considered. Budget for
several hundred candidates to find 25 matched controls.

## Statistics

Wilcoxon signed-rank on 25 matched pairs of `earlyEntryRate`.
Outliers (`0xc9f16b6c`, `0x9f9820e5`) reported separately as
unmatched observations.

Decision threshold: as specified in the production roadmap,
unchanged.

## Provenance

- Falsification of gold-standard v2: commit 799f885,
  docs/audits/windowed-net-check-2026-10-13.md,
  data/pepe-net-holders-v1.json.
- Buyer population: data/pepe-buyer-list/v1.json.
- Prior control-1 design: docs/designs/gate-0b-control-1-design.md
  (superseded, retained for reasoning trail).