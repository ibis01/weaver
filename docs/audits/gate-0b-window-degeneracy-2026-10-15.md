# Gate 0b — Window degeneracy (2026-10-15)

**Status:** Gate 0b unrunnable on the current window. Not a population
problem, not a classifier problem. A test-period problem.

## Finding

The PEPE window [25710000, 25820000] = 2026-08-08 through 2026-08-23.

Using daily PEPE/USD closes (CoinGecko, range endpoint), the 14-day
forward return from each entry date:

| entry date | 14d fwd return | qualifies as "early" (>=20%)? |
|---|---|---|
| 2026-08-08 | +42.7% | yes |
| 2026-08-09 | +42.6% | yes |
| 2026-08-10 | +39.8% | yes |
| 2026-08-11 | +35.6% | yes |
| 2026-08-12 | +42.8% | yes |
| 2026-08-13 | +45.5% | yes |
| 2026-08-14 | +39.5% | yes |
| 2026-08-15 | +38.5% | yes |
| 2026-08-16 | +40.3% | yes |
| 2026-08-17 | +38.0% | yes |
| 2026-08-18 | +33.9% | yes |
| 2026-08-19 | +17.6% | no |
| 2026-08-20 | +14.4% | no |
| 2026-08-21 | -14.3% | no |
| 2026-08-22 | -11.0% | no |
| 2026-08-23 | -12.5% | no |

The transition from "early" to "not early" happens within the window.
Every date 08-08 through 08-18 is early; every date 08-19 through
08-23 is not.

## Consequence for the treatment population

All 27 buyers in data/pepe-buyer-list/v1.json entered between 08-08
and 08-18. Their earlyEntryRate under the real metric would be 1.0
(100%), regardless of any wallet-level property, because every entry
date qualifies.

Control population (data/control-candidates/v2.json) entered 08-09
through 08-23. 57 of 80 entered in the qualifying band; 23 did not.

The 100% vs 71% difference between treatment and control rates is
explained entirely by entry-date distribution. It is not evidence of
buyer skill, timing edge, or any wallet-level attribute.

## Why this invalidates Gate 0b on this data

The real Gate 0b metric (earlyEntryRate in
js/intelligence/smart-money/wallet-profiler.js) computes, per wallet,
the fraction of priced buys followed by a >=20% price rise within 14
days. On this window:

- Any wallet that bought before 08-19 scores 1.0
- Any wallet that bought after 08-19 scores 0.0
- A wallet's rate reflects when it traded, not how well it traded

There is no within-window variance in the outcome against which to
measure wallet-level discrimination. The metric is a date classifier
on this data.

## Relation to Attempt 1

Attempt 1 (docs/audits/gate-0b-attempt-1-result.md) measured
earlyEntryRate on gold-standard wallets with hundreds of PEPE buys
spread over a year. Their rates were 0.084–0.133 — not 1.0 — because
their buys spanned many price regimes, only a few of which preceded
pumps.

Our treatment wallets have 1–5 in-window buys, all within a single
pre-pump regime. The metric cannot behave the same way on the two
populations, because the two populations experience the metric at
different time-scales.

This is not a metric bug. It is a domain mismatch: the metric was
designed for long-history wallets and is being applied to short-
window wallets whose buys are regime-correlated.

## What this does not establish

- It does not establish that the buyer population is wrong.
- It does not establish that the metric is wrong for its intended use.
- It does not establish that PEPE buyers have or lack skill.

It establishes only that Gate 0b cannot be run on this window,
because the window has no in-period outcome variance.

## Prerequisites for a future Gate 0b

Either:

1. A window whose 14-day forward returns vary within the window —
   some days up, some down — so wallet-level differences can be
   measured against date-level differences; or

2. A regime-normalized metric: per wallet, the excess of its
   earlyEntryRate over the mean earlyEntryRate of the dates it traded
   on. That isolates wallet timing from market regime.

Neither is implemented. No decision recorded.

## Data

- Prices: /tmp/pepe-prices-range.json (CoinGecko range endpoint,
  1801 hourly points, 2026-08-01 through 2026-10-15)
- Entry blocks: data/entry-blocks/v1.json
- Treatment list: data/pepe-buyer-list/v1.json
- Control list: data/control-candidates/v2.json
